@echo off
cd /d "%~dp0"
:restart
python -m uvicorn index:app --host 0.0.0.0 --port 3002 --log-level error
echo Service crashed, restarting in 3s...
timeout /t 3 /nobreak >nul
goto restart
