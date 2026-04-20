const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// electron-updater is only available in packaged builds — wrap in try/catch
// so running `npx electron .` during dev still works.
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) { /* not installed in dev */ }

let mainWindow = null;
let tray = null;

// In portable mode, store data next to the exe so it moves with it
const DATA_PATH = process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'claude-usage-data.json')
  : path.join(app.getPath('userData'), 'usage.json');

const DEFAULT_DATA = {
  session: { percentage: 0, resetMinutes: 0 },
  allModels: { percentage: 0, resetText: null },
  sonnetOnly: { percentage: 0, resetText: null },
  cycleLengthDays: 7,
  lastUpdated: new Date().toISOString()
};

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function loadUsage() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    // error('Failed to load usage data:', e);
  }
  return { ...DEFAULT_DATA };
}

function saveUsage(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    // error('Failed to save usage data:', e);
  }
}

function createTrayIcon() {
  // Create a simple 16x16 colored icon programmatically
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x - size / 2 + 0.5;
      const cy = y - size / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist <= size / 2 - 1) {
        canvas[i] = 0xd4;     // R
        canvas[i + 1] = 0xa5; // G
        canvas[i + 2] = 0x74; // B
        canvas[i + 3] = 255;  // A
      } else if (dist <= size / 2) {
        canvas[i] = 0x90;
        canvas[i + 1] = 0x70;
        canvas[i + 2] = 0x50;
        canvas[i + 3] = 180;
      } else {
        canvas[i + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 440,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Prevent maximize on double-click of title bar
  mainWindow.on('maximize', () => {
    mainWindow.unmaximize();
  });

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Claude Usage Monitor');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Hide', click: () => { mainWindow.hide(); } },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => checkForUpdatesManually() },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const EXTRACT_SCRIPT = `
  (function() {
    var text = document.querySelector('main') ? document.querySelector('main').innerText : document.body.innerText;
    var sessionMatch = text.match(/Current session\\s*\\n+\\s*Resets in (\\d+) hr (\\d+) min\\s*\\n+\\s*(\\d+)%\\s*used/);
    var allModelsMatch = text.match(/All models\\s*\\n+\\s*Resets ([A-Za-z]+ \\d+:\\d+ (?:AM|PM))\\s*\\n+\\s*(\\d+)%\\s*used/);
    var sonnetMatch = text.match(/Sonnet only\\s*\\n+\\s*Resets ([A-Za-z]+ \\d+:\\d+ (?:AM|PM))\\s*\\n+\\s*(\\d+)%\\s*used/);
    return {
      session: sessionMatch ? parseInt(sessionMatch[3]) : null,
      sessionResetHours: sessionMatch ? parseInt(sessionMatch[1]) : null,
      sessionResetMinutes: sessionMatch ? parseInt(sessionMatch[2]) : null,
      allModels: allModelsMatch ? parseInt(allModelsMatch[2]) : null,
      allModelsResetText: allModelsMatch ? allModelsMatch[1] : null,
      sonnetOnly: sonnetMatch ? parseInt(sonnetMatch[2]) : null,
      sonnetOnlyResetText: sonnetMatch ? sonnetMatch[1] : null
    };
  })()
`;

let syncInProgress = false;

function syncUsageFromClaude() {
  if (syncInProgress) return Promise.reject(new Error('Sync already in progress'));
  syncInProgress = true;

  return new Promise((resolve, reject) => {
    let win;
    try {
      win = new BrowserWindow({
        width: 600,
        height: 500,
        show: false,
        skipTaskbar: true,
        webPreferences: {
          partition: 'persist:claude-sync',
          contextIsolation: true,
          nodeIntegration: false
        }
      });
    } catch (e) {
      syncInProgress = false;
      return reject(new Error('Failed to create sync window'));
    }

    let settled = false;
    let pollTimer = null;
    let pollCount = 0;

    function finish(err, result) {
      if (settled) return;
      settled = true;
      syncInProgress = false;
      if (pollTimer) clearInterval(pollTimer);
      clearTimeout(timeout);
      if (win && !win.isDestroyed()) win.destroy();
      if (err) reject(err);
      else resolve(result);
    }

    const timeout = setTimeout(() => {
      finish(new Error('Sync timed out. Log into Claude in the popup window and try again.'));
    }, 60000);

    function startPolling() {
      pollTimer = setInterval(async () => {
        if (settled || !win || win.isDestroyed()) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        pollCount++;
        try {
          const result = await win.webContents.executeJavaScript(EXTRACT_SCRIPT);
          if (result.allModels !== null || result.session !== null) {
            finish(null, result);
          } else if (pollCount >= 5 && !win.isVisible()) {
            // Probably on login page — show window and flash taskbar
            win.setSkipTaskbar(false);
            win.show();
            win.setAlwaysOnTop(true);
            win.flashFrame(true);
          }
        } catch (e) {
          // Page navigating — expected, keep polling
        }
      }, 3000);
    }

    win.on('closed', () => {
      finish(new Error('Sync window was closed before data was read'));
    });

    win.loadURL('https://claude.ai/settings/usage')
      .then(() => setTimeout(startPolling, 4000))
      .catch(() => finish(new Error('Failed to load claude.ai')));
  });
}

app.whenReady().then(() => {
  // IPC handlers
  ipcMain.handle('load-usage', () => loadUsage());
  ipcMain.handle('save-usage', (_event, data) => {
    saveUsage(data);
    return true;
  });
  ipcMain.handle('sync-usage', async () => {
    try {
      const fresh = await syncUsageFromClaude();
      return { ok: true, data: fresh };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.on('close-window', () => {
    if (mainWindow) {
      app.isQuitting = true;
      app.quit();
    }
  });
  ipcMain.on('minimize-to-tray', () => {
    if (mainWindow) mainWindow.hide();
  });

  createWindow();
  createTray();
  setupAutoUpdater();
});

async function checkForUpdatesManually() {
  if (!autoUpdater || !app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates only work in the installed version.',
      detail: 'You are running the widget from source (dev mode).'
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Up to Date',
        message: `You are running the latest version (${app.getVersion()}).`
      });
    }
    // If there IS an update, update-downloaded will fire and the normal prompt will show
  } catch (e) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates.',
      detail: e.message || 'Unknown error'
    });
  }
}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.on('update-downloaded', (info) => {
    // Prompt user to install the update
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Claude Usage Monitor ${info.version} has been downloaded.`,
      detail: 'Install now to apply the update (the widget will restart).',
      buttons: ['Install Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    });
    if (result === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', () => { /* silent — network errors are fine */ });

  // Check on startup and every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
