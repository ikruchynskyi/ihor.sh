# Edge TTS microservice (yomu/src/edge_tts_server.py)
FROM python:3.12-slim AS tts
WORKDIR /app
RUN pip install --no-cache-dir edge-tts aiohttp
COPY yomu/src/edge_tts_server.py .
USER nobody
ENV EDGE_TTS_HOST=0.0.0.0 EDGE_TTS_PORT=5056
EXPOSE 5056
CMD ["python3", "edge_tts_server.py"]

# ihor.sh web server (server.ts) and Meteor pass recorder (radio/scripts/meteor-record.ts)
FROM node:26-slim AS web
RUN apt-get update && apt-get install -y --no-install-recommends unzip git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node radio/package.json radio/package-lock.json radio/
RUN cd radio && npm ci
COPY --chown=node:node . .
RUN cd radio && npm run build && chmod -R a+rX /app
USER node
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server.ts"]
