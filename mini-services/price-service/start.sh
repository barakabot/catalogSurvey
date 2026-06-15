#!/bin/bash
cd "$(dirname "$0")"
exec python3 -m uvicorn index:app --host 0.0.0.0 --port 3002
