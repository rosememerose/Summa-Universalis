const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('folio', {
  load: () => ipcRenderer.invoke('folio:load'),
  save: (data) => ipcRenderer.invoke('folio:save', data)
});
