const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Keep development and installed builds on the same local data directory.
app.setPath('userData', path.join(app.getPath('appData'), 'folio-notes'));

const dataFile = () => path.join(app.getPath('userData'), 'folio-data.json');
const readData = () => {
  try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch { return null; }
};
const writeData = (data) => {
  const target = dataFile();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(target + '.tmp', target);
  return true;
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1060, minHeight: 700,
    backgroundColor: '#080f1c', title: 'Summa Universalis', autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#080f1c', symbolColor: '#ffffff', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else if (!app.isPackaged && process.env.FOLIO_USE_DIST !== '1') win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle('folio:load', readData);
  ipcMain.handle('folio:save', (_event, data) => writeData(data));
  createWindow();
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', error => console.error('Update check failed:', error.message));
    autoUpdater.on('update-downloaded', info => {
      dialog.showMessageBox({
        type: 'info', title: 'Update ready',
        message: `Summa Universalis ${info.version} is ready.`,
        detail: 'Restart now to install the update. Your notes will remain unchanged.',
        buttons: ['Restart and update', 'Later'], defaultId: 0, cancelId: 1
      }).then(({ response }) => response === 0 && autoUpdater.quitAndInstall());
    });
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
  }
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
