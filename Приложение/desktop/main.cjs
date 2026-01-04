const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

let httpServer;

function startLocalServer(port = 4173) {
  const express = require('express');
  const compression = require('compression');

  const srv = express();
  srv.use(compression());

  // ---- Static фронтенд ----
  const distDir = path.resolve(__dirname, '..', 'dist');
  srv.use(express.static(distDir));

  // SPA fallback
  srv.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    try {
      const s = srv.listen(port, () => resolve({ server: s, port }));
      s.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Нам не нужен nodeIntegration; приложение работает как обычный веб.
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  win.loadURL(url);
}

async function bootstrap() {
  // В режиме разработки: если запущен Vite на 5173 — открываем его.
  // В собранной версии: поднимаем локальный сервер и открываем его.
  const isDev = !app.isPackaged;

  if (isDev) {
    createWindow('http://localhost:5173');
    return;
  }

  const distIndex = path.resolve(__dirname, '..', 'dist', 'index.html');
  const fs = require('fs');
  if (!fs.existsSync(distIndex)) {
    dialog.showErrorBox(
      'Не найден фронтенд',
      'Папка dist не найдена. Похоже, приложение собрано некорректно.\n\nПопробуйте пересобрать: npm run desktop:build',
    );
    app.quit();
    return;
  }

  try {
    const { server, port } = await startLocalServer(4173);
    httpServer = server;
    createWindow(`http://localhost:${port}`);
  } catch (e) {
    dialog.showErrorBox('Ошибка запуска', String(e?.message || e));
    app.quit();
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // На Windows закрываем приложение.
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    if (httpServer) httpServer.close();
  } catch {
    // ignore
  }
});
