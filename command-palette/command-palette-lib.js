// File: command-palette-lib.js
(function () {
    'use strict';
  
    const DEFAULT_OPTIONS = {
      toggleKey: '/',
      toggleModifier: 'ctrlKey',
      secondaryModifier: null,
      allowInInputs: true,
      width: 640,
      maxHeight: 440,
      placeholder: 'Type to search…',
      emptyState: 'No results found.',
      iconSize: 18,
      closeOnBackdrop: true,
      backdropOpacity: 0.6,
    };
  
    const CSS = `
      :host {
        position: fixed;
        inset: 0;
        display: none;
        place-content: center;
        background: var(--cp-backdrop-color, rgba(17, 24, 39, 0.6));
        z-index: 2147483000;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #0f172a;
        padding: 4rem;
        box-sizing: border-box;
        overflow: auto;
      }
  
      :host([open]) { display: grid; }
  
      .palette {
        width: min(var(--cp-width), calc(100vw - 8rem));
        max-width: min(var(--cp-width), calc(100vw - 8rem));
        background: white;
        border-radius: 14px;
        box-shadow:
          0 40px 80px rgba(15, 23, 42, 0.28),
          0 8px 20px rgba(15, 23, 42, 0.18);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: min(var(--cp-max-height), calc(100vh - 8rem));
      }
  
        .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 18px 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.35);
      }
  
      .header svg { width: 16px; height: 16px; color: #64748b; }
  
      input[type="search"] {
        flex: 1;
        border: none;
        font-size: 15px;
        font-weight: 500;
        outline: none;
        background: transparent;
        color: inherit;
      }
  
      input[type="search"]::placeholder { color: #94a3b8; }
  
      .list {
        overflow-y: auto;
        max-height: var(--cp-max-height);
        padding: 10px 4px 12px;
        scrollbar-width: thin;
      }

        .status {
          padding: 10px 18px;
          font-size: 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
          display: none;
          gap: 8px;
          align-items: center;
        }

        .status[data-visible="true"] {
          display: flex;
        }

        .status[data-variant="info"] { color: #1d4ed8; background: rgba(59, 130, 246, 0.08); }
        .status[data-variant="success"] { color: #047857; background: rgba(16, 185, 129, 0.08); }
        .status[data-variant="warning"] { color: #a16207; background: rgba(234, 179, 8, 0.12); }
        .status[data-variant="danger"] { color: #b91c1c; background: rgba(248, 113, 113, 0.12); }

        .status .spinner {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 2px solid currentColor;
          border-right-color: transparent;
          animation: cp-spin 0.8s linear infinite;
        }

        @keyframes cp-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .preview {
          display: none;
          flex-direction: column;
          border-top: 1px solid rgba(148, 163, 184, 0.35);
          background: #f8fafc;
          padding: 16px 18px;
          gap: 12px;
        }

        .preview[data-visible="true"] {
          display: flex;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .preview-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #475569;
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
          color: #fff;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .preview-actions button.secondary {
          background: rgba(79, 70, 229, 0.12);
          color: #4f46e5;
        }

        .preview-content {
          background: #fff;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 14px;
          font-size: 13px;
          line-height: 1.5;
          color: #1f2937;
          max-height: 260px;
          overflow-y: auto;
        }

        .preview-content p {
          margin: 0 0 8px;
        }

        .preview-content ul,
        .preview-content ol {
          margin: 0 0 8px 18px;
        }
  
      .group {
        padding: 10px 10px 0;
      }
  
      .group h2 {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #64748b;
        margin: 0 0 6px;
        font-weight: 600;
      }
  
      .item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        margin: 0 0 6px;
        border-radius: 10px;
        cursor: pointer;
        transition: background 160ms ease, transform 160ms ease;
      }
  
      .item[data-active="true"] {
        background: rgba(79, 70, 229, 0.1);
        color: #312e81;
      }
  
      .item[data-active="true"] .meta { color: #3730a3; }
  
      .item:active { transform: scale(0.995); }
  
      .icon {
        width: var(--cp-icon-size);
        height: var(--cp-icon-size);
        display: grid;
        place-items: center;
        border-radius: 6px;
        background: rgba(148, 163, 184, 0.16);
        color: #475569;
        flex-shrink: 0;
      }
  
      .icon img,
      .icon svg {
        width: 100%;
        height: 100%;
      }
  
      .body {
        flex: 1;
        min-width: 0;
      }
  
      .title {
        font-size: 14px;
        font-weight: 600;
        margin: 0;
        line-height: 1.35;
      }
  
      .meta {
        display: block;
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
      }
  
      .shortcut {
        margin-left: auto;
        font-size: 11px;
        color: #64748b;
        font-weight: 600;
        letter-spacing: 0.08em;
      }
  
      .empty {
        padding: 40px 20px;
        text-align: center;
        color: #64748b;
        font-size: 14px;
        font-weight: 500;
      }
    `;
  
    function fuzzymatch(term, text) {
      if (!term) return true;
      term = term.toLowerCase();
      text = text.toLowerCase();
  
      let ti = 0;
      let matches = 0;
      for (let i = 0; i < text.length && ti < term.length; i++) {
        if (term[ti] === text[i]) {
          ti++;
          matches++;
        }
      }
      return matches === term.length;
    }

    function escapeHTML(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  
    class CommandPalette extends HTMLElement {
      constructor(options = {}) {
        super();
        this.attachShadow({ mode: 'open' });
  
        this.config = { ...DEFAULT_OPTIONS, ...options };
        this.dataset.state = 'closed';

        const backdropOpacity = Number.isFinite(this.config.backdropOpacity)
          ? Math.min(1, Math.max(0, this.config.backdropOpacity))
          : DEFAULT_OPTIONS.backdropOpacity;
        this.style.setProperty('--cp-backdrop-color', `rgba(17, 24, 39, ${backdropOpacity})`);
  
        const root = document.createElement('div');
        root.className = 'palette';
        root.style.setProperty('--cp-width', `${this.config.width}px`);
        root.style.setProperty('--cp-max-height', `${this.config.maxHeight}px`);
        root.style.setProperty('--cp-icon-size', `${this.config.iconSize}px`);
        this._container = root;
  
        const header = document.createElement('div');
        header.className = 'header';
  
        header.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M10 4h10M4 9h16M4 15h16M10 20h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        `;
  
        this.input = document.createElement('input');
        this.input.type = 'search';
        this.input.placeholder = this.config.placeholder;
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
  
        header.appendChild(this.input);
  
        this.list = document.createElement('div');
        this.list.className = 'list';
  
        this.statusBar = document.createElement('div');
        this.statusBar.className = 'status';
        this.statusBar.dataset.visible = 'false';
        this.statusBar.dataset.variant = 'info';

        this.preview = document.createElement('div');
        this.preview.className = 'preview';
        this.preview.dataset.visible = 'false';

        const previewHeader = document.createElement('div');
        previewHeader.className = 'preview-header';

        this.previewTitle = document.createElement('span');
        this.previewTitle.className = 'preview-title';
        this.previewTitle.textContent = 'Preview';

        this.previewActions = document.createElement('div');
        this.previewActions.className = 'preview-actions';

        this.previewPrimaryButton = document.createElement('button');
        this.previewPrimaryButton.type = 'button';
        this.previewPrimaryButton.textContent = 'Use result';
        this.previewPrimaryButton.hidden = true;

        this.previewSecondaryButton = document.createElement('button');
        this.previewSecondaryButton.type = 'button';
        this.previewSecondaryButton.textContent = 'Copy';
        this.previewSecondaryButton.classList.add('secondary');
        this.previewSecondaryButton.hidden = true;

        this.previewActions.append(this.previewPrimaryButton, this.previewSecondaryButton);
        previewHeader.append(this.previewTitle, this.previewActions);

        this.previewContent = document.createElement('div');
        this.previewContent.className = 'preview-content';

        this.preview.append(previewHeader, this.previewContent);

        root.appendChild(header);
        root.appendChild(this.statusBar);
        root.appendChild(this.list);
        root.appendChild(this.preview);
  
        const style = document.createElement('style');
        style.textContent = CSS;
        this.shadowRoot.append(style, root);
  
        this.items = [];
        this.filteredItems = [];
        this.activeIndex = -1;
        this.paletteData = [];
        this._boundKeyHandler = this._handleKey.bind(this);
        this._shortcutHandler = this._toggleFromShortcut.bind(this);
        this._previewPrimaryHandler = null;
        this._previewSecondaryHandler = null;
  
        this.input.addEventListener('input', () => this._filter());
        this.input.addEventListener('keydown', (e) => this._handleInputKeys(e));
        this.list.addEventListener('mousedown', (e) => this._handleClick(e));

        this.previewPrimaryButton.addEventListener('click', () => {
          if (typeof this._previewPrimaryHandler === 'function') {
            try {
              this._previewPrimaryHandler();
            } catch (err) {
              console.error('Command palette primary action error:', err);
            }
          }
        });

        this.previewSecondaryButton.addEventListener('click', () => {
          if (typeof this._previewSecondaryHandler === 'function') {
            try {
              this._previewSecondaryHandler();
            } catch (err) {
              console.error('Command palette secondary action error:', err);
            }
          }
        });

        this._previewPlainText = '';

        this.shadowRoot.addEventListener('pointerdown', (event) => {
          if (!this.config.closeOnBackdrop || this.dataset.state !== 'open') return;
          if (event.composedPath().includes(this._container)) return;
          event.preventDefault();
          this.close();
        });
      }
  
      connectedCallback() {
        document.addEventListener('keydown', this._shortcutHandler, true);
      }
  
      disconnectedCallback() {
        document.removeEventListener('keydown', this._shortcutHandler, true);
      }
  
      setData(data) {
        this.paletteData = Array.isArray(data) ? data : [];
        this._render();
        this._filter();
      }
  
      open() {
        if (this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        this.dataset.state = 'open';
        this.input.value = '';
        this._filter();
        requestAnimationFrame(() => {
          this.input.focus();
        });
  
        document.addEventListener('keydown', this._boundKeyHandler, true);
        this.dispatchEvent(new CustomEvent('he:open', { detail: { palette: this } }));
      }
  
      close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dataset.state = 'closed';
        this.activeIndex = -1;
        this._highlightActive();
        document.removeEventListener('keydown', this._boundKeyHandler, true);
        this.dispatchEvent(new CustomEvent('he:close', { detail: { palette: this } }));
      }
  
      toggle() {
        if (this.dataset.state === 'open') {
          this.close();
        } else {
          this.open();
        }
      }
  
      _toggleFromShortcut(event) {
        const eventKey = typeof event.key === 'string' ? event.key.toLowerCase() : event.key;
        const toggleKey = typeof this.config.toggleKey === 'string' ? this.config.toggleKey.toLowerCase() : this.config.toggleKey;
        if (eventKey !== toggleKey) return;

        const modifiers = [this.config.toggleModifier, this.config.secondaryModifier].filter(Boolean);
        if (modifiers.length) {
          const hasMatch = modifiers.some((modifier) => event[modifier]);
          if (!hasMatch) return;
        }

        if (!this.config.allowInInputs) {
          const target = event.target;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
          }
        }

        event.preventDefault();
        this.toggle();
      }
  
      _handleKey(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          this.close();
        }
      }
  
      _handleInputKeys(event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this._moveSelection(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this._moveSelection(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this._activate();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          this._moveSelection(event.shiftKey ? -1 : 1);
        }
      }
  
      _handleClick(event) {
        const item = event.composedPath().find((node) => node?.dataset?.index);
        if (!item) return;
        const index = Number(item.dataset.index);
        this.activeIndex = index;
        this._highlightActive(true);
        this._activate();
      }

      setStatus(message, options = {}) {
        if (!message) {
          this.clearStatus();
          return;
        }

        const { variant = 'info', loading = false } = options;
        this.statusBar.dataset.variant = variant;
        this.statusBar.dataset.visible = 'true';
        this.statusBar.innerHTML = '';

        if (loading) {
          const spinner = document.createElement('span');
          spinner.className = 'spinner';
          this.statusBar.appendChild(spinner);
        }

        const text = document.createElement('span');
        text.textContent = message;
        this.statusBar.appendChild(text);
      }

      clearStatus() {
        this.statusBar.dataset.visible = 'false';
        this.statusBar.innerHTML = '';
      }

      setPreview(options = {}) {
        const {
          title = 'Preview',
          html = '',
          text = '',
          append = false,
          primary = null,
          secondary = null,
        } = options;

        if (!append) {
          this.previewContent.innerHTML = '';
          this._previewPlainText = '';
        }

        this.previewTitle.textContent = title;

        if (html) {
          if (append) {
            this.previewContent.insertAdjacentHTML('beforeend', html);
          } else {
            this.previewContent.innerHTML = html;
          }
        } else if (text) {
          const safe = escapeHTML(text).replace(/\n/g, '<br>');
          if (append) {
            this.previewContent.insertAdjacentHTML('beforeend', safe);
          } else {
            this.previewContent.innerHTML = safe;
          }
        }

        if (text) {
          this._previewPlainText = append ? `${this._previewPlainText}${text}` : text;
        } else if (!this._previewPlainText) {
          this._previewPlainText = this.previewContent.textContent || '';
        }

        if (primary && typeof primary === 'object') {
          this.previewPrimaryButton.textContent = primary.label || 'Use result';
          this.previewPrimaryButton.hidden = false;
          this._previewPrimaryHandler = primary.onClick || null;
        } else {
          this.previewPrimaryButton.hidden = true;
          this._previewPrimaryHandler = null;
        }

        if (secondary && typeof secondary === 'object') {
          this.previewSecondaryButton.textContent = secondary.label || 'Copy';
          this.previewSecondaryButton.hidden = false;
          this._previewSecondaryHandler = secondary.onClick || null;
        } else {
          this.previewSecondaryButton.hidden = true;
          this._previewSecondaryHandler = null;
        }

        this.preview.dataset.visible = 'true';
        return this;
      }

      appendPreview(options = {}) {
        return this.setPreview({ ...options, append: true });
      }

      hidePreview(clearContent = false) {
        this.preview.dataset.visible = 'false';
        if (clearContent) {
          this.previewContent.innerHTML = '';
          this._previewPlainText = '';
        }
        this.previewPrimaryButton.hidden = true;
        this.previewSecondaryButton.hidden = true;
        this._previewPrimaryHandler = null;
        this._previewSecondaryHandler = null;
        return this;
      }

      getPreviewText() {
        return this._previewPlainText || this.previewContent.textContent || '';
      }
  
      _moveSelection(delta) {
        if (!this.filteredItems.length) return;
        this.activeIndex = (this.activeIndex + delta + this.filteredItems.length) % this.filteredItems.length;
        this._highlightActive(true);
      }
  
      _activate() {
        if (this.activeIndex < 0 || this.activeIndex >= this.filteredItems.length) return;
        const item = this.filteredItems[this.activeIndex];
        if (!item) return;
  
        if (typeof item.onSelect === 'function') {
          try {
            item.onSelect(item);
          } catch (err) {
            console.error('Command palette item threw:', err);
          }
        } else if (item.href) {
          window.open(item.href, item.target || '_blank');
        }
  
        if (item.keepOpen !== true) {
          this.close();
        }
      }
  
      _render() {
        this.list.innerHTML = '';
        this.items = [];
  
        this.paletteData.forEach((group, groupIndex) => {
          const section = document.createElement('div');
          section.className = 'group';
  
          if (group.label) {
            const heading = document.createElement('h2');
            heading.textContent = group.label;
            section.appendChild(heading);
          }
  
          (group.items || []).forEach((item, itemIndex) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.dataset.group = groupIndex;
            div.dataset.indexInGroup = itemIndex;
  
            div.innerHTML = `
              <div class="icon"></div>
              <div class="body">
                <p class="title"></p>
                <span class="meta"></span>
              </div>
              <span class="shortcut"></span>
            `;
  
            const front = div.querySelector('.icon');
            const title = div.querySelector('.title');
            const meta = div.querySelector('.meta');
            const shortcut = div.querySelector('.shortcut');
  
            if (item.icon) {
              if (item.icon.startsWith('<svg') || item.icon.startsWith('<path')) {
                front.innerHTML = item.icon.startsWith('<svg') ? item.icon : `<svg viewBox="0 0 24 24" fill="none">${item.icon}</svg>`;
              } else if (item.icon.startsWith('http')) {
                front.innerHTML = `<img src="${item.icon}" alt="" />`;
              } else {
                front.textContent = item.icon;
              }
            } else {
              front.style.visibility = 'hidden';
            }
  
            title.textContent = item.title || '';
            meta.textContent = item.description || '';
            shortcut.textContent = item.shortcut || '';
  
            if (!item.description) meta.style.display = 'none';
            if (!item.shortcut) shortcut.style.display = 'none';
  
            this.items.push({
              element: div,
              data: item,
              groupLabel: group.label || '',
              tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? item.tags.split(',') : []),
            });
  
            section.appendChild(div);
          });
  
          this.list.appendChild(section);
        });
      }
  
      _filter() {
        const term = this.input.value.trim();
        this.filteredItems = [];
  
        this.items.forEach((entry) => {
          const { data, element, groupLabel } = entry;
  
          const haystack = [
            data.title || '',
            data.description || '',
            groupLabel,
            (entry.tags || []).join(' '),
          ].join(' ');
  
          if (fuzzymatch(term, haystack)) {
            element.style.display = '';
            this.filteredItems.push(data);
            data._element = element;
          } else {
            element.style.display = 'none';
          }
        });
  
        if (term) {
          this.filteredItems.sort((a, b) => {
            const av = (a.title || '').toLowerCase();
            const bv = (b.title || '').toLowerCase();
            return av.localeCompare(bv);
          });
        }
  
        this.list.querySelectorAll('.group').forEach((groupEl) => {
          const hasVisible = Array.from(groupEl.children).some((child) => child.classList.contains('item') && child.style.display !== 'none');
          groupEl.style.display = hasVisible ? '' : 'none';
        });
  
        if (!this.filteredItems.length) {
          this._showEmptyState();
        } else {
          this._removeEmptyState();
        }
  
        this.activeIndex = this.filteredItems.length ? 0 : -1;
        this._highlightActive();
      }
  
      _highlightActive(scrollIntoView = false) {
        this.items.forEach((entry) => {
          entry.element.dataset.active = 'false';
        });
  
        if (this.activeIndex < 0 || this.activeIndex >= this.filteredItems.length) return;
        const activeItem = this.filteredItems[this.activeIndex];
        const el = activeItem._element;
        if (!el) return;
        el.dataset.active = 'true';
  
        if (scrollIntoView) {
          const container = this.list;
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
  
          if (rect.top < containerRect.top) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (rect.bottom > containerRect.bottom) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }
  
      _showEmptyState() {
        if (this._emptyEl) return;
        this._emptyEl = document.createElement('div');
        this._emptyEl.className = 'empty';
        this._emptyEl.textContent = this.config.emptyState;
        this.list.appendChild(this._emptyEl);
      }
  
      _removeEmptyState() {
        if (!this._emptyEl) return;
        this._emptyEl.remove();
        this._emptyEl = null;
      }
    }
  
    customElements.define('he-command-palette', CommandPalette);
  
    window.HeCommandPalette = {
      create(options = {}) {
        const palette = new CommandPalette(options);
        return palette;
      },
    };
  })();