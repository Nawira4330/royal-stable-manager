/* ============================================================================
   Electron-Hauptprozess. Öffnet das Spiel in einem eigenen Fenster (Desktop-
   App), nicht im Browser. Der Renderer lädt index.html unverändert; der
   Spielstand liegt im localStorage des App-Fensters.
   ========================================================================== */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#14232c',
    title: 'Royal Stable Manager',
    autoHideMenuBar: true,          // Menüleiste ausblenden (Alt zeigt sie)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenuBarVisibility(false);

  // Externe Links (falls mal welche dazukommen) im echten Browser öffnen.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

// Schlankes Menü: nur das Nötigste (Neu laden, Vollbild, Beenden, DevTools).
function buildMenu() {
  const template = [
    {
      label: 'Spiel',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'togglefullscreen', label: 'Vollbild' },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'resetZoom', label: 'Zoom zurücksetzen' },
        { role: 'zoomIn', label: 'Größer' },
        { role: 'zoomOut', label: 'Kleiner' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
