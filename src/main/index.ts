import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerDbIpc, closeDb } from './db-service';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '报价送货系统',
    show: false, // ready-to-show 后再显示，避免白屏闪烁
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // dev 用 vite 起的 URL，打包后加载本地 html
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerDbIpc(); // 注册 DB IPC 通道
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});
