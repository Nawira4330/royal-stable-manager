/* Packt nur die Web-Laufzeitdateien in eine ZIP zum lokalen Weitergeben
   (USB, Messenger, OneDrive). Kein Server, kein Hosting - der Empfaenger
   entpackt die ZIP und laesst sie von einem lokalen Mini-Webserver auf dem
   Handy ausliefern (siehe README, Abschnitt „Als App aufs Handy").

   Aufruf:  npm run bundle   ->   royal-stable-manager-web.zip */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'royal-stable-manager-web.zip');
const PARTS = ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js', 'favicon.png'];

for (const p of PARTS) {
  if (!fs.existsSync(path.join(ROOT, p))) {
    console.error('Fehlt: ' + p + '  (erst `npm run icons` ausfuehren?)');
    process.exit(1);
  }
}
fs.rmSync(OUT, { force: true });

// bevorzugt System-tar (bsdtar) -> spec-konforme ZIP mit Vorwaerts-Slashes;
// sonst PowerShell Compress-Archive.
const sysTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
try {
  if (!fs.existsSync(sysTar)) throw new Error('kein System-tar');
  execFileSync(sysTar, ['-a', '-c', '-f', OUT, ...PARTS], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    'Compress-Archive -Path ' + PARTS.map((p) => "'" + p + "'").join(',') +
    " -DestinationPath '" + OUT + "' -Force"],
    { cwd: ROOT, stdio: 'inherit' });
}

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('geschrieben: ' + path.basename(OUT) + '  (' + kb + ' KB)');
