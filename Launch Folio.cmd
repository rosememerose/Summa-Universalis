@echo off
setlocal
cd /d "%~dp0"
set "FOLIO_USE_DIST=1"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Summa Universalis desktop runtime is missing.
  echo Please return to Codex and ask it to repair the installation.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo Summa Universalis production build is missing.
  echo Please return to Codex and ask it to rebuild the application.
  pause
  exit /b 1
)

start "Summa Universalis" "node_modules\electron\dist\electron.exe" .
endlocal
