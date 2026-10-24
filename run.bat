@echo off
title Preppt — Scientific Literature to Presentation
cd /d "%~dp0"
echo ========================================================
echo   Preppt — Scientific Literature to Presentation
echo ========================================================
echo Starting local web server...
echo.
start "" "http://localhost:3080"
node server.js
pause
