#!/bin/sh
# Runs the CV service (localhost only) and the Node backend in one container.
set -e
cd "$(dirname "$0")"

# Disk mounts at runtime, so create data dirs here (Flask only does this under __main__)
mkdir -p data/generated/pdfs data/uploaded/videos data/uploaded/images data/uploaded/pdfs

# Python CV on 127.0.0.1:5000. 1 worker + threads keeps OpenCV memory bounded;
# long timeout because video->PDF extraction can take minutes.
( cd cv && exec /opt/venv/bin/gunicorn app:app \
    --bind 127.0.0.1:5000 --workers 1 --threads 2 --timeout 900 ) &
CV_PID=$!

# If the CV process dies, stop the container so Render restarts it
( while kill -0 "$CV_PID" 2>/dev/null; do sleep 5; done; echo "CV exited"; kill -TERM $$ ) &

# Node in foreground, bound to $HOST:$PORT (0.0.0.0:$PORT on Render)
exec node backend/server.js
