# NEXUS CAPTURE

Chrome extension for universal highlight capture. Routes to ASTRA Command Center + Notion.

## Install on Any Device (3 steps)

1. Clone this repo:
```bash
git clone https://github.com/gabosaturno11/nexus-capture.git
```

2. Open Chrome > `chrome://extensions/` > Enable "Developer mode" (top right)

3. Click "Load unpacked" > Select the `nexus-capture` folder

Done. The extension icon appears in your toolbar.

## What It Does

- **Right-click any selected text** > "Capture to NEXUS" > choose category (Idea, Quote, Code, Insight, To-Do)
- **Cmd+Shift+S** — Quick capture selected text as Idea
- **Popup** — Click extension icon to view captures, record voice, configure settings
- **Floating bar** — ASTRA connector panel with Pipeline tab (record/upload/process)
- **TTS** — Right-click > "Create Sound" reads selected text aloud

## Where Captures Go

1. **ASTRA backend** — `astra-command-center-sigma.vercel.app/api/capture`
2. **Notion** — If configured with token + database ID in popup settings
3. **Local storage** — Always stored locally (up to 1000 captures)

## Setup Notion (Optional)

1. Click extension icon > Settings
2. Enter Notion Integration Token
3. Enter Notion Database ID
4. Toggle Notion ON

## Files

| File | What |
|------|------|
| manifest.json | Chrome Manifest V3 config |
| background.js | Service worker: capture logic, API routing, transcription |
| content.js | Content script: selection detection, floating bar, TTS |
| content.css | Floating bar styles |
| popup.html/js | Extension popup: history, settings, voice recording |
| floating-bar.html | ASTRA connector floating panel |
| icons/ | Extension icons (16/32/48/128px) |

## Shell Scripts (macOS only)

These are bonus tools for system-level capture, not needed for Chrome:

| Script | What |
|--------|------|
| capture-highlight.sh | Capture selected text via macOS Services |
| whisper-transcribe.sh | Local Whisper transcription |
| whisper-api-transcribe.sh | Cloud Whisper via OpenAI API |
| record-and-transcribe.sh | Record + transcribe |
| create-sound.sh | TTS via macOS `say` command |
| open-nexus-bar.sh | Open floating bar |

## Version

v1.1.0 — By Gabo Saturno / Saturno Movement
