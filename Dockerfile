# Flight Search MCP server (https://github.com/punitarani/fli)
FROM node:26-slim AS fli
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git ca-certificates \
  && python3 -m venv /opt/fli \
  && /opt/fli/bin/pip install --no-cache-dir "flights[mcp] @ git+https://github.com/punitarani/fli.git" \
  && apt-get purge -y git python3-pip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/fli/bin:$PATH" PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8000 HOME=/tmp
USER nobody
EXPOSE 8000
CMD ["fli-mcp-http"]

# Hotel Search MCP server (https://github.com/him229/stays)
FROM node:26-slim AS stays
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git ca-certificates \
  && python3 -m venv /opt/stays \
  && /opt/stays/bin/pip install --no-cache-dir "git+https://github.com/him229/stays.git" \
  && apt-get purge -y git python3-pip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/stays/bin:$PATH" PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8000 HOME=/tmp
USER nobody
EXPOSE 8000
CMD ["python3", "-c", "from stays.mcp.server import mcp, run_http\nfrom starlette.responses import JSONResponse\nasync def _h(_r): return JSONResponse({'status':'ok'})\nmcp.custom_route('/health', methods=['GET'])(_h)\nrun_http()"]

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
