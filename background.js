// ═══════════════════════════════════════════════════════════════
// NEXUS CAPTURE - Background Service Worker
// Routes captures to Notion + NEXUS Backend
// ═══════════════════════════════════════════════════════════════

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

  // Set default settings
  chrome.storage.sync.get(['notionToken', 'notionDatabaseId', 'nexusEnabled', 'notionEnabled'], (result) => {
    if (result.nexusEnabled === undefined) {
      chrome.storage.sync.set({ nexusEnabled: true });
    }
    if (result.notionEnabled === undefined) {
      chrome.storage.sync.set({ notionEnabled: true });
    }
  });

  console.log('NEXUS CAPTURE installed');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
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

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    captureSelection(request.data).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get(['notionToken', 'notionDatabaseId', 'nexusEnabled', 'notionEnabled'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});

// ═══════════════════════════════════════════════════════════════
// CAPTURE LOGIC
// ═══════════════════════════════════════════════════════════════

async function captureSelection(data) {
  const settings = await chrome.storage.sync.get(['notionToken', 'notionDatabaseId', 'nexusEnabled', 'notionEnabled']);

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

  // Send to NEXUS
  if (settings.nexusEnabled !== false) {
    try {
      results.nexus = await sendToNexus(capture);
    } catch (error) {
      results.nexus = { error: error.message };
    }
  }

  // Send to Notion
  if (settings.notionEnabled !== false && settings.notionToken && settings.notionDatabaseId) {
    try {
      results.notion = await sendToNotion(capture, settings);
    } catch (error) {
      results.notion = { error: error.message };
    }
  }

  // Store locally as backup
  await storeLocally(capture);

  // Notify content script
  notifyCapture(capture, results);

  return results;
}

async function sendToNexus(capture) {
  const response = await fetch(`${NEXUS_API}/api/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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

  // Keep last 1000 captures
  if (captures.length > 1000) {
    captures.splice(1000);
  }

  await chrome.storage.local.set({ captures });
}

function notifyCapture(capture, results) {
  // Send notification to all tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'captureComplete',
        capture: capture,
        results: results
      }).catch(() => {}); // Ignore errors for tabs without content script
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
