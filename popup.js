// ═══════════════════════════════════════════════════════════════
// NEXUS CAPTURE - Popup Script
// ═══════════════════════════════════════════════════════════════

const NEXUS_URL = 'https://astra-command-center-sigma.vercel.app';
const API_URL = 'https://astra-command-center-sigma.vercel.app';

// Category colors
const CATEGORY_COLORS = {
  idea: 'color-idea',
  quote: 'color-quote',
  code: 'color-code',
  insight: 'color-insight',
  todo: 'color-todo',
  book: 'color-book',
  research: 'color-research',
  other: 'color-other'
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStats();
  await loadRecentCaptures();
  await checkApiStatus();
  setupEventListeners();
});

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'notionToken',
    'notionDatabaseId',
    'nexusEnabled',
    'notionEnabled',
    'astraPassword'
  ]);

  // Toggles
  const nexusToggle = document.getElementById('toggle-nexus');
  const notionToggle = document.getElementById('toggle-notion');

  nexusToggle.classList.toggle('active', settings.nexusEnabled !== false);
  notionToggle.classList.toggle('active', settings.notionEnabled === true);

  // ASTRA password
  if (settings.astraPassword) {
    document.getElementById('astra-password').value = settings.astraPassword;
  }

  // Notion fields
  if (settings.notionToken) {
    document.getElementById('notion-token').value = settings.notionToken;
  }
  if (settings.notionDatabaseId) {
    document.getElementById('notion-db').value = settings.notionDatabaseId;
  }
}

async function saveSettings() {
  const settings = {
    astraPassword: document.getElementById('astra-password').value.trim(),
    notionToken: document.getElementById('notion-token').value.trim(),
    notionDatabaseId: document.getElementById('notion-db').value.trim(),
    nexusEnabled: document.getElementById('toggle-nexus').classList.contains('active'),
    notionEnabled: document.getElementById('toggle-notion').classList.contains('active')
  };

  await chrome.storage.sync.set(settings);
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════

async function loadStats() {
  const result = await chrome.storage.local.get(['captures']);
  const captures = result.captures || [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - (7 * 24 * 60 * 60 * 1000);

  const todayCount = captures.filter(c => new Date(c.timestamp).getTime() >= todayStart).length;
  const weekCount = captures.filter(c => new Date(c.timestamp).getTime() >= weekStart).length;

  document.getElementById('stat-today').textContent = todayCount;
  document.getElementById('stat-week').textContent = weekCount;
  document.getElementById('stat-total').textContent = captures.length;
}

// ═══════════════════════════════════════════════════════════════
// RECENT CAPTURES
// ═══════════════════════════════════════════════════════════════

async function loadRecentCaptures() {
  const result = await chrome.storage.local.get(['captures']);
  const captures = (result.captures || []).slice(0, 5);

  const container = document.getElementById('recent-list');

  if (captures.length === 0) {
    container.innerHTML = '<div class="empty">No captures yet. Select text on any page!</div>';
    return;
  }

  container.innerHTML = captures.map(c => `
    <div class="recent-item" data-id="${c.id}">
      <div class="recent-color ${CATEGORY_COLORS[c.category] || 'color-other'}"></div>
      <div class="recent-content">
        <div class="recent-text">${escapeHtml(c.content)}</div>
        <div class="recent-meta">${c.category} • ${formatTime(c.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════
// API STATUS
// ═══════════════════════════════════════════════════════════════

async function checkApiStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  try {
    const response = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      dot.classList.remove('offline');
      text.textContent = 'Connected';
    } else {
      throw new Error('API error');
    }
  } catch (error) {
    dot.classList.add('offline');
    text.textContent = 'Offline';
  }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Toggle switches
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', async () => {
      toggle.classList.toggle('active');
      await saveSettings();
    });
  });

  // Settings inputs (save on blur)
  document.getElementById('astra-password').addEventListener('blur', saveSettings);
  document.getElementById('notion-token').addEventListener('blur', saveSettings);
  document.getElementById('notion-db').addEventListener('blur', saveSettings);

  // Export button
  document.getElementById('btn-export').addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];

    const data = {
      exported: new Date().toISOString(),
      count: captures.length,
      captures: captures
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `saturno-captures-${new Date().toISOString().split('T')[0]}.json`
    });
  });

  // Open NEXUS button
  document.getElementById('btn-open-nexus').addEventListener('click', () => {
    chrome.tabs.create({ url: NEXUS_URL });
  });

  // Recent item click - copy content
  document.getElementById('recent-list').addEventListener('click', async (e) => {
    const item = e.target.closest('.recent-item');
    if (!item) return;

    const id = parseInt(item.dataset.id);
    const result = await chrome.storage.local.get(['captures']);
    const capture = (result.captures || []).find(c => c.id === id);

    if (capture) {
      await navigator.clipboard.writeText(capture.content);
      item.style.borderColor = 'var(--accent-green)';
      setTimeout(() => {
        item.style.borderColor = '';
      }, 500);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return date.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN EXPORT (Added by overnight script)
// ═══════════════════════════════════════════════════════════════

async function exportAsMarkdown() {
  const result = await chrome.storage.local.get(['captures']);
  const captures = result.captures || [];

  if (captures.length === 0) {
    alert('No captures to export');
    return;
  }

  // Group by date
  const byDate = {};
  captures.forEach(c => {
    const date = new Date(c.timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(c);
  });

  // Build Markdown
  let md = `# NEXUS CAPTURES\n`;
  md += `> Exported: ${new Date().toLocaleString()}\n`;
  md += `> Total: ${captures.length} highlights\n\n`;
  md += `---\n\n`;

  Object.entries(byDate).forEach(([date, items]) => {
    md += `## ${date}\n\n`;
    items.forEach(c => {
      const category = c.category ? `[${c.category.toUpperCase()}]` : '';
      const tags = c.tags?.length ? `\`${c.tags.join('` `')}\`` : '';

      md += `### ${category} ${c.title || 'Untitled'}\n\n`;
      md += `> ${c.content}\n\n`;
      if (c.source) md += `**Source:** [${new URL(c.source).hostname}](${c.source})\n\n`;
      if (tags) md += `**Tags:** ${tags}\n\n`;
      md += `---\n\n`;
    });
  });

  // Download
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: url,
    filename: `saturno-captures-${new Date().toISOString().split('T')[0]}.md`
  });
}

// Update export button to show options
document.getElementById('btn-export').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  exportAsMarkdown();
});
