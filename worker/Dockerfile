# Samata worker: stateless, horizontally scalable. It only needs outbound
# access to LiveKit (LIVEKIT_URL), the control plane
# (SAMATA_CONTROL_PLANE_URL) and the model providers; no inbound ports.
#
#   docker build -t samata-worker ./worker
#   docker run --env-file worker/.env samata-worker

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Non-root user with a home dir (model files are cached under it).
RUN useradd --create-home --uid 10001 samata
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=samata:samata . .
USER samata

# Fetch plugin model weights at build time so cold starts don't download.
RUN python main.py download-files

# The worker's health/metrics HTTP server (prod default port).
EXPOSE 8081
CMD ["python", "main.py", "start"]
