#!/bin/zsh
# Detect active IP (Ethernet first, fallback to Wi-Fi)
IP=$(ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en0 2>/dev/null)
if [ -z "$IP" ]; then
  echo "❌ Could not detect local IP. Are you connected to a network?"
  exit 1
fi

echo "🌐 Local IP detected: $IP"

# Start Vite dev server on all interfaces
echo "🚀 Starting Vite dev server accessible on local network..."
npm run dev -- --host &

# Give Vite a few seconds to start
sleep 3

echo "✅ Open this URL on your phone:"
echo "http://$IP:5173/"

