// gui/preload.cjs — 安全桥接（contextBridge）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ctrl', {
  // ===== 聊天 =====
  getHistory: () => ipcRenderer.invoke('chat:history'),

  send: (text) => ipcRenderer.send('chat:send', text),

  abort: () => ipcRenderer.send('chat:abort'),

  onChunk: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('chat:chunk', handler);
    return () => ipcRenderer.off('chat:chunk', handler);
  },
  onStreamStart: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('chat:stream_start', handler);
    return () => ipcRenderer.off('chat:stream_start', handler);
  },
  onStreamEnd: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('chat:stream_end', handler);
    return () => ipcRenderer.off('chat:stream_end', handler);
  },
  onTool: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('chat:tool', handler);
    return () => ipcRenderer.off('chat:tool', handler);
  },
  onInfo: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('chat:info', handler);
    return () => ipcRenderer.off('chat:info', handler);
  },
  onDone: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('chat:done', handler);
    return () => ipcRenderer.off('chat:done', handler);
  },
  onAborted: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('chat:aborted', handler);
    return () => ipcRenderer.off('chat:aborted', handler);
  },
  onError: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('chat:error', handler);
    return () => ipcRenderer.off('chat:error', handler);
  },

  // ===== 会话管理 =====
  listSessions: () => ipcRenderer.invoke('session:list'),
  getCurrentSession: () => ipcRenderer.invoke('session:current'),
  newSession: (name) => ipcRenderer.invoke('session:new', name),
  switchSession: (id) => ipcRenderer.invoke('session:switch', id),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', id),

  // ===== 工作目录 =====
  getWorkDir: () => ipcRenderer.invoke('workdir:get'),
  setWorkDir: () => ipcRenderer.invoke('workdir:set'),

  // ===== 窗口 =====
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
});
