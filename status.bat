@echo off
REM Quick health check. No admin required.

setlocal
set "TASK_NAME=Scoreboard Server"

echo === Scoreboard health ===
echo.

echo --- Scoreboard server task ---
schtasks /Query /TN "%TASK_NAME%" /FO LIST 2>nul | findstr /R "TaskName: Status: Last"
if errorlevel 1 echo  ! Scheduled task not found. Run install-autostart.bat to set it up.
echo.

echo --- Local server on port 3000 ---
netstat -ano | findstr "LISTENING" | findstr ":3000"
if errorlevel 1 echo  ! Nothing listening on :3000. Run restart-scoreboard.bat.
echo.

echo --- Cloudflared tunnel service ---
sc query cloudflared 2>nul | findstr /R "STATE"
if errorlevel 1 echo  ! cloudflared service is not installed.
echo.

echo --- Public URL reachability ---
powershell -NoProfile -Command ^
  "try {" ^
  "  $r = Invoke-WebRequest -Uri 'https://scorebord-led.nextphase.be/api/state' -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop;" ^
  "  Write-Host ('  scorebord-led.nextphase.be -> HTTP {0} ({1} bytes)' -f $r.StatusCode, $r.RawContentLength)" ^
  "} catch {" ^
  "  Write-Host ('  scorebord-led.nextphase.be -> ' + $_.Exception.Message)" ^
  "}"
echo.

echo --- Recent server log (last 10 lines) ---
if exist "data\server.log" (
  powershell -NoProfile -Command "Get-Content 'data\server.log' -Tail 10"
) else (
  echo  (no log yet)
)
echo.
pause
endlocal
