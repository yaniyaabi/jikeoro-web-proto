@echo off
cd /d "%USERPROFILE%\jikeoro-server"
if errorlevel 1 goto failed
node --env-file=api.env "%~dp0migration-check.cjs"
set "JIKEORO_CHECK_EXIT=%errorlevel%"
echo.
pause
exit /b %JIKEORO_CHECK_EXIT%
:failed
echo The jikeoro-server folder was not found.
pause
exit /b 1
