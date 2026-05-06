@echo off
REM ============================================================
REM  Scoreboard - simple launcher
REM
REM  Starts the Node server and opens the controller in your
REM  default browser. Use start.bat instead for the production
REM  Chrome-kiosk launcher on the LED-feeding NUC.
REM ============================================================

setlocal
cd /d "%~dp0"

REM --- Make sure Node.js is installed ---------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Scoreboard] Node.js was not found on this PC.
  echo Please install it from https://nodejs.org/  ^(LTS version is fine^)
  echo Then double-click RUN.bat again.
  echo.
  pause
  exit /b 1
)

REM --- Make sure dependencies exist -----------------------------
if not exist "node_modules\express" (
  echo [Scoreboard] First-run setup: installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [Scoreboard] Dependency install failed.
    pause
    exit /b 1
  )
)

REM --- Start the server in a background window ------------------
start "Scoreboard Server" /MIN cmd /c "node server.js"

REM --- Wait until port 3000 is listening (max ~30s) -------------
set /a TRIES=0
:waitloop
timeout /t 1 /nobreak >nul
netstat -an | find ":3000" | find "LISTENING" >nul
if %errorlevel%==0 goto ready
set /a TRIES+=1
if %TRIES% LSS 30 goto waitloop
echo Server did not start within 30 seconds. Aborting.
pause
exit /b 1

:ready
echo.
echo [Scoreboard] Server running at http://localhost:3000
echo   Controller : http://localhost:3000/
echo   LED display: http://localhost:3000/display.html
echo.
start "" "http://localhost:3000/"

endlocal
