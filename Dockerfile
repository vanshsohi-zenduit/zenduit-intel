# ── Stage 1: build the React/Vite frontend ────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /build

# Install deps first (cached unless package manifests change)
COPY package.json package-lock.json ./
RUN npm ci

# Copy only what the Vite build needs, then build → /build/dist
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Stage 2: Python runtime (serves dist/ + /api on one port) ──────────────────
FROM python:3.13-slim AS runtime
WORKDIR /app

# Non-root user; /data owned by it so a fresh volume mount stays writable
RUN useradd -m -u 1000 appuser

# Python deps (bcrypt/asyncpg ship manylinux wheels — no compilers needed)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code + the built SPA (main.py mounts ./dist if present)
COPY app ./app
COPY --from=frontend /build/dist ./dist

RUN mkdir -p /data && chown -R appuser:appuser /data /app
USER appuser

ENV PORT=3001 \
    DATA_DIR=/data \
    PYTHONUNBUFFERED=1

EXPOSE 3001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001"]
