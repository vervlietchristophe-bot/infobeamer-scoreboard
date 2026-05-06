@echo off
REM Launches Chrome in kiosk mode on the LED display once the scoreboard
REM server is reachable. install-autostart.bat puts a shortcut to this
REM file in the All-Users Startup folder so it runs automatically when
REM anyone logs in to the NUC.

setlocal
cd /d "%~dp0"

REM Find Chrome (handle both 64-bit and 32-bit installs)
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Google Chrome not found. Install it from https://google.com/chrome
  pause
  exit /b 1
)

REM Wait up to 60s for the scoreboard server to be listening on :3000
set /a TRIES=0
:waitloop
timeout /t 1 /nobreak >nul
netstat -an | find ":3000" | find "LISTENING" >nul
if %errorlevel%==0 goto ready
set /a TRIES+=1
if %TRIES% LSS 60 goto waitloop
echo Scoreboard server is not listening on :3000 yet. Try again later.
pause
exit /b 1

:ready
"%CHROME%" ^
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
