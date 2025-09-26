// command-palette-hub-component.js
// Shadow DOM command palette overlay extracted from zendesk--cmd-prompts.user.js

(function () {
  'use strict';

  const DEFAULT_SHORTCUT = { key: '/', ctrlKey: true, metaKey: true };

  const BASE_STYLE = `
    :host {
      all: initial;
      position: relative;
      z-index: 2147483600;
    }

    .overlay {
      position: fixed;
      inset: 0;
      display: none;
      justify-content: center;
      align-items: flex-start;
      padding-top: 15vh;
      background-color: rgba(15, 23, 42, 0.55);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      color: #111827;
    }

    .overlay[data-state='open'] {
      display: flex;
    }

    .container {
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 35px 80px rgba(15, 23, 42, 0.28), 0 12px 32px rgba(15, 23, 42, 0.18);
      width: min(720px, 92vw);
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .input {
      border: none;
      border-bottom: 1px solid #e5e7eb;
      padding: 16px 20px;
      font-size: 18px;
      outline: none;
      font-family: inherit;
    }

    .status {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 8px 20px;
      font-size: 13px;
      border-bottom: 1px solid #e5e7eb;
      background: #f0f8ff;
      color: #1d4ed8;
    }

    .status[data-visible='true'] {
      display: flex;
    }

    .status.loading {
      animation: hub-pulse 1.5s ease-in-out infinite;
    }

    .spinner {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      animation: hub-spin 0.9s linear infinite;
    }

    .suggestions {
      max-height: 320px;
      overflow-y: auto;
      border-bottom: 1px solid #e5e7eb;
      background: #ffffff;
    }

    .category {
      padding: 8px 20px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #64748b;
      background: #f8fafc;
    }

    .suggestion {
      padding: 12px 20px;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: background 140ms ease;
    }

    .suggestion:hover,
    .suggestion[data-active='true'] {
      background: #eef4ff;
    }

    .suggestion-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }

    .suggestion-desc {
      font-size: 11px;
      color: #475569;
    }

    .preview {
      display: none;
      flex-direction: column;
      gap: 12px;
      padding: 16px 20px;
      background: #f8fafc;
    }

    .preview[data-visible='true'] {
      display: flex;
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .preview-title {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .preview-actions {
      display: flex;
      gap: 8px;
    }

    .preview-actions button {
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      background: #4f46e5;
      color: white;
      font-family: inherit;
    }

    .preview-actions button.secondary {
      background: rgba(79, 70, 229, 0.12);
      color: #4338ca;
    }

    .preview-content {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px;
      max-height: 240px;
      overflow-y: auto;
      background: #ffffff;
      font-size: 13px;
      line-height: 1.5;
      color: #111827;
    }

    .info {
      padding: 8px 20px;
      font-size: 11px;
      color: #6b7280;
      background: #f8fafc;
    }

    @keyframes hub-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes hub-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
  `;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function convertTextToHtml(text) {
    if (!text) return '';

    const hasHtml = /<[^>]+>/.test(text);
    let processed = String(text ?? '');

    const replaceMarkdown = (input) =>
      input
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\*\*((?:(?!\*\*).)*)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>');

    if (hasHtml) {
      processed = replaceMarkdown(processed);
    } else {
      processed = replaceMarkdown(processed);
    }

    const blocks = processed.split(/\n\s*\n/);
    let html = '';

    blocks.forEach((block) => {
      const trimmed = block.trim();
      if (!trimmed) return;

      if (trimmed === '---') {
        html += '<hr />';
        return;
      }

      if (/^###\s/.test(trimmed)) {
        html += `<h3>${escapeHtml(trimmed.replace(/^###\s*/, ''))}</h3>`;
        return;
      }

      if (/^##\s/.test(trimmed)) {
        html += `<h2>${escapeHtml(trimmed.replace(/^##\s*/, ''))}</h2>`;
        return;
      }

      if (/^#\s/.test(trimmed)) {
        html += `<h1>${escapeHtml(trimmed.replace(/^#\s*/, ''))}</h1>`;
        return;
      }

      if (/^\d+\.\s/.test(trimmed)) {
        const lines = trimmed.split(/\n/);
        html += '<ol>';
        lines.forEach((line) => {
          const clean = line.replace(/^\d+\.\s*/, '');
          html += `<li>${escapeHtml(clean)}</li>`;
        });
        html += '</ol>';
        return;
      }

      if (/^[-*•]\s/.test(trimmed)) {
        const lines = trimmed.split(/\n/);
        html += '<ul>';
        lines.forEach((line) => {
          const clean = line.replace(/^[-*•]\s*/, '');
          html += `<li>${escapeHtml(clean)}</li>`;
        });
        html += '</ul>';
        return;
      }

      html += `<p>${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`;
    });

    return html;
  }

  function resolveShortcutConfig(shortcut) {
    if (shortcut === false || shortcut === null) {
      return null;
    }

    if (!shortcut || typeof shortcut !== 'object') return { ...DEFAULT_SHORTCUT };
    return {
      key: typeof shortcut.key === 'string' ? shortcut.key : DEFAULT_SHORTCUT.key,
      ctrlKey: Boolean(shortcut.ctrlKey),
      metaKey: Boolean(shortcut.metaKey),
      altKey: Boolean(shortcut.altKey),
      shiftKey: Boolean(shortcut.shiftKey),
    };
  }

  function matchesShortcut(event, shortcut) {
    if (!shortcut) return false;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : event.key;
    const targetKey = (shortcut.key || '/').toLowerCase();
    if (key !== targetKey && !(targetKey === '/' && key === '?')) return false;

    if (!!event.ctrlKey !== !!shortcut.ctrlKey) return false;
    if (!!event.metaKey !== !!shortcut.metaKey) return false;
    if (!!event.altKey !== !!shortcut.altKey) return false;
    if (!!event.shiftKey !== !!shortcut.shiftKey) return false;

    return true;
  }

  function createPalette(options = {}) {
    const shortcut = resolveShortcutConfig(options.keyboardShortcut);

    const host = document.createElement('div');
    host.id = options.id || `command-palette-${Math.random().toString(36).slice(2, 9)}`;
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = BASE_STYLE;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.dataset.state = 'closed';

    const container = document.createElement('div');
    container.className = 'container';

    const input = document.createElement('textarea');
    input.className = 'input';
    input.rows = 1;
    input.placeholder = options.placeholder || 'Type to search…';
    input.autocomplete = 'off';
    input.setAttribute('spellcheck', 'false');
    input.style.resize = 'vertical';

    const status = document.createElement('div');
    status.className = 'status';

    const suggestions = document.createElement('div');
    suggestions.className = 'suggestions';

    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.dataset.visible = 'false';

    const previewHeader = document.createElement('div');
    previewHeader.className = 'preview-header';

    const previewTitle = document.createElement('span');
    previewTitle.className = 'preview-title';
    previewTitle.textContent = 'Preview';

    const previewActions = document.createElement('div');
    previewActions.className = 'preview-actions';

    const previewPrimary = document.createElement('button');
    previewPrimary.textContent = 'Insert';
    previewPrimary.hidden = true;

    const previewSecondary = document.createElement('button');
    previewSecondary.textContent = 'Copy';
    previewSecondary.classList.add('secondary');
    previewSecondary.hidden = true;

    previewActions.append(previewPrimary, previewSecondary);
    previewHeader.append(previewTitle, previewActions);

    const previewContent = document.createElement('div');
    previewContent.className = 'preview-content';

    preview.append(previewHeader, previewContent);

    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = options.infoHtml || '💡 <strong>Use arrow keys</strong> to navigate • <strong>Enter</strong> to run • <strong>Esc</strong> to close';

    container.append(input, status, suggestions, preview, info);
    overlay.appendChild(container);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    let activeIndex = -1;
    let filteredItems = [];
    let targetEditor = null;
    let previewPrimaryHandler = null;
    let previewSecondaryHandler = null;

    const state = {
      groups: [],
      suggestions: [],
      quickSubmitEnabled: true,
    };

    function flattenGroups(groups) {
      const flattened = [];
      groups.forEach((group) => {
        const label = group.label || 'Commands';
        (group.items || []).forEach((item) => {
          flattened.push({
            group: label,
            item,
          });
        });
      });
      return flattened;
    }

    function renderSuggestions() {
      suggestions.innerHTML = '';
      let currentCategory = '';
      filteredItems.forEach((entry, index) => {
        if (entry.group !== currentCategory) {
          currentCategory = entry.group;
          const categoryEl = document.createElement('div');
          categoryEl.className = 'category';
          categoryEl.textContent = currentCategory;
          suggestions.appendChild(categoryEl);
        }

        const suggestionEl = document.createElement('div');
        suggestionEl.className = 'suggestion';
        suggestionEl.dataset.index = String(index);

        const title = document.createElement('div');
        title.className = 'suggestion-title';
        title.textContent = entry.item.title || 'Untitled';

        const desc = document.createElement('div');
        desc.className = 'suggestion-desc';
        desc.textContent = entry.item.description || '';

        if (!entry.item.description) {
          desc.style.display = 'none';
        }

        suggestionEl.append(title, desc);

        suggestionEl.addEventListener('mouseenter', () => {
          setActiveIndex(index, false);
        });

        suggestionEl.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });

        suggestionEl.addEventListener('click', () => {
          setActiveIndex(index, false);
          activateSelection();
        });

        suggestions.appendChild(suggestionEl);
      });

      updateActiveStyles();
    }

    function updateActiveStyles() {
      const nodes = suggestions.querySelectorAll('.suggestion');
      nodes.forEach((node) => {
        node.dataset.active = 'false';
      });

      if (activeIndex < 0 || activeIndex >= nodes.length) return;
      const activeNode = nodes[activeIndex];
      if (activeNode) {
        activeNode.dataset.active = 'true';
        activeNode.scrollIntoView({ block: 'nearest' });
      }
    }

    function filterSuggestions() {
      const rawQuery = input.value.toLowerCase();
      const tagRegex = /#([a-z0-9_-]+)/gi;
      const tags = [];
      let match;
      while ((match = tagRegex.exec(rawQuery)) !== null) {
        tags.push(match[1]);
      }

      const textQuery = rawQuery.replace(/#([a-z0-9_-]+)/gi, '').trim();

      filteredItems = state.suggestions.filter((entry) => {
        const tagsMatch = !tags.length
          || (Array.isArray(entry.item.tags)
            ? tags.every((tag) => entry.item.tags.some((itemTag) => itemTag.toLowerCase().includes(tag)))
            : typeof entry.item.tags === 'string'
            ? tags.every((tag) => entry.item.tags.toLowerCase().includes(tag))
            : false);

        if (!tagsMatch) return false;

        if (!textQuery) return true;

        const haystack = [
          entry.item.title || '',
          entry.item.description || '',
          entry.group || '',
          Array.isArray(entry.item.tags) ? entry.item.tags.join(' ') : entry.item.tags || '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(textQuery);
      });

      activeIndex = filteredItems.length ? 0 : -1;
      renderSuggestions();
    }

    function setActiveIndex(index, wrap = true) {
      if (!filteredItems.length) {
        activeIndex = -1;
        updateActiveStyles();
        return;
      }

      if (wrap) {
        const length = filteredItems.length;
        activeIndex = ((index % length) + length) % length;
      } else {
        activeIndex = Math.max(0, Math.min(index, filteredItems.length - 1));
      }

      updateActiveStyles();
    }

    function activateSelection() {
      if (activeIndex < 0 || activeIndex >= filteredItems.length) {
        const query = input.value.trim();
        if (query && typeof options.onCustomCommand === 'function') {
          options.onCustomCommand(query, targetEditor);
          host.dispatchEvent(
            new CustomEvent('he:submit', {
              detail: { query, queryRaw: input.value, via: 'custom' },
            })
          );
        }
        return;
      }

      const selected = filteredItems[activeIndex];
      if (!selected || !selected.item) return;

      if (typeof selected.item.onSelect === 'function') {
        try {
          selected.item.onSelect(selected.item, targetEditor);
        } catch (error) {
          console.error('Command palette item handler failed:', error);
        }
      }

      const keepOpen = selected.item.keepOpen === true;
      if (!keepOpen) {
        hide();
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!filteredItems.length) return;
        setActiveIndex(activeIndex + 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!filteredItems.length) return;
        setActiveIndex(activeIndex - 1);
        return;
      }

      if (event.key === 'Enter') {
        const isModifier = event.metaKey || event.ctrlKey;
        if (isModifier && typeof options.onCustomCommand === 'function') {
          event.preventDefault();
          const query = input.value.trim();
          if (query) {
            options.onCustomCommand(query, targetEditor);
            host.dispatchEvent(
              new CustomEvent('he:submit', {
                detail: { query, queryRaw: input.value, via: 'modifier-enter' },
              })
            );
          }
          return;
        }

        event.preventDefault();
        activateSelection();
      }
    }

    function onDocumentKeyDown(event) {
      if (overlay.dataset.state !== 'open' && matchesShortcut(event, shortcut)) {
        const focusable = typeof options.resolveTargetEditor === 'function'
          ? options.resolveTargetEditor(event)
          : document.activeElement;
        event.preventDefault();
        show(focusable);
      }
    }

    function show(editor) {
      targetEditor = editor || document.activeElement;
      overlay.dataset.state = 'open';
      input.value = '';
      filterSuggestions();
      setStatus('Type to search commands or press Enter to run.', { variant: 'info' });
      hidePreview(true);

      requestAnimationFrame(() => {
        input.focus();
      });

      host.dispatchEvent(new CustomEvent('he:open', { detail: { palette: api } }));
      document.addEventListener('keydown', onKeyDown, true);
    }

    function hide() {
      overlay.dataset.state = 'closed';
      targetEditor = null;
      clearStatus();
      hidePreview(true);
      document.removeEventListener('keydown', onKeyDown, true);
      host.dispatchEvent(new CustomEvent('he:close', { detail: { palette: api } }));
    }

    function toggle(editor) {
      if (overlay.dataset.state === 'open') {
        hide();
      } else {
        show(editor);
      }
    }

    function setData(groups) {
      state.groups = Array.isArray(groups) ? groups : [];
      state.suggestions = flattenGroups(state.groups);
      filterSuggestions();
    }

    function setStatus(message, options = {}) {
      if (!message) {
        clearStatus();
        return;
      }

      status.dataset.visible = 'true';
      status.textContent = '';
      status.classList.toggle('loading', Boolean(options.loading));

      if (options.loading) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        status.appendChild(spinner);
      }

      const text = document.createElement('span');
      text.textContent = message;
      status.appendChild(text);
    }

    function clearStatus() {
      status.dataset.visible = 'false';
      status.classList.remove('loading');
      status.innerHTML = '';
    }

    function configurePreview(options = {}) {
      previewPrimaryHandler = null;
      previewSecondaryHandler = null;

      if (options.primary && typeof options.primary.onClick === 'function') {
        previewPrimaryHandler = options.primary.onClick;
        previewPrimary.textContent = options.primary.label || 'Insert';
        previewPrimary.hidden = false;
      } else {
        previewPrimary.hidden = true;
      }

      if (options.secondary && typeof options.secondary.onClick === 'function') {
        previewSecondaryHandler = options.secondary.onClick;
        previewSecondary.textContent = options.secondary.label || 'Copy';
        previewSecondary.hidden = false;
      } else {
        previewSecondary.hidden = true;
      }
    }

    function setPreview(payload = {}) {
      const { title = 'Preview', html = '', text = '', append = false, primary, secondary } = payload;

      previewTitle.textContent = title;

      if (!append) {
        previewContent.innerHTML = '';
      }

      if (html) {
        if (append) {
          previewContent.insertAdjacentHTML('beforeend', html);
        } else {
          previewContent.innerHTML = html;
        }
      } else if (text) {
        const safe = convertTextToHtml(text);
        if (append) {
          previewContent.insertAdjacentHTML('beforeend', safe);
        } else {
          previewContent.innerHTML = safe;
        }
      }

      configurePreview({ primary, secondary });
      preview.dataset.visible = 'true';
    }

    function appendPreview(payload = {}) {
      setPreview({ ...payload, append: true });
    }

    function hidePreview(clearContent = false) {
      preview.dataset.visible = 'false';
      if (clearContent) {
        previewContent.innerHTML = '';
      }
      configurePreview();
    }

    function getPreviewText() {
      return previewContent.textContent || '';
    }

    function setInfoHtml(html) {
      info.innerHTML = html;
    }

    input.addEventListener('input', filterSuggestions);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        hide();
      }
    });

    previewPrimary.addEventListener('click', async () => {
      if (typeof previewPrimaryHandler === 'function') {
        try {
          await previewPrimaryHandler();
        } catch (error) {
          console.error('Preview primary handler failed:', error);
        }
      }
    });

    previewSecondary.addEventListener('click', async () => {
      if (typeof previewSecondaryHandler === 'function') {
        try {
          await previewSecondaryHandler();
        } catch (error) {
          console.error('Preview secondary handler failed:', error);
        }
      }
    });

    if (shortcut) {
      document.addEventListener('keydown', onDocumentKeyDown);
    }

    const api = {
      host,
      shadow,
      overlay,
      input,
      suggestions,
      preview,
      show,
      hide,
      toggle,
      setData,
      setStatus,
      clearStatus,
      setPreview,
      appendPreview,
      hidePreview,
      getPreviewText,
      setInfoHtml,
      setQuickSubmitEnabled(value) {
        state.quickSubmitEnabled = Boolean(value);
      },
      dataset: overlay.dataset,
      addEventListener: host.addEventListener.bind(host),
      removeEventListener: host.removeEventListener.bind(host),
      destroy() {
        if (shortcut) {
          document.removeEventListener('keydown', onDocumentKeyDown);
        }
        document.removeEventListener('keydown', onKeyDown, true);
        host.remove();
      },
    };

    if (Array.isArray(options.initialData)) {
      setData(options.initialData);
    }

    return api;
  }

  window.ZendeskCommandPaletteHubComponent = {
    create: createPalette,
    convertTextToHtml,
  };
})();


