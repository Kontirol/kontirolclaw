const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Agent } = require('./agent');
const { getConfig } = require('./config');
const sessions = require('./memory/sessions');

function activate(context) {
  const provider = new CtrlViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('ctrl.chatView', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ctrl.openChat', () => vscode.commands.executeCommand('ctrl.chatView.focus'))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ctrl.newSession', () => provider.newSession())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ctrl.clearHistory', () => provider.clearHistory())
  );
}

class CtrlViewProvider {
  constructor(context) {
    this.context = context;
    this.view = null;
    this.agent = null;
    // 流式 diff 状态：{ uri, oldContent, prevContent }
    this._streamState = null;
    this._initAgent();
  }

  _initAgent() { this.agent = new Agent(getConfig()); }

  _getWorkspaceRoot() {
    const f = vscode.workspace.workspaceFolders;
    return (f && f.length > 0) ? f[0].uri.fsPath : process.cwd();
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'webview')]
    };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage(async msg => await this.handleMessage(msg));
    webviewView.onDidDispose(() => { this.view = null; });
    this._sendSessionInfo();
  }

  _sendSessionInfo() {
    this.postMessage({ type: 'sessions_update', sessions: sessions.listSessions(), currentId: sessions.getCurrentSessionId() });
  }

  getHtml() {
    const p = path.join(this.context.extensionPath, 'webview', 'chat.html');
    let html = fs.readFileSync(p, 'utf-8');
    const cssUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.css'));
    const jsUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'chat.js'));
    return html.replace('${cssUri}', cssUri.toString()).replace('${jsUri}', jsUri.toString());
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case 'chat': {
        if (!msg.text?.trim()) return;
        this.postMessage({ type: 'user_message', text: msg.text });
        const cfg = getConfig();
        if (!cfg.apiKey) { this.postMessage({ type: 'error', message: '请先配置 ctrl.apiKey' }); return; }
        if (!this.agent) this._initAgent();

        try {
          await this.agent.run(msg.text, {
            onChunk: t => this.postMessage({ type: 'chunk', text: t }),
            onReasoning: t => this.postMessage({ type: 'reasoning', text: t }),
            onToolCall: (name, args) => this.postMessage({ type: 'tool_call', name, args }),
            onToolResult: (name, r) => this.postMessage({ type: 'tool_result', name, result: r?.slice(0, 300) }),

            // 流式 create_file：AI 还在生成参数 → 实时打开 diff 并写入
            onStreamCreate: async (filename, content) => {
              await this._handleStreamCreate(filename, content);
            },

            onDone: () => {
              this._streamState = null; // 清理流式状态
              this.postMessage({ type: 'done' });
              this._sendSessionInfo();
            },
            onError: e => { this._streamState = null; this.postMessage({ type: 'error', message: e.message }); }
          });
        } catch (e) { this._streamState = null; this.postMessage({ type: 'error', message: e.message }); }
        break;
      }
      case 'abort': if (this.agent) this.agent.abort(); break;
      case 'list_sessions': this._sendSessionInfo(); break;
      case 'create_session':
        sessions.createSession(msg.name || null); this._initAgent();
        this.postMessage({ type: 'session_reset' }); this._sendSessionInfo(); break;
      case 'switch_session': {
        const s = sessions.switchSession(msg.id);
        if (!s) { this.postMessage({ type: 'error', message: '未找到会话' }); return; }
        this._initAgent(); this.postMessage({ type: 'session_reset' }); this._sendSessionInfo(); break;
      }
      case 'delete_session': {
        const r = sessions.deleteSession(msg.id);
        if (!r) { this.postMessage({ type: 'error', message: '未找到会话' }); return; }
        if (r.error) { this.postMessage({ type: 'error', message: r.error }); return; }
        this._initAgent(); this.postMessage({ type: 'session_reset' }); this._sendSessionInfo(); break;
      }
    }
  }

  // ===== 流式 diff 核心 =====
  async _handleStreamCreate(filename, content) {
    const root = this._getWorkspaceRoot();
    const fullPath = path.resolve(root, filename);
    const uri = vscode.Uri.file(fullPath);

    // 第一次：打开 diff
    if (!this._streamState || this._streamState.filename !== filename) {
      const isNew = !fs.existsSync(fullPath);
      const oldContent = isNew ? '' : fs.readFileSync(fullPath, 'utf-8');

      // 确保目录存在
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // 临时旧文件
      const tmpDir = path.join(os.tmpdir(), 'ctrl-diff');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const oldFile = path.join(tmpDir, path.basename(filename) + '.old');
      fs.writeFileSync(oldFile, oldContent, 'utf-8');

      // 清空实际文件
      fs.writeFileSync(fullPath, '', 'utf-8');

      // 打开 diff
      const title = `${filename} ${isNew ? '(Ctrl: 新建)' : '(Ctrl: 旧 → 新)'}`;
      await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(oldFile), uri, title);

      this._streamState = {
        filename,
        uri,
        oldContent,
        prevContent: ''
      };
    }

    // 更新 diff 右侧内容（替换，因为部分 JSON 可能不完整需要整体替换）
    if (content !== this._streamState.prevContent) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        // 替换整个文档
        const lastLine = doc.lineCount - 1;
        const lastChar = doc.lineAt(lastLine).text.length;
        if (lastLine > 0 || lastChar > 0) {
          edit.replace(uri, new vscode.Range(0, 0, lastLine, lastChar), content);
        } else {
          edit.insert(uri, new vscode.Position(0, 0), content);
        }
        await vscode.workspace.applyEdit(edit);
        this._streamState.prevContent = content;
      } catch { /* 忽略编辑冲突 */ }
    }
  }

  postMessage(msg) { if (this.view) this.view.webview.postMessage(msg); }

  newSession() {
    sessions.createSession(null); this._initAgent();
    this.postMessage({ type: 'session_reset' }); this._sendSessionInfo();
  }
  clearHistory() {
    if (this.agent) this.agent.clearHistory();
    this.postMessage({ type: 'history_cleared' }); this._sendSessionInfo();
  }
}

function deactivate() {}
module.exports = { activate, deactivate };
