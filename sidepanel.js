// ===============================================================
// NEXUS CAPTURE - Side Panel Script
// Mini ASTRA dashboard that lives on the side of any page
// ===============================================================

const ASTRA_URL = 'https://astra-command-center-sigma.vercel.app';
let currentType = 'idea';
let recording = false;
let recorder = null;
let chunks = [];

document.addEventListener('DOMContentLoaded', async () => {
  await checkStatus();
  await loadCaptures();
  setupListeners();
});

// ===============================================================
// STATUS CHECK
// ===============================================================

async function checkStatus() {
  const dot = document.getElementById('sp-status');
  const text = document.getElementById('sp-status-text');
  try {
    const res = await fetch(`${ASTRA_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) { dot.classList.remove('off'); text.textContent = 'Online'; }
    else throw new Error();
  } catch (e) { dot.classList.add('off'); text.textContent = 'Offline'; }
}

// ===============================================================
// CAPTURES
// ===============================================================

async function loadCaptures() {
  const result = await chrome.storage.local.get(['captures']);
  const captures = result.captures || [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - (7 * 86400000);

  document.getElementById('sp-today').textContent = captures.filter(c => new Date(c.timestamp).getTime() >= todayStart).length;
  document.getElementById('sp-week').textContent = captures.filter(c => new Date(c.timestamp).getTime() >= weekStart).length;
  document.getElementById('sp-book').textContent = captures.filter(c => c.category === 'book').length;
  document.getElementById('sp-total').textContent = captures.length;
  document.getElementById('sp-count').textContent = captures.length + ' total';

  const list = document.getElementById('sp-list');
  const recent = captures.slice(0, 15);

  if (!recent.length) {
    list.innerHTML = '<div class="empty">No captures yet. Select text and click the floating button!</div>';
    return;
  }

  list.innerHTML = recent.map(c => `
    <div class="capture-item" data-id="${c.id}" title="Click to copy">
      <div class="capture-text">${escapeHtml(c.content)}</div>
      <div class="capture-meta">
        <span class="cat-dot cat-${c.category || 'idea'}"></span>
        <span>${c.category || 'idea'}</span>
        <span>${formatTime(c.timestamp)}</span>
        ${c.sourceTitle ? '<span>' + escapeHtml(truncate(c.sourceTitle, 30)) + '</span>' : ''}
      </div>
    </div>
  `).join('');
}

// ===============================================================
// SAVE CAPTURE
// ===============================================================

async function saveCapture(text, type) {
  if (!text) return;

  const tab = await getCurrentTab();
  const data = {
    content: text,
    category: type || currentType,
    source: tab ? tab.url : '',
    title: tab ? tab.title : '',
    tags: []
  };

  chrome.runtime.sendMessage({ action: 'capture', data }, (result) => {
    if (chrome.runtime.lastError) {
      showToast('Save failed', true);
      return;
    }
    showToast('Captured as ' + (type || currentType));
    document.getElementById('sp-input').value = '';
    loadCaptures();
  });
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// ===============================================================
// VOICE CAPTURE
// ===============================================================

async function toggleVoice() {
  const btn = document.getElementById('sp-mic');
  if (recording) {
    recorder.stop();
    recording = false;
    btn.classList.remove('recording');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'audio/webm' });
      if (blob.size < 100) { showToast('Too short', true); return; }
      showToast('Transcribing...');

      const settings = await chrome.storage.sync.get(['astraPassword']);
      if (!settings.astraPassword) { showToast('Set ASTRA password in popup settings', true); return; }

      try {
        const fd = new FormData();
        fd.append('audio', blob, 'sidepanel-recording.webm');
        const res = await fetch(`${ASTRA_URL}/api/transcribe`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + settings.astraPassword },
          body: fd
        });
        const data = await res.json();
        if (data.ok && data.text) {
          const input = document.getElementById('sp-input');
          input.value = (input.value ? input.value + ' ' : '') + data.text;
          showToast('Transcribed!');
        } else { showToast('Failed: ' + (data.error || 'unknown'), true); }
      } catch (e) { showToast('Whisper error', true); }
    };
    recorder.start();
    recording = true;
    btn.classList.add('recording');
    showToast('Recording...');
  } catch (e) { showToast('Mic access denied', true); }
}

// ===============================================================
// EVENT LISTENERS
// ===============================================================

function setupListeners() {
  // Type tabs
  document.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentType = tab.dataset.type;
    });
  });

  // Save button
  document.getElementById('sp-save').addEventListener('click', () => {
    saveCapture(document.getElementById('sp-input').value.trim());
  });

  // Enter to save (Cmd+Enter for multiline)
  document.getElementById('sp-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveCapture(document.getElementById('sp-input').value.trim());
    }
  });

  // Mic button
  document.getElementById('sp-mic').addEventListener('click', toggleVoice);

  // Open ASTRA
  document.getElementById('sp-open-astra').addEventListener('click', () => {
    chrome.tabs.create({ url: ASTRA_URL });
  });

  // Grab page text
  document.getElementById('sp-grab-page').addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText.substring(0, 5000)
    }, (results) => {
      if (results && results[0]) {
        document.getElementById('sp-input').value = results[0].result;
        showToast('Page text grabbed');
      }
    });
  });

  // Grab selection
  document.getElementById('sp-grab-selection').addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, (results) => {
      if (results && results[0] && results[0].result) {
        document.getElementById('sp-input').value = results[0].result;
        showToast('Selection grabbed');
      } else { showToast('No text selected', true); }
    });
  });

  // Save URL
  document.getElementById('sp-grab-url').addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    saveCapture(tab.url + ' — ' + tab.title, 'research');
  });

  // Sync captures to ASTRA
  document.getElementById('sp-sync').addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get(['astraPassword']);
    if (!settings.astraPassword) { showToast('Set ASTRA password first', true); return; }
    showToast('Syncing...');

    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    let synced = 0;

    for (const c of captures.slice(0, 50)) {
      try {
        const res = await fetch(`${ASTRA_URL}/api/capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.astraPassword },
          body: JSON.stringify(c)
        });
        if (res.ok) synced++;
      } catch (e) { /* skip failed */ }
    }
    showToast('Synced ' + synced + '/' + Math.min(captures.length, 50));
  });

  // Click capture item to copy
  document.getElementById('sp-list').addEventListener('click', async (e) => {
    const item = e.target.closest('.capture-item');
    if (!item) return;
    const id = parseInt(item.dataset.id);
    const result = await chrome.storage.local.get(['captures']);
    const capture = (result.captures || []).find(c => c.id === id);
    if (capture) {
      await navigator.clipboard.writeText(capture.content);
      item.style.borderColor = 'var(--accent)';
      setTimeout(() => { item.style.borderColor = ''; }, 500);
      showToast('Copied');
    }
  });
}

// ===============================================================
// UTILITIES
// ===============================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  return d.toLocaleDateString();
}

function showToast(msg, isError) {
  let toast = document.getElementById('sp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sp-toast';
    toast.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;font-size:10px;font-family:inherit;z-index:100;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? 'var(--red)' : 'var(--cyan)';
  toast.style.color = 'var(--bg)';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
