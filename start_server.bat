@echo off
SETLOCAL
echo Initializing Deadlock Simulator Environment...
echo 1. Synchronizing dependencies...
call npm install
echo 2. Starting local server with auto-refresh...
start http://localhost:3000
call npm run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Failed to start in DEV mode. Falling back to standard mode...
    node server.js
)
pause
ENDLOCAL
