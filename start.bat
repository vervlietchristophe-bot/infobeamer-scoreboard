@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js is not installed.
    echo Download and install the LTS version from https://nodejs.org
    echo then double-click this file again.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies ^(one-time, needs internet^)...
    call npm install --omit=dev
    if errorlevel 1 (
        echo.
        echo npm install failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
)

echo Starting scoreboard server...
start "scoreboard-server" cmd /k node server.js

rem Give the server a moment to start listening before opening browser windows.
timeout /t 2 /nobreak >nul

start "" "http://localhost:3000/display.html"
start "" "http://localhost:3000/controller.html"

echo.
echo ============================================================
echo  Two browser windows just opened:
echo    1. display.html  -- drag to the HDMI screen and press F11
echo    2. controller.html -- use this one to control the match
echo.
echo  The server window shows the LAN URL for the referee phone.
echo  Keep the server window open for the whole match.
echo ============================================================
echo.
pause
