@echo off
REM Internal helper: keeps node server.js running forever.
REM Started by the "Scoreboard Server" scheduled task on boot. Do not run
REM by hand - use restart-scoreboard.bat to bounce it.

setlocal
cd /d "%~dp0"
if not exist "data" mkdir "data"

:loop
node server.js >> "data\server.log" 2>&1
echo [%DATE% %TIME%] server exited (%errorlevel%), restarting in 3s >> "data\server.log"
timeout /t 3 /nobreak >nul
goto loop
