@echo off
REM One-click recovery: bounces the scoreboard server and the cloudflared
REM tunnel. Use this if the controller stops responding or the public URL
REM throws errors. Self-elevates to Administrator.

setlocal
set "TASK_NAME=Scoreboard Server"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo === Restarting Scoreboard ===

echo [1/3] Stopping the scoreboard server task...
schtasks /End /TN "%TASK_NAME%" >nul 2>&1
REM Kill leftover node.exe in case the task end didn't reach the loop child
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Restarting cloudflared service...
sc query cloudflared >nul 2>&1 && (
  net stop cloudflared >nul 2>&1
  net start cloudflared >nul 2>&1
) || (
  echo  - cloudflared service not installed, skipping
)

echo [3/3] Starting the scoreboard server task...
schtasks /Run /TN "%TASK_NAME%" >nul

timeout /t 4 /nobreak >nul
echo.
echo === Status ===
sc query cloudflared 2>nul | findstr /R "STATE"
schtasks /Query /TN "%TASK_NAME%" /FO LIST 2>nul | findstr /R "Status:"
netstat -ano | findstr "LISTENING" | findstr ":3000"
echo.
pause
endlocal
