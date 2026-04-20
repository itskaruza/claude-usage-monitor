const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadUsage: () => ipcRenderer.invoke('load-usage'),
  saveUsage: (data) => ipcRenderer.invoke('save-usage', data),
  syncUsage: () => ipcRenderer.invoke('sync-usage'),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray')
});
