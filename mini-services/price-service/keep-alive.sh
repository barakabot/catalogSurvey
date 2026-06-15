#!/bin/bash
cd "$(dirname "$0")"
while true; do
    python3 -m uvicorn index:app --host 0.0.0.0 --port 3002 --log-level error
    echo "Service crashed, restarting in 3s..." >&2
    sleep 3
done
