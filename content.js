// ═══════════════════════════════════════════════════════════════
// NEXUS CAPTURE - Content Script
// Injects capture UI into all pages
// ═══════════════════════════════════════════════════════════════

(function() {
  'use strict';

  let floatingButton = null;
  let captureModal = null;
  let lastSelection = '';
  let lastRange = null; // Store the selection range for highlighting

  // ═══════════════════════════════════════════════════════════════
  // FLOATING CAPTURE BUTTON
  // ═══════════════════════════════════════════════════════════════

  function createFloatingButton() {
    if (floatingButton) return;

    floatingButton = document.createElement('div');
    floatingButton.id = 'saturno-capture-btn';
    floatingButton.innerHTML = `
      <div class="saturno-capture-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </div>
    `;
    floatingButton.style.cssText = `
      position: fixed;
      display: none;
      z-index: 2147483647;
      width: 32px;
      height: 32px;
      background: #0a0a0a;
      border: 1px solid #00ffcc;
      border-radius: 4px;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 255, 204, 0.3);
      transition: all 0.2s;
    `;

    floatingButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showCaptureModal();
    });

    floatingButton.addEventListener('mouseenter', () => {
      floatingButton.style.transform = 'scale(1.1)';
      floatingButton.style.borderColor = '#00ffcc';
    });

    floatingButton.addEventListener('mouseleave', () => {
      floatingButton.style.transform = 'scale(1)';
    });

    document.body.appendChild(floatingButton);
  }

  function showFloatingButton(x, y) {
    if (!floatingButton) createFloatingButton();

    // Store selection NOW (before click deselects it)
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text) {
      lastSelection = text;
      if (selection.rangeCount > 0) {
        lastRange = selection.getRangeAt(0).cloneRange();
      }
    }

    floatingButton.style.display = 'flex';
    floatingButton.style.left = `${x + 10}px`;
    floatingButton.style.top = `${y - 40}px`;
  }

  function hideFloatingButton() {
    if (floatingButton) {
      floatingButton.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CAPTURE MODAL
  // ═══════════════════════════════════════════════════════════════

  // Category colors - Clasp style
  const CATEGORY_CONFIG = {
    idea:     { color: '#00ffcc', icon: '💡', label: 'Idea' },
    quote:    { color: '#d4af37', icon: '💬', label: 'Quote' },
    code:     { color: '#a855f7', icon: '⌨️', label: 'Code' },
    insight:  { color: '#22c55e', icon: '🎯', label: 'Insight' },
    todo:     { color: '#ef4444', icon: '✓', label: 'To-Do' },
    book:     { color: '#3b82f6', icon: '📖', label: 'Book' },
    research: { color: '#f97316', icon: '🔬', label: 'Research' },
    thought:  { color: '#ec4899', icon: '💭', label: 'Thought' }
  };

  function createCaptureModal() {
    if (captureModal) return;

    captureModal = document.createElement('div');
    captureModal.id = 'saturno-capture-modal';
    captureModal.innerHTML = `
      <div class="saturno-modal-backdrop"></div>
      <div class="saturno-modal-content">
        <div class="saturno-modal-header">
          <span class="saturno-modal-logo">NEXUS CAPTURE</span>
          <button class="saturno-modal-close">&times;</button>
        </div>

        <div class="saturno-modal-body">
          <div class="saturno-field">
            <label class="saturno-label">SELECTED TEXT</label>
            <div class="saturno-preview" id="saturno-preview"></div>
          </div>

          <div class="saturno-field">
            <label class="saturno-label">COLOR / CATEGORY</label>
            <div class="saturno-color-grid" id="saturno-categories">
              ${Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => `
                <button class="saturno-color-btn ${key === 'idea' ? 'active' : ''}" data-cat="${key}" style="--cat-color: ${cfg.color};" title="${cfg.label}">
                  <span class="saturno-color-dot"></span>
                  <span class="saturno-color-label">${cfg.label}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="saturno-field">
            <label class="saturno-label">TAGS (comma separated)</label>
            <input type="text" class="saturno-input" id="saturno-tags" placeholder="research, important, book">
          </div>

          <div class="saturno-destinations">
            <label class="saturno-checkbox">
              <input type="checkbox" id="saturno-to-nexus" checked>
              <span>Send to NEXUS</span>
            </label>
            <label class="saturno-checkbox">
              <input type="checkbox" id="saturno-to-notion" checked>
              <span>Send to Notion</span>
            </label>
          </div>
        </div>

        <div class="saturno-modal-footer">
          <button class="saturno-btn saturno-btn-secondary" id="saturno-cancel">Cancel</button>
          <button class="saturno-btn saturno-btn-primary" id="saturno-save">
            <span id="saturno-save-text">Capture</span>
            <span id="saturno-save-loading" style="display:none;">Saving...</span>
          </button>
        </div>

        <div class="saturno-toast" id="saturno-toast"></div>
      </div>
    `;

    document.body.appendChild(captureModal);

    // Event listeners
    captureModal.querySelector('.saturno-modal-backdrop').addEventListener('click', hideCaptureModal);
    captureModal.querySelector('.saturno-modal-close').addEventListener('click', hideCaptureModal);
    captureModal.querySelector('#saturno-cancel').addEventListener('click', hideCaptureModal);
    captureModal.querySelector('#saturno-save').addEventListener('click', saveCapture);

    // Category/Color buttons
    captureModal.querySelectorAll('.saturno-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        captureModal.querySelectorAll('.saturno-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (captureModal.style.display === 'flex') {
        if (e.key === 'Escape') hideCaptureModal();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveCapture();
      }
    });
  }

  function showCaptureModal() {
    if (!captureModal) createCaptureModal();

    // Use stored selection (saved when floating button appeared)
    // This prevents the bug where clicking the button deselects the text
    if (!lastSelection) {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if (!text) return;
      lastSelection = text;
      if (selection.rangeCount > 0) {
        lastRange = selection.getRangeAt(0).cloneRange();
      }
    }
    hideFloatingButton();

    captureModal.querySelector('#saturno-preview').textContent = lastSelection;
    captureModal.querySelector('#saturno-tags').value = '';
    captureModal.querySelectorAll('.saturno-color-btn').forEach((b, i) => {
      b.classList.toggle('active', i === 0);
    });

    // Load settings
    chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
      const notionCheckbox = captureModal.querySelector('#saturno-to-notion');
      const hasNotion = settings.notionToken && settings.notionDatabaseId;
      notionCheckbox.checked = hasNotion && settings.notionEnabled !== false;
      notionCheckbox.disabled = !hasNotion;

      const nexusCheckbox = captureModal.querySelector('#saturno-to-nexus');
      nexusCheckbox.checked = settings.nexusEnabled !== false;
    });

    captureModal.style.display = 'flex';
    captureModal.querySelector('#saturno-tags').focus();
  }

  function hideCaptureModal() {
    if (captureModal) {
      captureModal.style.display = 'none';
    }
  }

  async function saveCapture() {
    const saveBtn = captureModal.querySelector('#saturno-save');
    const saveText = captureModal.querySelector('#saturno-save-text');
    const saveLoading = captureModal.querySelector('#saturno-save-loading');

    saveBtn.disabled = true;
    saveText.style.display = 'none';
    saveLoading.style.display = 'inline';

    const category = captureModal.querySelector('.saturno-color-btn.active').dataset.cat;
    const tagsInput = captureModal.querySelector('#saturno-tags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    const highlightId = `sh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const context = getSelectionContext();

    const data = {
      content: lastSelection,
      category: category,
      tags: tags,
      source: window.location.href,
      title: document.title
    };

    try {
      const results = await chrome.runtime.sendMessage({ action: 'capture', data: data });

      // Create visual highlight on page
      if (lastRange) {
        createVisualHighlight(lastRange, category, highlightId);

        // Save for persistence (restore on page revisit)
        await saveHighlightToStorage({
          id: highlightId,
          text: lastSelection,
          category: category,
          contextBefore: context.before,
          contextAfter: context.after,
          timestamp: Date.now()
        });
      }

      let message = 'Captured & Highlighted!';
      if (results.nexus?.error) message += ' (NEXUS failed)';
      if (results.notion?.error) message += ' (Notion failed)';

      showToast(message, !results.nexus?.error && !results.notion?.error);

      // Clear selection
      window.getSelection().removeAllRanges();
      lastRange = null;

      setTimeout(hideCaptureModal, 1000);
    } catch (error) {
      showToast('Error: ' + error.message, false);
    }

    saveBtn.disabled = false;
    saveText.style.display = 'inline';
    saveLoading.style.display = 'none';
  }

  function showToast(message, success = true) {
    const toast = captureModal.querySelector('#saturno-toast');
    toast.textContent = message;
    toast.className = 'saturno-toast show ' + (success ? 'success' : 'error');

    setTimeout(() => {
      toast.className = 'saturno-toast';
    }, 3000);
  }

  // ═══════════════════════════════════════════════════════════════
  // SELECTION LISTENER
  // ═══════════════════════════════════════════════════════════════

  document.addEventListener('mouseup', (e) => {
    // Don't show if clicking on our elements
    if (e.target.closest('#saturno-capture-btn') || e.target.closest('#saturno-capture-modal')) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection().toString().trim();

      if (selection.length > 0) {
        showFloatingButton(e.pageX, e.pageY);
      } else {
        hideFloatingButton();
      }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#saturno-capture-btn')) {
      hideFloatingButton();
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSelection') {
      const selection = window.getSelection().toString().trim();
      sendResponse({ text: selection });
    }

    if (request.action === 'captureComplete') {
      // Could show a notification on the page
      console.log('Capture complete:', request.capture);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // HIGHLIGHT PERSISTENCE - Visual highlights on page
  // ═══════════════════════════════════════════════════════════════

  const HIGHLIGHT_COLORS = {
    idea:     { bg: 'rgba(0, 255, 204, 0.25)', border: '#00ffcc' },
    quote:    { bg: 'rgba(212, 175, 55, 0.25)', border: '#d4af37' },
    code:     { bg: 'rgba(168, 85, 247, 0.25)', border: '#a855f7' },
    insight:  { bg: 'rgba(34, 197, 94, 0.25)', border: '#22c55e' },
    todo:     { bg: 'rgba(239, 68, 68, 0.25)', border: '#ef4444' },
    book:     { bg: 'rgba(59, 130, 246, 0.25)', border: '#3b82f6' },
    research: { bg: 'rgba(249, 115, 22, 0.25)', border: '#f97316' },
    thought:  { bg: 'rgba(236, 72, 153, 0.25)', border: '#ec4899' }
  };

  // Create visual highlight on the page
  function createVisualHighlight(range, category, highlightId) {
    if (!range) return null;

    const colors = HIGHLIGHT_COLORS[category] || HIGHLIGHT_COLORS.idea;

    try {
      const mark = document.createElement('mark');
      mark.className = 'saturno-page-highlight';
      mark.dataset.highlightId = highlightId;
      mark.dataset.category = category;
      mark.style.cssText = `
        background: ${colors.bg} !important;
        border-bottom: 2px solid ${colors.border} !important;
        padding: 1px 2px !important;
        border-radius: 2px !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
      `;

      // Add hover effect
      mark.addEventListener('mouseenter', () => {
        mark.style.background = colors.bg.replace('0.25', '0.4');
      });
      mark.addEventListener('mouseleave', () => {
        mark.style.background = colors.bg;
      });

      // Click to show details or copy
      mark.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(mark.textContent);
        showQuickToast('Copied to clipboard');
      });

      range.surroundContents(mark);
      return mark;
    } catch (e) {
      // surroundContents fails if selection spans multiple elements
      // Fall back to simple approach
      console.log('Could not wrap selection, using fallback');
      return null;
    }
  }

  // Save highlight data for persistence
  async function saveHighlightToStorage(highlightData) {
    const pageUrl = window.location.href;
    const storageKey = 'saturno_page_highlights';

    try {
      const result = await chrome.storage.local.get([storageKey]);
      const allHighlights = result[storageKey] || {};

      if (!allHighlights[pageUrl]) {
        allHighlights[pageUrl] = [];
      }

      allHighlights[pageUrl].push(highlightData);

      await chrome.storage.local.set({ [storageKey]: allHighlights });
    } catch (e) {
      console.error('Failed to save highlight:', e);
    }
  }

  // Restore highlights when page loads
  async function restoreHighlights() {
    const pageUrl = window.location.href;
    const storageKey = 'saturno_page_highlights';

    try {
      const result = await chrome.storage.local.get([storageKey]);
      const allHighlights = result[storageKey] || {};
      const pageHighlights = allHighlights[pageUrl] || [];

      if (pageHighlights.length === 0) return;

      console.log(`Restoring ${pageHighlights.length} highlights for this page`);

      pageHighlights.forEach(h => {
        restoreSingleHighlight(h);
      });
    } catch (e) {
      console.error('Failed to restore highlights:', e);
    }
  }

  // Find and highlight text on page
  function restoreSingleHighlight(highlightData) {
    const { text, category, id, contextBefore, contextAfter } = highlightData;

    // Use TreeWalker to find text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const nodeText = node.textContent;
      const index = nodeText.indexOf(text);

      if (index !== -1) {
        // Verify context if available
        if (contextBefore || contextAfter) {
          const parent = node.parentElement;
          const fullText = parent?.textContent || '';
          const textIndex = fullText.indexOf(text);

          if (textIndex === -1) continue;

          const before = fullText.substring(Math.max(0, textIndex - 30), textIndex);
          const after = fullText.substring(textIndex + text.length, textIndex + text.length + 30);

          // Check if context matches (fuzzy)
          if (contextBefore && !before.includes(contextBefore.substring(0, 15))) continue;
          if (contextAfter && !after.includes(contextAfter.substring(0, 15))) continue;
        }

        try {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);

          createVisualHighlight(range, category, id);
          return; // Found and highlighted
        } catch (e) {
          console.log('Failed to restore highlight:', e);
        }
      }
    }
  }

  // Quick toast for highlight interactions
  function showQuickToast(message) {
    let toast = document.getElementById('saturno-quick-toast');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'saturno-quick-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #0a0a0a;
        border: 1px solid #00ffcc;
        color: #00ffcc;
        padding: 10px 20px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        z-index: 2147483647;
        transition: transform 0.3s ease;
        border-radius: 4px;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
    }, 2000);
  }

  // Get context around selection for better restoration
  function getSelectionContext() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return { before: '', after: '' };

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const fullText = container.textContent || '';
    const selectedText = selection.toString();
    const textIndex = fullText.indexOf(selectedText);

    if (textIndex === -1) return { before: '', after: '' };

    return {
      before: fullText.substring(Math.max(0, textIndex - 30), textIndex),
      after: fullText.substring(textIndex + selectedText.length, textIndex + selectedText.length + 30)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════

  createFloatingButton();

  // Restore highlights after page fully loads
  if (document.readyState === 'complete') {
    restoreHighlights();
  } else {
    window.addEventListener('load', () => {
      setTimeout(restoreHighlights, 500); // Small delay for dynamic content
    });
  }

})();
