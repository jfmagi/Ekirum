#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")"

# Check if Vite server on port 5173 or 5174 is already running
if lsof -i :5173 > /dev/null 2>&1; then
  echo "✓ Ekirum is already running on http://localhost:5173"
  open "http://localhost:5173"
  exit 0
fi

if lsof -i :5174 > /dev/null 2>&1; then
  echo "✓ Ekirum is already running on http://localhost:5174"
  open "http://localhost:5174"
  exit 0
fi

echo "Starting Ekirum server..."

# Poll until server responds, then open browser
(
  for i in {1..20}; do
    if curl -s -o /dev/null http://localhost:5173; then
      open "http://localhost:5173"
      break
    fi
    if curl -s -o /dev/null http://localhost:5174; then
      open "http://localhost:5174"
      break
    fi
    sleep 0.5
  done
) &

npm run dev
