@echo off
REM ============================================================
REM  Scoreboard - Windows NUC launcher
REM
REM  Starts the Node.js server, waits for it to listen, then
REM  opens Chrome in kiosk mode on the LED-feeding display.
REM
REM  Hardware assumptions (this NUC + this LED wall):
REM    - Windows display set to Portrait, 1920x1080
REM    - LED controller squashes HDMI down to 512x128
REM    - display.html auto-rotates 90 deg in portrait mode
REM ============================================================

setlocal
cd /d "%~dp0"

REM --- Start Node server in a background window ----------------
start "Scoreboard Server" /MIN cmd /c "node server.js"

REM --- Wait until port 3000 is listening (max ~30s) ------------
set /a TRIES=0
:waitloop
timeout /t 1 /nobreak >nul
netstat -an | find ":3000" | find "LISTENING" >nul
if %errorlevel%==0 goto ready
set /a TRIES+=1
if %TRIES% LSS 30 goto waitloop
echo Server did not start within 30s. Aborting.
exit /b 1

:ready
REM --- Launch Chrome in kiosk mode -----------------------------
REM  --kiosk           : full-screen, no chrome UI
REM  --noerrdialogs    : suppress crash dialogs on the LED
REM  --disable-translate / --no-first-run : skip startup prompts
REM  --user-data-dir   : isolated profile so kiosk state persists
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk ^
  --noerrdialogs ^
  --disable-translate ^
  --no-first-run ^
  --disable-features=TranslateUI ^
  --user-data-dir="%~dp0.chrome-kiosk" ^
  --disk-cache-size=1 ^
  --media-cache-size=1 ^
  --aggressive-cache-discard ^
  --disable-application-cache ^
  "http://localhost:3000/display.html"

endlocal
