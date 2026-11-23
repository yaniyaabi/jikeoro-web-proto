@echo off
cd /d "%~dp0"
node --env-file=api.env export-csv.cjs
set "JIKEORO_CSV_EXIT=%errorlevel%"
echo.
pause
exit /b %JIKEORO_CSV_EXIT%
