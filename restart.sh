#!/bin/sh
# Restart ihor.sh services: ./restart.sh [server|sdr|tunnel|ollama|all]   (default: all)
# Works whether they run as login agents (no sudo) or boot daemons (asks for sudo).
for s in ${1:-server sdr tunnel ollama}; do
  [ "$s" = all ] && { exec "$0"; }
  if launchctl print "gui/$(id -u)/sh.ihor.$s" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/sh.ihor.$s" && echo "restarted $s"
  elif [ -f "/Library/LaunchDaemons/sh.ihor.$s.plist" ]; then
    sudo launchctl kickstart -k "system/sh.ihor.$s" && echo "restarted $s"
  else
    echo "$s: not installed"
  fi
done
