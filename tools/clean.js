/* Entfernt lokal erzeugte, nicht versionierte Schwergewichte, damit der
   Projektordner (und die OneDrive-Synchronisation) klein bleibt.

   Aufruf:  npm run clean

   Danach lauffaehig ohne weiteren Schritt:
   - Browser-Variante:  serve.ps1  (braucht gar nichts)
   - Desktop-App:        npm start  -> laedt Electron bei Bedarf via npx in
                         den globalen npm-Cache (ausserhalb dieses Ordners) */
const fs = require('fs');
const path = require('path');

const targets = ['node_modules', 'dist', 'package-lock.json'];
let freed = 0;

function sizeOf(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((sum, name) => sum + sizeOf(path.join(p, name)), 0);
}

for (const t of targets) {
  if (!fs.existsSync(t)) { console.log('  (nicht vorhanden) ' + t); continue; }
  let bytes = 0;
  try { bytes = sizeOf(t); } catch (e) { /* egal */ }
  fs.rmSync(t, { recursive: true, force: true });
  freed += bytes;
  console.log('  entfernt  ' + t + '  (' + (bytes / 1048576).toFixed(1) + ' MB)');
}

console.log('Freigegeben: ' + (freed / 1048576).toFixed(1) + ' MB');
