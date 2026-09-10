@echo off
rem Startet Royal Stable Manager als Desktop-App. Electron liegt NICHT im
rem Projektordner - es wird
rem beim ersten Mal (oder nach "npm run clean") aus dem Electron-Cache unter
rem %LOCALAPPDATA%\electron\Cache entpackt; fehlt es dort, wird es einmalig
rem geladen (~115 MB, Internet noetig). Danach startet die App sofort.
rem
rem Ohne Node.js / ohne Internet: stattdessen serve.ps1 starten und
rem   http://localhost:8080/  im Browser oeffnen (braucht gar nichts).
cd /d "%~dp0"
node tools\get-electron.js --run
if errorlevel 1 (
  echo.
  echo Start fehlgeschlagen. Ist Node.js installiert? https://nodejs.org
  echo Alternative ohne Electron: serve.ps1 starten, dann http://localhost:8080/
  pause
  exit /b 1
)
