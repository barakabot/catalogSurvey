@echo off
cd /d "%~dp0"
python -m uvicorn index:app --host 0.0.0.0 --port 3002
