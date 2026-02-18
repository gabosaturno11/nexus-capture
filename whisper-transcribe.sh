#!/bin/bash
# NEXUS CAPTURE — Local transcription tool (faster-whisper)
# Transcribes audio files using faster-whisper (CTranslate2 backend)
#
# Usage:
#   whisper-transcribe.sh recording.mp3                    # transcribe file
#   whisper-transcribe.sh recording.mp3 --model medium     # use medium model
#   whisper-transcribe.sh recording.mp3 --log              # also log to ASTRA
#
# Models: tiny, base, small, medium, large-v3
# Default: base (good balance of speed/quality)

WHISPER_PYTHON="$HOME/dev/.whisper-env/bin/python3"
ASTRA_API="https://astra-command-center-sigma.vercel.app"
ADMIN_PW="${ASTRA_ADMIN_PASSWORD:-saturno-admin-2026}"
OUTPUT_DIR="$HOME/dev/nexus-capture/transcripts"

# Parse args
AUDIO_FILE=""
MODEL="base"
LOG_TO_ASTRA=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --model) MODEL="$2"; shift 2 ;;
    --log) LOG_TO_ASTRA=true; shift ;;
    *) AUDIO_FILE="$1"; shift ;;
  esac
done

if [ -z "$AUDIO_FILE" ] || [ ! -f "$AUDIO_FILE" ]; then
  echo "Usage: whisper-transcribe.sh <audio-file> [--model base|small|medium|large-v3] [--log]"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

BASENAME=$(basename "$AUDIO_FILE" | sed 's/\.[^.]*$//')
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="$OUTPUT_DIR/${BASENAME}_${TIMESTAMP}.txt"

echo "Transcribing: $AUDIO_FILE (model: $MODEL)"
echo "---"

# Run faster-whisper via Python
TRANSCRIPT=$("$WHISPER_PYTHON" -c "
from faster_whisper import WhisperModel
import sys

model = WhisperModel('$MODEL', compute_type='int8')
segments, info = model.transcribe('$AUDIO_FILE', language='en',
    initial_prompt='Calisthenics, handstand, planche, Gabo Saturno, Saturno Movement, handbalancing')

text = ''
for segment in segments:
    text += segment.text

print(text.strip())
" 2>/dev/null)

if [ -z "$TRANSCRIPT" ]; then
  echo "ERROR: Transcription failed or returned empty"
  exit 1
fi

echo "$TRANSCRIPT" > "$OUTPUT_FILE"
echo "$TRANSCRIPT"
echo "---"
echo "Saved to: $OUTPUT_FILE"
echo "Characters: ${#TRANSCRIPT}"

# Log to ASTRA if requested
if [ "$LOG_TO_ASTRA" = true ]; then
  echo "Logging to ASTRA..."
  curl -s -X POST "${ASTRA_API}/api/transcripts" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_PW" \
    -d "$(cat <<JSONEOF
{
  "text": $(echo "$TRANSCRIPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
  "source": "whisper-local-$MODEL",
  "tags": ["whisper", "local", "$BASENAME"]
}
JSONEOF
  )" > /dev/null 2>&1
  echo "Logged to ASTRA transcripts API"
fi
