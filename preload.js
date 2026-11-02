// גשר מצומצם ובטוח בין הממשק לבין מערכת הקבצים
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openPdfs: () => ipcRenderer.invoke('open-pdfs'),
  openImages: () => ipcRenderer.invoke('open-images'),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  saveAs: (defaultName, bytes) => ipcRenderer.invoke('save-as', { defaultName, bytes }),
  chooseFolder: (title) => ipcRenderer.invoke('choose-folder', title),
  writeFiles: (folder, files) => ipcRenderer.invoke('write-files', { folder, files }),
  listPdfs: (folder) => ipcRenderer.invoke('list-pdfs', folder),
  readAsset: (rel) => ipcRenderer.invoke('read-asset', rel),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  appVersion: () => ipcRenderer.invoke('app-version'),
  pathForFile: (file) => (webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : file.path),
  onOpenFiles: (cb) => ipcRenderer.on('open-files', (_e, paths) => cb(paths)),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, cmd) => cb(cmd)),
});
