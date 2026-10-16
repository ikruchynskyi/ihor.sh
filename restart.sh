#!/bin/sh
# Restart ihor.sh services: ./restart.sh [server] [sdr] [sdr-sat] [tunnel] [ollama]   (no arguments: all)
# Works whether they run as login agents or boot daemons. The daemons run as this user, so ending the process is
# allowed without sudo, and launchd (KeepAlive) starts it again within a few seconds.
for s in ${@:-server sdr sdr-sat tunnel ollama memegen tts}; do
  if [ "$s" = "memegen" ]; then
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^memegen$"; then
      docker restart memegen >/dev/null 2>&1 && echo "restarted memegen (docker)" || echo "memegen: docker restart failed"
    else
      docker run -d --name memegen -p 5055:5000 --restart=always memegen:latest >/dev/null 2>&1 && echo "started memegen (docker)" || echo "memegen: docker run failed"
    fi
    continue
  fi
  if [ "$s" = "tts" ] || [ "$s" = "edge_tts" ]; then
    pkill -f "yomu/src/edge_tts_server.py" 2>/dev/null
    nohup /Users/irishdash/AI/venv/bin/python3 /Users/irishdash/project/ihor.sh/yomu/src/edge_tts_server.py > /tmp/edge_tts.log 2>&1 &
    echo "restarted tts (edge-tts server on port 5056)"
    continue
  fi
  if launchctl print "gui/$(id -u)/sh.ihor.$s" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/sh.ihor.$s" && echo "restarted $s"
  elif [ -f "/Library/LaunchDaemons/sh.ihor.$s.plist" ]; then
    pid=$(launchctl print "system/sh.ihor.$s" 2>/dev/null | awk '/^\tpid = / {print $3; exit}')
    if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then echo "restarted $s (daemon, pid $pid)"; else sudo launchctl kickstart -k "system/sh.ihor.$s" && echo "restarted $s"; fi
  else
    echo "$s: not installed"
  fi
done
