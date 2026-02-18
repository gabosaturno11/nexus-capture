#!/bin/bash
# NEXUS CAPTURE — Create Sound from highlighted text (system-wide)
# Grabs selected text (or clipboard) and speaks it using macOS TTS
# Also saves the audio file to ~/dev/nexus-capture/sounds/
#
# Usage:
#   create-sound.sh                  # speaks clipboard text
#   create-sound.sh "some text"      # speaks argument
#   create-sound.sh --save           # speaks AND saves audio file
#
# Set up as macOS Automator Quick Action or keyboard shortcut

OUTPUT_DIR="$HOME/dev/nexus-capture/sounds"
VOICE="${SATURNO_VOICE:-Samantha}"
SAVE_AUDIO=false

# Parse args
TEXT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --save) SAVE_AUDIO=true; shift ;;
    --voice) VOICE="$2"; shift 2 ;;
    *) TEXT="$1"; shift ;;
  esac
done

# Get text from argument or clipboard
if [ -z "$TEXT" ]; then
  TEXT=$(pbpaste)
fi

if [ -z "$TEXT" ]; then
  osascript -e 'display notification "Nothing to speak" with title "NEXUS CAPTURE"' 2>/dev/null
  exit 1
fi

# Truncate for notification
PREVIEW="${TEXT:0:50}"
[ ${#TEXT} -gt 50 ] && PREVIEW="${PREVIEW}..."

osascript -e "display notification \"$PREVIEW\" with title \"Creating Sound...\"" 2>/dev/null

if [ "$SAVE_AUDIO" = true ]; then
  mkdir -p "$OUTPUT_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  AUDIO_FILE="$OUTPUT_DIR/sound_${TIMESTAMP}.aiff"

  # Save audio file AND speak
  say -v "$VOICE" -o "$AUDIO_FILE" "$TEXT"
  say -v "$VOICE" "$TEXT"

  osascript -e "display notification \"Saved to: $AUDIO_FILE\" with title \"Sound Created\"" 2>/dev/null
else
  # Just speak
  say -v "$VOICE" "$TEXT"
fi
