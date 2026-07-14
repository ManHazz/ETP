#!/usr/bin/env bash
# Publish smartbin.local → wlan0's current IPv4 over mDNS/avahi.
# Watches for IP changes (hotspot reconnects, DHCP renewals) and
# re-publishes automatically. Runs as a user service — no sudo needed.
set -u

IFACE="${IFACE:-wlan0}"
NAME="${NAME:-smartbin.local}"
POLL_SECS="${POLL_SECS:-3}"

pub_pid=""
last_ip=""

current_ip() {
  ip -4 -o addr show "$IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1
}

cleanup() {
  [ -n "$pub_pid" ] && kill "$pub_pid" 2>/dev/null
  exit 0
}
trap cleanup TERM INT

while true; do
  ip="$(current_ip)"
  if [ "$ip" != "$last_ip" ]; then
    if [ -n "$pub_pid" ]; then
      kill "$pub_pid" 2>/dev/null
      wait "$pub_pid" 2>/dev/null
      pub_pid=""
    fi
    if [ -n "$ip" ]; then
      avahi-publish -a -R "$NAME" "$ip" &
      pub_pid=$!
      echo "[mdns] $NAME → $ip"
    else
      echo "[mdns] $IFACE has no IPv4 — waiting"
    fi
    last_ip="$ip"
  fi
  sleep "$POLL_SECS"
done
