#!/bin/bash
# NEXUS CAPTURE — System-wide highlight capture
# Grabs selected text (or clipboard) and sends to ASTRA capture API
#
# Usage:
#   capture-highlight.sh                  # captures clipboard
#   capture-highlight.sh "some text"      # captures argument
#   echo "text" | capture-highlight.sh    # captures stdin
#
# Set up as macOS keyboard shortcut via Automator Quick Action
# or bind to a global hotkey via skhd/Hammerspoon

ASTRA_API="https://astra-command-center-sigma.vercel.app"
ADMIN_PW="${ASTRA_ADMIN_PASSWORD:-saturno-admin-2026}"
CATEGORY="${SATURNO_CATEGORY:-highlight}"
LOG_FILE="$HOME/dev/nexus-capture/capture.log"

# Get text from argument, stdin, or clipboard
if [ -n "$1" ]; then
  TEXT="$1"
elif [ ! -t 0 ]; then
  TEXT=$(cat)
else
  TEXT=$(pbpaste)
fi

if [ -z "$TEXT" ]; then
  osascript -e 'display notification "Nothing to capture" with title "NEXUS CAPTURE"' 2>/dev/null
  exit 1
fi

# Get source app name
SOURCE_APP=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' 2>/dev/null || echo "unknown")

# Truncate for notification
PREVIEW="${TEXT:0:60}"
[ ${#TEXT} -gt 60 ] && PREVIEW="${PREVIEW}..."

# Send to ASTRA capture API
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${ASTRA_API}/api/capture" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSONEOF
{
  "content": $(echo "$TEXT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
  "category": "$CATEGORY",
  "source": "$SOURCE_APP",
  "sourceTitle": "System Capture",
  "type": "highlight",
  "tags": ["system-capture"]
}
JSONEOF
)" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

# Log
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$SOURCE_APP] $PREVIEW" >> "$LOG_FILE"

if [ "$HTTP_CODE" = "200" ]; then
  osascript -e "display notification \"$PREVIEW\" with title \"Captured from $SOURCE_APP\"" 2>/dev/null
else
  # Fallback: save locally
  echo "$TEXT" >> "$HOME/dev/nexus-capture/offline-captures.txt"
  osascript -e "display notification \"Saved locally (API: $HTTP_CODE)\" with title \"NEXUS CAPTURE\"" 2>/dev/null
fi
