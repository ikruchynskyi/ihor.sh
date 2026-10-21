#!/bin/sh
# Restart ihor.sh services: ./restart.sh [web|server] [tts] [memegen] [tunnel] [host] [sdr] [sdr-sat] [ollama]  (no arguments: all)
# Containerized services (web, tts, memegen, tunnel) run in Docker Compose; hardware/MLX services (host, sdr, sdr-sat, ollama)
# run on the Mac host as LaunchDaemons (or login agents) and restart without sudo when their process exits.
set -u
cd "$(dirname "$0")"

ensure_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "starting Docker Desktop daemon..."
    docker desktop start >/dev/null 2>&1 || /Applications/Docker.app/Contents/MacOS/com.docker.backend run >/dev/null 2>&1 &
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
}

restart_launchd() {
  label="$1"
  name="$2"
  if launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/$label" && echo "restarted $name (agent)"
  elif [ -f "/Library/LaunchDaemons/$label.plist" ]; then
    pid=$(launchctl print "system/$label" 2>/dev/null | awk '/^\tpid = / {print $3; exit}')
    if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then
      echo "restarted $name (daemon, pid $pid)"
    else
      sudo launchctl kickstart -k "system/$label" && echo "restarted $name"
    fi
  else
    echo "$name: not installed"
  fi
}

for s in ${@:-web tts memegen tunnel host sdr sdr-sat ollama}; do
  case "$s" in
    server|web)
      ensure_docker
      if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "web"; then
        docker compose restart web && echo "restarted web (docker)"
      else
        docker compose up -d web && echo "started web (docker)"
      fi
      ;;
    tts|edge_tts)
      ensure_docker
      pkill -f "yomu/src/edge_tts_server.py" 2>/dev/null || true
      if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "tts"; then
        docker compose restart tts && echo "restarted tts (docker)"
      else
        docker compose up -d tts && echo "started tts (docker)"
      fi
      ;;
    memegen)
      ensure_docker
      if [ -z "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' memegen 2>/dev/null)" ]; then
        docker rm -f memegen >/dev/null 2>&1 || true
      fi
      if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "memegen"; then
        docker compose restart memegen && echo "restarted memegen (docker)"
      else
        docker compose up -d memegen && echo "started memegen (docker)"
      fi
      ;;
    tunnel)
      ensure_docker
      if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "tunnel"; then
        docker compose restart tunnel && echo "restarted tunnel (docker)"
      else
        docker compose up -d tunnel && echo "started tunnel (docker)"
      fi
      ;;
    host)
      restart_launchd "sh.ihor.server" "host"
      ;;
    sdr|sdr-sat)
      restart_launchd "sh.ihor.$s" "$s"
      ;;
    ollama)
      if launchctl print "gui/$(id -u)/sh.ihor.ollama" >/dev/null 2>&1 || [ -f "/Library/LaunchDaemons/sh.ihor.ollama.plist" ]; then
        restart_launchd "sh.ihor.ollama" "ollama"
      else
        pkill -f "Ollama.app/Contents/Resources/ollama serve" 2>/dev/null || true
        sleep 1
        if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && [ -x /Applications/Ollama.app/Contents/Resources/ollama ]; then
          nohup /Applications/Ollama.app/Contents/Resources/ollama serve >/dev/null 2>&1 &
        fi
        echo "restarted ollama (host)"
      fi
      ;;
    *)
      echo "Unknown service: $s (choose from: web, tts, memegen, tunnel, host, sdr, sdr-sat, ollama)" >&2
      exit 1
      ;;
  esac
done
