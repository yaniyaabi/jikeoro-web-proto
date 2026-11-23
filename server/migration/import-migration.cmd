@echo off
cd /d "%USERPROFILE%\jikeoro-server"
if errorlevel 1 goto failed
node --env-file=db.env "%~dp0migration-import.cjs"
set "JIKEORO_IMPORT_EXIT=%errorlevel%"
echo.
pause
exit /b %JIKEORO_IMPORT_EXIT%
:failed
echo The jikeoro-server folder was not found.
pause
exit /b 1
