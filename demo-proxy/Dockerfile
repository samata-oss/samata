# Samata demo proxy: a metered pass-through to Deepgram and OpenRouter, so the
# local quickstart can hold a conversation before its owner has an API key. Run by
# Samata Cloud, not by self-hosters; see demo-proxy/src/server.mjs.
#
#   docker build -t samata-demo-proxy ./demo-proxy

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
USER node

EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "src/index.mjs"]
