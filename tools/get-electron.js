/* Stellt Electron fuer die Desktop-App bereit - ohne dass Electron dauerhaft
   im Projektordner (und in der OneDrive-Sync) liegen muss und unabhaengig von
   npm-Installations-Skripten, die neuere npm-Versionen standardmaessig
   blockieren.

     schon entpackt        -> nichts zu tun
     ZIP im Electron-Cache -> von dort entpacken (kein Download)
     sonst                 -> ZIP einmalig laden, in den Cache legen, entpacken

   Der Cache liegt unter %LOCALAPPDATA%\electron\Cache und ueberlebt
   "npm run clean". Wird automatisch von "npm start" aufgerufen; mit --run
   startet danach direkt die App.

   Browser-Variante (serve.ps1) braucht das alles nicht. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const VERSION = '33.4.11';
const ZIP = 'electron-v' + VERSION + '-win32-x64.zip';
const URL = 'https://github.com/electron/electron/releases/download/v' + VERSION + '/' + ZIP;

const projectDir = path.join(__dirname, '..');
const pkgDir = path.join(projectDir, 'node_modules', 'electron');
const distDir = path.join(pkgDir, 'dist');
const exe = path.join(distDir, 'electron.exe');
const cacheRoot = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'electron', 'Cache'
);

function findCachedZip() {
  try {
    for (const sub of fs.readdirSync(cacheRoot)) {
      const p = path.join(cacheRoot, sub, ZIP);
      if (fs.existsSync(p) && fs.statSync(p).size > 50 * 1024 * 1024) return p;
    }
  } catch (e) { /* kein Cache */ }
  return null;
}

function ensureElectron() {
  if (fs.existsSync(exe)) return;

  let zipPath = findCachedZip();
  if (!zipPath) {
    console.log('Electron ' + VERSION + ' wird einmalig geladen (~115 MB) ...');
    const dir = path.join(cacheRoot, 'manual');
    fs.mkdirSync(dir, { recursive: true });
    zipPath = path.join(dir, ZIP);
    execFileSync('curl', ['-L', '--fail', '--retry', '3', '-o', zipPath, URL], { stdio: 'inherit' });
  } else {
    console.log('Electron ' + VERSION + ' aus dem Cache entpacken ...');
  }

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const sysTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  try {
    execFileSync(fs.existsSync(sysTar) ? sysTar : 'tar', ['-xf', zipPath, '-C', distDir], { stdio: 'inherit' });
  } catch (e) {
    execFileSync('powershell', ['-NoProfile', '-Command',
      "Expand-Archive -LiteralPath '" + zipPath + "' -DestinationPath '" + distDir + "' -Force"],
      { stdio: 'inherit' });
  }
  if (!fs.existsSync(exe)) {
    console.error('Entpacken fehlgeschlagen: ' + exe + ' fehlt.');
    process.exit(1);
  }

  // Minimale npm-Shim-Dateien, damit auch "electron ." / require('electron') gehen.
  fs.writeFileSync(path.join(pkgDir, 'path.txt'), 'electron.exe');
  const writeIfMissing = (name, content) => {
    const p = path.join(pkgDir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content);
  };
  writeIfMissing('package.json', JSON.stringify(
    { name: 'electron', version: VERSION, main: 'index.js', bin: { electron: 'cli.js' } }, null, 2) + '\n');
  writeIfMissing('index.js',
    "const fs=require('fs'),path=require('path');\n" +
    "const p=path.join(__dirname,'path.txt');\n" +
    "module.exports=fs.existsSync(p)?path.join(__dirname,'dist',fs.readFileSync(p,'utf8').trim()):null;\n");
  writeIfMissing('cli.js',
    "#!/usr/bin/env node\n" +
    "const cp=require('child_process');const electron=require('./index.js');\n" +
    "const c=cp.spawn(electron,process.argv.slice(2),{stdio:'inherit'});\n" +
    "c.on('close',(code,sig)=>process.exit(sig?1:code));\n");
  console.log('Electron bereit: ' + exe);
}

ensureElectron();

if (process.argv.includes('--run')) {
  const child = spawn(exe, [projectDir], { stdio: 'inherit' });
  child.on('close', (code, sig) => process.exit(sig ? 1 : code));
}
