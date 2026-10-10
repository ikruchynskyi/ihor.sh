#!/bin/sh
# Turn the ihor.sh login agents (~/Library/LaunchAgents/sh.ihor.*.plist) into boot daemons, so the site, the SDR server
# and the tunnel start when the Mac boots, before anyone logs in. They still run as you (not root).
#   sudo ./daemons/install.sh            install (or update) the daemons
#   sudo ./daemons/install.sh --undo     back to login agents
set -eu
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo $0 ${1:-}"; exit 1; }
USER_NAME="${SUDO_USER:?run this with sudo from your own account}"
USER_HOME=$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory | awk '{print $2}')
UID_N=$(id -u "$USER_NAME")
AGENTS="$USER_HOME/Library/LaunchAgents"
PB=/usr/libexec/PlistBuddy

if [ "${1:-}" = "--undo" ]; then
  for daemon in /Library/LaunchDaemons/sh.ihor.*.plist; do
    [ -f "$daemon" ] || continue
    label=$(basename "$daemon" .plist)
    launchctl bootout "system/$label" 2>/dev/null || true
    rm -f "$daemon"
    [ -f "$AGENTS/$label.plist.disabled-by-daemon" ] && mv "$AGENTS/$label.plist.disabled-by-daemon" "$AGENTS/$label.plist"
    [ -f "$AGENTS/$label.plist" ] && sudo -u "$USER_NAME" launchctl bootstrap "gui/$UID_N" "$AGENTS/$label.plist" 2>/dev/null || true
    echo "$label: back to a login agent"
  done
  exit 0
fi

found=0
for agent in "$AGENTS"/sh.ihor.*.plist "$AGENTS"/sh.ihor.*.plist.disabled-by-daemon; do
  [ -f "$agent" ] || continue
  found=1
  label=$(basename "$agent"); label=${label%.disabled-by-daemon}; label=${label%.plist}
  daemon="/Library/LaunchDaemons/$label.plist"
  cp "$agent" "$daemon"
  # Daemons start with no user and an empty environment: run as the user, with their home and Homebrew on the PATH.
  for key in UserName GroupName EnvironmentVariables; do $PB -c "Delete :$key" "$daemon" 2>/dev/null || true; done
  $PB -c "Add :UserName string $USER_NAME" -c "Add :GroupName string staff" -c "Add :EnvironmentVariables dict" \
      -c "Add :EnvironmentVariables:HOME string $USER_HOME" \
      -c "Add :EnvironmentVariables:PATH string /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" "$daemon"
  chown root:wheel "$daemon"; chmod 644 "$daemon"
  plutil -lint "$daemon" >/dev/null
  # stop the login agent, then (re)start the daemon
  sudo -u "$USER_NAME" launchctl bootout "gui/$UID_N/$label" 2>/dev/null || true
  launchctl bootout "system/$label" 2>/dev/null || true
  launchctl bootstrap system "$daemon"
  # keep the agent's file, renamed so it doesn't also load at login (two copies would fight over the port)
  case "$agent" in *.disabled-by-daemon) ;; *) mv "$agent" "$agent.disabled-by-daemon" ;; esac
  echo "$label: now a boot daemon, running as $USER_NAME"
done
[ "$found" = 1 ] || { echo "No sh.ihor.* agents in $AGENTS"; exit 1; }
echo "Done. Check: sudo launchctl print system/sh.ihor.server | head -20   (./restart.sh works with either kind)"
