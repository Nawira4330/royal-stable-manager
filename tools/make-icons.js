/* Erzeugt die App-Icons fuer die Handy-Installation (PWA) und das Favicon.
   Zeichnet das 🐴-Motiv auf dem Navy-Ton der Kopfzeile mit Canvas und
   rastert es ueber ein unsichtbares Electron-Fenster zu PNG.

   Aufruf:  npm run icons      (laedt Electron bei Bedarf via get-electron.js)
   Ausgabe: icons/*.png , favicon.png */
'use strict';
const fs = require('fs');
const path = require('path');

// Nicht in Electron gestartet -> Electron sicherstellen und darunter neu starten.
if (!process.versions.electron) {
  require('./get-electron.js'); // provisioniert synchron
  const exe = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  require('child_process').execFileSync(exe, [__filename], { stdio: 'inherit' });
  process.exit(0);
}

const { app, BrowserWindow } = require('electron');
const OUT = path.join(__dirname, '..', 'icons');
const NAVY = '#14232c';

// HTML mit Canvas: fuellt den Navy-Hintergrund randlos und setzt das Emoji
// mittig; `pad` verkleinert nur das Motiv (fuer die Android-Maskenzone),
// `round` klippt die Ecken abgerundet.
function page(size, opts) {
  const pad = opts.pad || 0;
  const radius = opts.round ? Math.round(size * 0.22) : 0;
  const motif = size - 2 * pad;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8">
<body style="margin:0"><canvas id="c" width="${size}" height="${size}"></canvas>
<script>
const s=${size}, r=${radius}, ctx=document.getElementById('c').getContext('2d');
if(r>0){ctx.beginPath();ctx.moveTo(r,0);ctx.arcTo(s,0,s,s,r);ctx.arcTo(s,s,0,s,r);ctx.arcTo(0,s,0,0,r);ctx.arcTo(0,0,s,0,r);ctx.closePath();ctx.clip();}
ctx.fillStyle=${JSON.stringify(NAVY)};ctx.fillRect(0,0,s,s);
ctx.font=(${motif}*0.78)+'px "Segoe UI Emoji","Noto Color Emoji",sans-serif';
ctx.textAlign='center';ctx.textBaseline='middle';
ctx.fillText('\\uD83D\\uDC0E', s/2, s/2 + s*0.02);
window.__png=document.getElementById('c').toDataURL('image/png');
</script></body>`);
}

const SPECS = [
  { file: 'icons/icon-192.png', size: 192, round: true },
  { file: 'icons/icon-512.png', size: 512, round: true },
  { file: 'icons/icon-maskable-512.png', size: 512, pad: 128 }, // Motiv in der inneren Android-Sicherheitszone
  { file: 'icons/apple-touch-icon-180.png', size: 180 },        // iOS rundet selbst, keine Transparenz
  { file: 'favicon.png', size: 32, round: true },
];

app.on('ready', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  for (const spec of SPECS) {
    await win.loadURL(page(spec.size, spec));
    const dataUrl = await win.webContents.executeJavaScript('window.__png');
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(__dirname, '..', spec.file), buf);
    console.log('  ' + spec.file + '  (' + buf.length + ' B)');
  }
  console.log('Icons erzeugt.');
  app.exit(0);
});
