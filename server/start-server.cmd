@echo off
cd /d "%~dp0"
node --env-file=api.env server.cjs
pause
