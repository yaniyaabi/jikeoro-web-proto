@echo off
cd /d "%~dp0"
echo Installing local server packages...
call npm.cmd ci --omit=dev --no-fund
if errorlevel 1 goto failed
node --env-file=db.env setup.cjs
if errorlevel 1 goto failed
echo.
echo Setup complete. Open first-admin.txt for the administrator login.
echo Then run start-server.cmd.
pause
exit /b 0
:failed
echo.
echo Setup failed. Keep this window open and share the error message above.
pause
exit /b 1
