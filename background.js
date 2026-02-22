// ===============================================================
// NEXUS CAPTURE - Background Service Worker
// Routes captures to Notion + NEXUS Backend
// Voice recording + TTS via ASTRA
// ===============================================================

const NEXUS_API = 'https://astra-command-center-sigma.vercel.app';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'saturno-capture',
    title: 'Capture to NEXUS',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-idea',
    parentId: 'saturno-capture',
    title: 'As Idea',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-quote',
    parentId: 'saturno-capture',
    title: 'As Quote',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-code',
    parentId: 'saturno-capture',
    title: 'As Code',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-insight',
    parentId: 'saturno-capture',
    title: 'As Insight',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-todo',
    parentId: 'saturno-capture',
    title: 'As To-Do',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-book',
    parentId: 'saturno-capture',
    title: 'As Book',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'saturno-capture-research',
    parentId: 'saturno-capture',
    title: 'As Research',
    contexts: ['selection']
  });

  // Open side panel
  chrome.contextMenus.create({
    id: 'saturno-sidepanel',
    title: 'Open NEXUS Sidebar',
    contexts: ['page', 'selection']
  });

  // TTS: Create Sound from highlighted text
  chrome.contextMenus.create({
    id: 'saturno-create-sound',
    title: 'Create Sound (TTS)',
    contexts: ['selection']
  });

  // Set default settings
  chrome.storage.sync.get(['notionToken', 'notionDatabaseId', 'nexusEnabled', 'notionEnabled'], (result) => {
    if (result.nexusEnabled === undefined) {
      chrome.storage.sync.set({ nexusEnabled: true });
    }
    if (result.notionEnabled === undefined) {
      chrome.storage.sync.set({ notionEnabled: true });
    }
  });

  // Enable side panel opening via action click
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }

  console.log('NEXUS CAPTURE installed');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saturno-sidepanel') {
    if (chrome.sidePanel) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    return;
  }

  if (info.menuItemId === 'saturno-create-sound') {
    // TTS: send selected text to content script for speech
    chrome.tabs.sendMessage(tab.id, {
      action: 'createSound',
      text: info.selectionText
    }).catch(() => {});
    return;
  }

  if (info.menuItemId.startsWith('saturno-capture')) {
    const category = info.menuItemId.replace('saturno-capture-', '') || 'idea';

    captureSelection({
      content: info.selectionText,
      category: category,
      source: tab.url,
      title: tab.title
    });
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelection' }, (response) => {
          if (response && response.text) {
            captureSelection({
              content: response.text,
              category: 'idea',
              source: tabs[0].url,
              title: tabs[0].title
            });
          }
        });
      }
    });
  }
});

// Listen for messages from content script / popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    captureSelection(request.data).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get(['notionToken', 'notionDatabaseId', 'nexusEnabled', 'notionEnabled'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.action === 'transcribeAudio') {
    transcribeAudio(request.audioData).then(result => {
      sendResponse(result);
    }).catch(e => {
      sendResponse({ ok: false, error: e.message });
    });
    return true;
  }
});

// ===============================================================
// CAPTURE LOGIC
// ===============================================================

async function captureSelection(data) {
  const settings = await chrome.storage.sync.get(['notionToken', 'notionDatabaseId', 'nexusEnabled', 'notionEnabled', 'astraPassword']);

  const capture = {
    id: Date.now(),
    type: 'highlight',
    content: data.content,
    category: data.category || 'idea',
    source: data.source,
    sourceTitle: data.title,
    tags: data.tags || [],
    timestamp: new Date().toISOString()
  };

  const results = {
    nexus: null,
    notion: null
  };

  if (settings.nexusEnabled !== false) {
    try {
      results.nexus = await sendToNexus(capture, settings.astraPassword);
    } catch (error) {
      results.nexus = { error: error.message };
    }
  }

  if (settings.notionEnabled !== false && settings.notionToken && settings.notionDatabaseId) {
    try {
      results.notion = await sendToNotion(capture, settings);
    } catch (error) {
      results.notion = { error: error.message };
    }
  }

  await storeLocally(capture);
  notifyCapture(capture, results);

  return results;
}

async function sendToNexus(capture, astraPassword) {
  const headers = { 'Content-Type': 'application/json' };
  if (astraPassword) {
    headers['Authorization'] = `Bearer ${astraPassword}`;
  }
  const response = await fetch(`${NEXUS_API}/api/capture`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(capture)
  });

  if (!response.ok) {
    throw new Error(`NEXUS API error: ${response.status}`);
  }

  return await response.json();
}

async function sendToNotion(capture, settings) {
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { database_id: settings.notionDatabaseId },
      properties: {
        'Name': {
          title: [{ text: { content: truncate(capture.content, 100) } }]
        },
        'Content': {
          rich_text: [{ text: { content: capture.content } }]
        },
        'Category': {
          select: { name: capitalize(capture.category) }
        },
        'Source': {
          url: capture.source
        },
        'Source Title': {
          rich_text: [{ text: { content: capture.sourceTitle || '' } }]
        },
        'Captured': {
          date: { start: capture.timestamp }
        }
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Notion API error: ${response.status}`);
  }

  return await response.json();
}

async function storeLocally(capture) {
  const result = await chrome.storage.local.get(['captures']);
  const captures = result.captures || [];
  captures.unshift(capture);
  if (captures.length > 1000) captures.splice(1000);
  await chrome.storage.local.set({ captures });
}

function notifyCapture(capture, results) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'captureComplete',
        capture: capture,
        results: results
      }).catch(() => {});
    });
  });
}

// ===============================================================
// VOICE TRANSCRIPTION (via ASTRA /api/transcribe)
// ===============================================================

async function transcribeAudio(base64Audio) {
  // Convert base64 back to blob
  const binaryStr = atob(base64Audio);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'audio/webm' });

  const fd = new FormData();
  fd.append('audio', blob, 'recording.webm');

  const res = await fetch(`${NEXUS_API}/api/transcribe`, {
    method: 'POST',
    body: fd
  });

  if (!res.ok) {
    throw new Error(`Transcribe API error: ${res.status}`);
  }

  return await res.json();
}

// ===============================================================
// UTILITIES
// ===============================================================

function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
