@echo off
rem Startet die Desktop-App. Beim ersten Mal werden die Abhaengigkeiten
rem (Electron) heruntergeladen - das dauert einige Minuten und braucht
rem Internet. Danach startet die App sofort.
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo Erstinstallation: lade Electron ... (einmalig, bitte warten^)
  call npm install
  if errorlevel 1 (
    echo.
    echo Installation fehlgeschlagen. Ist Node.js installiert? https://nodejs.org
    pause
    exit /b 1
  )
)
call npm start
