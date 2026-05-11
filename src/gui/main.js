// gui/main.js — Electron 主进程 (ESM)
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatEngine } from './core/chat.js';
import {
  listSessions,
  createSession,
  switchSession,
  getCurrentSessionId,
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

  // ===== 聊天 =====
  ipcMain.handle('chat:history', () => {
    return chatEngine.getHistory();
  });

  ipcMain.on('chat:send', async (event, userInput) => {
    const onChunk = (data) => event.sender.send('chat:chunk', data);
    const onStreamStart = () => event.sender.send('chat:stream_start');
    const onStreamEnd = () => event.sender.send('chat:stream_end');
    const onTool = (data) => event.sender.send('chat:tool', data);
    const onDone = () => {
      event.sender.send('chat:done');
      cleanup();
    };
    const onAborted = () => {
      event.sender.send('chat:aborted');
      cleanup();
    };
    const onError = (data) => {
      event.sender.send('chat:error', data);
      cleanup();
    };

    const cleanup = () => {
      chatEngine.off('chunk', onChunk);
      chatEngine.off('stream_start', onStreamStart);
      chatEngine.off('stream_end', onStreamEnd);
      chatEngine.off('tool', onTool);
      chatEngine.off('done', onDone);
      chatEngine.off('aborted', onAborted);
      chatEngine.off('error', onError);
    };

    chatEngine.on('chunk', onChunk);
    chatEngine.on('stream_start', onStreamStart);
    chatEngine.on('stream_end', onStreamEnd);
    chatEngine.on('tool', onTool);
    chatEngine.on('done', onDone);
    chatEngine.on('aborted', onAborted);
    chatEngine.on('error', onError);

    chatEngine.sendMessage(userInput);
  });

  ipcMain.on('chat:abort', () => {
    chatEngine.abort();
  });

  // ===== 会话管理 =====
  ipcMain.handle('session:list', () => {
    return listSessions();
  });

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
    if (!result.error) {
      chatEngine.reloadSession();
    }
    return result;
  });

  // ===== 工作目录 =====
  ipcMain.handle('workdir:get', () => {
    return getWorkDir();
  });

  ipcMain.handle('workdir:set', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择工作目录',
    });
    if (result.canceled || !result.filePaths.length) return null;
    const dir = result.filePaths[0];
    setWorkDir(dir);
    return dir;
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
