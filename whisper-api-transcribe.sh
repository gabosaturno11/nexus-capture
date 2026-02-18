#!/bin/bash
# NEXUS CAPTURE — Cloud Whisper Transcription (OpenAI API)
# Faster than local Whisper, requires OPENAI_API_KEY
#
# Usage:
#   whisper-api-transcribe.sh recording.mp3
#   whisper-api-transcribe.sh recording.mp3 --log     # also log to ASTRA
#
# Env: OPENAI_API_KEY must be set

WHISPER_ENV="$HOME/dev/.whisper-env/bin/python3"
ASTRA_API="https://astra-command-center-sigma.vercel.app"
ADMIN_PW="${ASTRA_ADMIN_PASSWORD:-saturno-admin-2026}"
OUTPUT_DIR="$HOME/dev/nexus-capture/transcripts"

AUDIO_FILE=""
LOG_TO_ASTRA=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --log) LOG_TO_ASTRA=true; shift ;;
    *) AUDIO_FILE="$1"; shift ;;
  esac
done

if [ -z "$AUDIO_FILE" ] || [ ! -f "$AUDIO_FILE" ]; then
  echo "Usage: whisper-api-transcribe.sh <audio-file> [--log]"
  echo "Requires OPENAI_API_KEY environment variable"
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "ERROR: OPENAI_API_KEY not set"
  echo "Run: export OPENAI_API_KEY=sk-..."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

BASENAME=$(basename "$AUDIO_FILE" | sed 's/\.[^.]*$//')
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="$OUTPUT_DIR/${BASENAME}_${TIMESTAMP}.txt"

echo "Transcribing via OpenAI Whisper API: $AUDIO_FILE"
echo "---"

TRANSCRIPT=$("$WHISPER_ENV" -c "
import openai, sys
client = openai.OpenAI()
with open('$AUDIO_FILE', 'rb') as f:
    result = client.audio.transcriptions.create(
        model='whisper-1',
        file=f,
        language='en',
        prompt='Calisthenics, handstand, planche, Gabo Saturno, Saturno Movement, handbalancing'
    )
print(result.text)
" 2>/dev/null)

if [ -z "$TRANSCRIPT" ]; then
  echo "ERROR: Transcription failed"
  exit 1
fi

echo "$TRANSCRIPT" > "$OUTPUT_FILE"
echo "$TRANSCRIPT"
echo "---"
echo "Saved to: $OUTPUT_FILE"

if [ "$LOG_TO_ASTRA" = true ]; then
  echo "Logging to ASTRA..."
  curl -s -X POST "${ASTRA_API}/api/transcripts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_PW" \
    -d "$(cat <<JSONEOF
{
  "text": $(echo "$TRANSCRIPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
  "source": "whisper-api",
  "tags": ["whisper", "api", "$BASENAME"]
}
JSONEOF
  )" > /dev/null 2>&1
  echo "Logged to ASTRA"
fi
