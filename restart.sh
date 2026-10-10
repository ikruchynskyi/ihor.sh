#!/bin/sh
# Restart ihor.sh services: ./restart.sh [server] [sdr] [tunnel] [ollama]   (no arguments: all)
# Works whether they run as login agents or boot daemons. The daemons run as this user, so ending the process is
# allowed without sudo, and launchd (KeepAlive) starts it again within a few seconds.
for s in ${@:-server sdr tunnel ollama}; do
  if launchctl print "gui/$(id -u)/sh.ihor.$s" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/sh.ihor.$s" && echo "restarted $s"
  elif [ -f "/Library/LaunchDaemons/sh.ihor.$s.plist" ]; then
    pid=$(launchctl print "system/sh.ihor.$s" 2>/dev/null | awk '/^\tpid = / {print $3; exit}')
    if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then echo "restarted $s (daemon, pid $pid)"; else sudo launchctl kickstart -k "system/sh.ihor.$s" && echo "restarted $s"; fi
  else
    echo "$s: not installed"
  fi
done
