@echo off
title Divido - DO NOT CLOSE THIS WINDOW
color 0A
echo ====================================================
echo   DIVIDO IS STARTING...
echo ====================================================
echo.
echo   !! DO NOT CLOSE THIS WINDOW !!
echo   Closing this window will stop your app.
echo.
echo   Your app will open at: http://localhost:5173
echo ====================================================
echo.
set PATH=%PATH%;C:\Program Files\nodejs
cd /d "%~dp0"
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173/"
npm run dev
pause
