#!/bin/bash
# SATURNO RECORD+TRANSCRIBE — Record from mic and transcribe
# Uses macOS sox (rec) for recording + Whisper for transcription
#
# Usage:
#   record-and-transcribe.sh              # start recording, Ctrl+C to stop
#   record-and-transcribe.sh 60           # record for 60 seconds
#   record-and-transcribe.sh 120 --log    # record 2 min + log to ASTRA

DURATION="${1:-0}"
LOG_FLAG=""
[ "$2" = "--log" ] && LOG_FLAG="--log"
[ "$3" = "--log" ] && LOG_FLAG="--log"

OUTPUT_DIR="$HOME/dev/nexus-capture/recordings"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
AUDIO_FILE="$OUTPUT_DIR/recording_${TIMESTAMP}.wav"

echo "Recording to: $AUDIO_FILE"
if [ "$DURATION" -gt 0 ] 2>/dev/null; then
  echo "Duration: ${DURATION}s"
  echo "Recording..."
  # Use ffmpeg to record from default mic
  ffmpeg -f avfoundation -i ":0" -t "$DURATION" -ar 16000 -ac 1 "$AUDIO_FILE" -y 2>/dev/null
else
  echo "Press Ctrl+C to stop recording..."
  # Record until interrupted
  ffmpeg -f avfoundation -i ":0" -ar 16000 -ac 1 "$AUDIO_FILE" -y 2>/dev/null
fi

if [ -f "$AUDIO_FILE" ]; then
  echo "Recorded: $AUDIO_FILE"
  echo ""
  # Transcribe
  "$HOME/dev/nexus-capture/whisper-transcribe.sh" "$AUDIO_FILE" --model base $LOG_FLAG
else
  echo "Recording failed"
  exit 1
fi
