#!/bin/sh
# Manage the containerized ihor.sh stack and its macOS host services from the host machine:
#   ./manage.sh status              show Docker containers and host services (sdr, sdr-sat, host bridge, ollama)
#   ./manage.sh rebuild [service]   build radio/dist and rebuild/restart Docker containers (default: web tts)
#   ./manage.sh deploy              rebuild containers, restart sdr daemons, and run `npm run check`
#   ./manage.sh restart [service]   restart one or all services (delegates to ./restart.sh)
#   ./manage.sh test [file...]      run unit tests (inside the web container when running, else on host)
#   ./manage.sh check               run smoke & ASO checks (`npm run check`) against http://localhost:8080
#   ./manage.sh logs [service]      tail container logs (or host logs for sdr / sdr-sat / host)
#   ./manage.sh shell               open an interactive shell inside the `web` container
#   ./manage.sh up | down           start or stop the Docker Compose stack
set -eu
cd "$(dirname "$0")"

ensure_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Starting Docker Desktop daemon..."
    docker desktop start >/dev/null 2>&1 || /Applications/Docker.app/Contents/MacOS/com.docker.backend run >/dev/null 2>&1 &
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
}

wait_web() {
  for _ in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8080/robots.txt >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "web did not become ready on http://127.0.0.1:8080 within 30s" >&2
  return 1
}

cmd="${1:-status}"
shift 2>/dev/null || true

case "$cmd" in
  status)
    echo "=== Docker Daemon & Containers ==="
    if docker info >/dev/null 2>&1; then
      docker compose ps
    else
      echo "Docker daemon: STOPPED"
    fi
    echo ""
    echo "=== Host Services (USB / Apple Silicon MLX) ==="
    for svc in "sdr:http://127.0.0.1:8073/api/state" "sdr-sat:http://127.0.0.1:8074/api/state" "host-bridge:http://127.0.0.1:8075/health" "ollama:http://127.0.0.1:11434/api/tags"; do
      name="${svc%%:*}"
      url="${svc#*:}"
      if out=$(curl -sf --max-time 2 "$url" 2>/dev/null); then
        printf "  %-12s UP   (%s)\n" "$name" "$(printf '%s' "$out" | head -c 100)"
      else
        printf "  %-12s DOWN (%s)\n" "$name" "$url"
      fi
    done
    ;;

  up)
    ensure_docker
    if [ -z "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' memegen 2>/dev/null)" ]; then
      docker rm -f memegen >/dev/null 2>&1 || true
    fi
    pkill -f "yomu/src/edge_tts_server.py" 2>/dev/null || true
    docker compose up -d "$@"
    wait_web
    ;;

  down)
    docker compose down "$@"
    ;;

  rebuild|build)
    ensure_docker
    echo "Building radio/dist on host..."
    npm run build
    if [ -z "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' memegen 2>/dev/null)" ]; then
      docker rm -f memegen >/dev/null 2>&1 || true
    fi
    pkill -f "yomu/src/edge_tts_server.py" 2>/dev/null || true
    echo "Rebuilding and starting Docker containers..."
    docker compose up -d --build ${@:-web tts memegen tunnel}
    wait_web
    echo "Containerized site ready on http://localhost:8080"
    ;;

  deploy)
    "$0" rebuild
    ./restart.sh host sdr sdr-sat
    npm run check
    ;;

  restart)
    ./restart.sh "$@"
    ;;

  test)
    run_node() {
      if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "web"; then
        docker compose exec -T web node "$@"
      else
        node "$@"
      fi
    }
    if [ $# -gt 0 ]; then
      for f in "$@"; do
        echo "→ $f"
        run_node "$f"
      done
    else
      for f in server/*.test.ts learn/*.test.mjs learn/lab/*.test.mjs nyc/*.test.* ride/*.test.mjs yomu/*.test.mjs ai/*.test.mjs; do
        [ -f "$f" ] || continue
        echo "→ $f"
        run_node "$f"
      done
      echo "→ radio tests"
      if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "web"; then
        docker compose exec -T -w /app/radio web npm test
      else
        (cd radio && npm test)
      fi
    fi
    ;;

  check)
    npm run check
    ;;

  logs)
    case "${1:-}" in
      sdr|sdr-sat)
        tail -f "$HOME/Library/Logs/ihor-$1.log"
        ;;
      host)
        tail -f "$HOME/Library/Logs/ihor-server.log"
        ;;
      *)
        docker compose logs -f "$@"
        ;;
    esac
    ;;

  shell)
    docker compose exec web sh
    ;;

  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
