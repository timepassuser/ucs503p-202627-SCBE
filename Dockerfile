# Single container: Node backend (public) + Python CV (localhost-only) + built React app
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/code

# --- Python CV deps
COPY code/cv/requirements.txt cv/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r cv/requirements.txt

# --- Node backend deps
COPY code/backend/package*.json backend/
RUN cd backend && npm ci --omit=dev

# --- Frontend build
COPY code/frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY code/frontend frontend
RUN cd frontend && npm run build && rm -rf node_modules

# --- App source
COPY code/backend backend
COPY code/cv cv
COPY code/quick_sample.js quick_sample.js
COPY code/start.sh start.sh
RUN chmod +x start.sh

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    CV_BASE_URL=http://127.0.0.1:5000

# Render sets PORT at runtime; /app/code/data is where the persistent disk mounts
CMD ["./start.sh"]
