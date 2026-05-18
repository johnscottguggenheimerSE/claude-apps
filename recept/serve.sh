#!/bin/sh
cd "$(dirname "$0")"
PORT=8765
HOST=0.0.0.0
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
echo "Recept (denna dator): http://127.0.0.1:${PORT}/"
if [ -n "$LAN_IP" ]; then
  echo "Recept (mobil/samma Wi‑Fi): http://${LAN_IP}:${PORT}/"
else
  echo "Recept (mobil/samma Wi‑Fi): http://<din-mac-IP>:${PORT}/"
fi
exec python3 -m http.server "$PORT" --bind "$HOST"
