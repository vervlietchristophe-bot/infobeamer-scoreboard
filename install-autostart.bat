@echo off
REM ============================================================
REM  Scoreboard - one-time auto-start setup
REM
REM  Run this ONCE on the NUC. It will:
REM    - register a Windows scheduled task that starts the server on
REM      every boot (auto-restarts the node process if it crashes)
REM    - configure cloudflared to recover automatically on failure
REM    - drop a Chrome-kiosk shortcut into the All-Users Startup
REM      folder so the LED display launches on login
REM
REM  Re-running this script is safe - it just refreshes everything.
REM ============================================================

setlocal
cd /d "%~dp0"
set "SCOREBOARD_DIR=%CD%"
set "TASK_NAME=Scoreboard Server"
set "STARTUP_DIR=%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

REM 1. Self-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo === Scoreboard auto-start setup ===
echo Project folder: %SCOREBOARD_DIR%
echo.

REM 2. Verify Node.js is on the SYSTEM PATH
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js was not found on PATH. Install LTS from
  echo         https://nodejs.org/ then re-run this script.
  pause
  exit /b 1
)

REM 3. Configure cloudflared service: auto-start + auto-restart on crash
sc query cloudflared >nul 2>&1
if not errorlevel 1 (
  echo [cloudflared] Configuring auto-start + crash recovery...
  sc config cloudflared start= auto
  sc failure cloudflared reset= 0 actions= restart/5000/restart/5000/restart/30000
  net start cloudflared >nul 2>&1
) else (
  echo [cloudflared] Service not installed - skipping. Install it first
  echo               if you want the public URL to keep working.
)

REM 4. Register the scheduled task that runs the auto-restart loop on boot
echo [scoreboard] Registering "%TASK_NAME%" task on system startup...
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1
schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /SC ONSTART ^
  /RL HIGHEST ^
  /RU SYSTEM ^
  /TR "cmd.exe /c \"%SCOREBOARD_DIR%\_server-loop.bat\"" ^
  /F

REM 5. Drop a Chrome-kiosk shortcut into the All-Users Startup folder
echo [display] Adding Chrome kiosk to startup for all users...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut(\"%STARTUP_DIR%\Scoreboard Display.lnk\");" ^
  "$lnk.TargetPath = '%SCOREBOARD_DIR%\display.bat';" ^
  "$lnk.WorkingDirectory = '%SCOREBOARD_DIR%';" ^
  "$lnk.WindowStyle = 7;" ^
  "$lnk.Description = 'Launches the LED scoreboard kiosk window';" ^
  "$lnk.Save()"

REM 6. Kick everything off right now (no need to reboot)
echo [boot] Starting the scoreboard server task now...
schtasks /Run /TN "%TASK_NAME%" >nul

echo.
echo === Done! ===
echo The NUC will now bring everything up automatically:
echo   - On boot: scoreboard server + cloudflared tunnel
echo   - On user login: Chrome kiosk
echo.
echo Useful files in this folder:
echo   status.bat              - shows what is running and healthy
echo   restart-scoreboard.bat  - bounces the server + tunnel
echo.
pause
endlocal
