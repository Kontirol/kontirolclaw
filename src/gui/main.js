// gui/main.js — Electron 主进程 (ESM)
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatEngine } from './core/chat.js';
import {
  listSessions,
  createSession,
  switchSession,
  deleteSession,
  loadCurrentSession,
} from '../memory/sessions.js';
import { getWorkDir, setWorkDir } from '../tools/executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let chatEngine = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 680,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function setupIPC() {
  chatEngine = new ChatEngine();

  // ===== 聊天 — 每次 send 都重新绑定，防止旧 listener 残留 =====
  ipcMain.on('chat:send', (_event, userInput) => {
    // 移除上一次可能残留的的全部监听器
    chatEngine.removeAllListeners('chunk');
    chatEngine.removeAllListeners('stream_start');
    chatEngine.removeAllListeners('stream_end');
    chatEngine.removeAllListeners('tool');
    chatEngine.removeAllListeners('info');
    chatEngine.removeAllListeners('done');
    chatEngine.removeAllListeners('aborted');
    chatEngine.removeAllListeners('error');

    const sender = _event.sender;

    chatEngine.on('chunk', (data) => sender.send('chat:chunk', data));
    chatEngine.on('stream_start', () => sender.send('chat:stream_start'));
    chatEngine.on('stream_end', () => sender.send('chat:stream_end'));
    chatEngine.on('tool', (data) => sender.send('chat:tool', data));
    chatEngine.on('info', (data) => sender.send('chat:info', data));
    chatEngine.on('done', () => {
      sender.send('chat:done');
      chatEngine.removeAllListeners('chunk');
      chatEngine.removeAllListeners('stream_start');
      chatEngine.removeAllListeners('stream_end');
      chatEngine.removeAllListeners('tool');
      chatEngine.removeAllListeners('info');
      chatEngine.removeAllListeners('done');
      chatEngine.removeAllListeners('aborted');
      chatEngine.removeAllListeners('error');
    });
    chatEngine.on('aborted', () => {
      sender.send('chat:aborted');
      chatEngine.removeAllListeners('chunk');
      chatEngine.removeAllListeners('stream_start');
      chatEngine.removeAllListeners('stream_end');
      chatEngine.removeAllListeners('tool');
      chatEngine.removeAllListeners('info');
      chatEngine.removeAllListeners('done');
      chatEngine.removeAllListeners('aborted');
      chatEngine.removeAllListeners('error');
    });
    chatEngine.on('error', (data) => {
      sender.send('chat:error', data);
      chatEngine.removeAllListeners('chunk');
      chatEngine.removeAllListeners('stream_start');
      chatEngine.removeAllListeners('stream_end');
      chatEngine.removeAllListeners('tool');
      chatEngine.removeAllListeners('info');
      chatEngine.removeAllListeners('done');
      chatEngine.removeAllListeners('aborted');
      chatEngine.removeAllListeners('error');
    });

    chatEngine.sendMessage(userInput);
  });

  ipcMain.on('chat:abort', () => {
    chatEngine.abort();
  });

  // ===== 历史 =====
  ipcMain.handle('chat:history', () => {
    return chatEngine.getHistory();
  });

  // ===== 会话管理 =====
  ipcMain.handle('session:list', () => listSessions());

  ipcMain.handle('session:current', () => {
    const { session } = loadCurrentSession();
    return session;
  });

  ipcMain.handle('session:new', (_event, name) => {
    const result = createSession(name);
    chatEngine.reloadSession();
    return result;
  });

  ipcMain.handle('session:switch', (_event, idOrName) => {
    const result = switchSession(idOrName);
    if (!result.error) chatEngine.reloadSession();
    return result;
  });

  ipcMain.handle('session:delete', (_event, idOrName) => {
    const result = deleteSession(idOrName);
    if (result.startsWith('✅')) chatEngine.reloadSession();
    return result;
  });

  // ===== 工作目录 =====
  ipcMain.handle('workdir:get', () => getWorkDir());

  ipcMain.handle('workdir:set', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择工作目录',
    });
    if (result.canceled || !result.filePaths.length) return null;
    setWorkDir(result.filePaths[0]);
    return result.filePaths[0];
  });

  // ===== 窗口控制 =====
  ipcMain.on('window:minimize', () => mainWindow.minimize());
  ipcMain.on('window:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow.close());
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
