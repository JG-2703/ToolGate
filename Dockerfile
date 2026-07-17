# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build
# output: /build/dist/

# ── Stage 2: Python app ────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend into ./static (main.py looks for ../static relative to itself,
# but we run from /app so we place it at /app/static)
COPY --from=frontend /build/dist ./static/

# Data directory (override DB path via TOOLGATE_DB_PATH)
RUN mkdir -p /data
VOLUME /data

ENV TOOLGATE_DB_PATH=/data/toolgate.db

EXPOSE 8000

# Shell form so $PORT (set by Render/other PaaS) expands; falls back to 8000 locally.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
