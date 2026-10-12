# ihor.sh: the site (server.ts) and the SDR server (radio/server.ts) from one image; compose.yaml runs both.
FROM node:26-slim
WORKDIR /app
COPY radio/package.json radio/package-lock.json radio/
RUN cd radio && npm ci
COPY . .
RUN cd radio && npm run build
ENV HOST=0.0.0.0
EXPOSE 8080 8073
CMD ["node", "server.ts"]
