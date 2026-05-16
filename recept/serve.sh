#!/bin/sh
cd "$(dirname "$0")"
echo "Recept: http://127.0.0.1:8765/"
exec python3 -m http.server 8765
