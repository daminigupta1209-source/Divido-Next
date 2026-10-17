@echo off
title Divido - Release
color 0B
echo ====================================================
echo   RELEASING DIVIDO...
echo ====================================================
echo.
set PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files\Git\cmd
cd /d "%~dp0"

echo [1/4] Getting your brother's latest changes...
git pull --rebase
if errorlevel 1 goto fail

echo.
echo [2/4] Building the app...
call npm run build
if errorlevel 1 goto fail

echo.
echo [3/4] Running tests...
call npx vitest run
if errorlevel 1 goto fail

echo.
echo [4/4] Pushing live...
git push origin main
if errorlevel 1 goto fail

color 0A
echo.
echo ====================================================
echo   DONE! Divido will be live in about 2 minutes.
echo ====================================================
pause
exit /b 0

:fail
color 0C
echo.
echo ====================================================
echo   STOPPED - nothing was pushed. Users are safe.
echo   Send a screenshot of this window to Claude.
echo ====================================================
pause
exit /b 1
