// File: command-palette-lib.js
(function () {
    'use strict';
  
    const DEFAULT_OPTIONS = {
      toggleKey: '/',
      toggleModifier: 'ctrlKey',
      secondaryModifier: null,
      allowInInputs: true,
      width: 640,
      maxHeight: 100,
      listHeight: 320,
      previewHeight: 260,
      placeholder: 'Type to search…',
      emptyState: 'No results found.',
      iconSize: 18,
      closeOnBackdrop: true,
      backdropOpacity: 0.6,
    };
  
    function isPlainObject(value) {
      return Object.prototype.toString.call(value) === '[object Object]';
    }

    function deepMerge(base = {}, override = {}) {
      const result = { ...base };
      if (!override || typeof override !== 'object') return result;

      Object.keys(override).forEach((key) => {
        const baseValue = result[key];
        const overrideValue = override[key];

        if (Array.isArray(overrideValue)) {
          result[key] = overrideValue.slice();
          return;
        }

        if (isPlainObject(overrideValue) && isPlainObject(baseValue)) {
          result[key] = deepMerge(baseValue, overrideValue);
          return;
        }

        result[key] = overrideValue;
      });

      return result;
    }

    function sanitizeZendeskConfig(overrides = {}) {
      const base = overrides && typeof overrides === 'object' ? overrides : {};
      const paletteConfig = { ...base.palette };
      const urlsConfig = { ...(base.urls || {}) };
      const webhooksConfig = { ...(base.webhooks || {}) };
      const quickPromptConfig = {
        enabled: true,
        insertMode: 'caret',
        titlePrefix: 'Quick prompt',
        description: 'Ad-hoc AI prompt',
        fallback: [],
        ...(base.quickPrompt || {}),
      };
      const contextConfig = {
        includeTicket: true,
        includeConversation: true,
        includeSidebar: true,
        includePageData: true,
        ...(base.context || {}),
      };
      const catalogConfig = {
        url: base.catalog?.url || '',
        headers: { ...(base.catalog?.headers || {}) },
        cacheMs: Number.isFinite(base.catalog?.cacheMs) ? base.catalog.cacheMs : 0,
        fallback: Array.isArray(base.catalog?.fallback) ? base.catalog.fallback : [],
      };

      return {
        ...base,
        palette: paletteConfig,
        urls: urlsConfig,
        webhooks: webhooksConfig,
        quickPrompt: quickPromptConfig,
        context: contextConfig,
        catalog: catalogConfig,
      };
    }

    function sanitizeGenericConfig(overrides = {}) {
      const base = overrides && typeof overrides === 'object' ? overrides : {};
      const paletteConfig = { ...base.palette };

      const selectors = base.editors?.selectors;
      let normalizedSelectors;
      if (Array.isArray(selectors)) {
        normalizedSelectors = selectors
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean);
      } else if (typeof selectors === 'string' && selectors.trim()) {
        normalizedSelectors = [selectors.trim()];
      }

      const editorsConfig = { ...(base.editors || {}) };
      if (normalizedSelectors && normalizedSelectors.length) {
        editorsConfig.selectors = normalizedSelectors;
      } else if (editorsConfig.selectors) {
        delete editorsConfig.selectors;
      }

      const quickPromptConfig = { ...(base.quickPrompt || {}) };
      const contextConfig = { ...(base.context || {}) };

      const catalogConfig = {
        url: base.catalog?.url || '',
        headers: { ...(base.catalog?.headers || {}) },
        cacheMs: Number.isFinite(base.catalog?.cacheMs) ? base.catalog.cacheMs : base.catalog?.cacheMs,
        fallback: Array.isArray(base.catalog?.fallback) ? base.catalog.fallback : undefined,
      };

      const webhooksConfig = { ...(base.webhooks || {}) };

      return {
        ...base,
        palette: paletteConfig,
        editors: editorsConfig,
        quickPrompt: quickPromptConfig,
        context: contextConfig,
        catalog: catalogConfig,
        webhooks: webhooksConfig,
      };
    }

    const CSS = `
      :host {
        position: fixed;
        inset: 0;
        display: none;
        /* Anchor near the top and expand downward while staying centered horizontally */
        place-content: start center;
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
        max-height: min(-webkit-fill-available, calc(100vh - 8rem));
      }
  
        .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 18px 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.35);
      }
  
      .header svg { width: 16px; height: 16px; color: #64748b; }
  
      .header input,
      .header textarea {
        flex: 1;
        border: none;
        font-family: inherit;
        font-size: 15px;
        font-weight: 500;
        outline: none;
        background: transparent;
        color: inherit;
        resize: none;
        height: 1rem;
      }

      .header input::placeholder,
      .header textarea::placeholder { color: #94a3b8; }
  
      .list {
        overflow-y: auto;
        height: var(--cp-list-height);
        padding: 10px 4px 12px;
        scrollbar-width: thin;
      }

      /* Preview-active affordances: clearly show which section is interactive */
      .palette[data-mode="preview"] .header,
      .palette[data-mode="preview"] .list {
        opacity: 0.55;
        filter: grayscale(0.1);
        pointer-events: none;
      }

      .palette[data-mode="preview"] .preview {

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
          /* Fix height to avoid layout shift while streaming */
          flex: 0 0 var(--cp-preview-height);
          height: var(--cp-preview-height);
          overflow: hidden;
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

      .preview-actions button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: #9aa3e5;
      }

        .preview-content {
          background: #fff;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 14px;
          font-size: 13px;
          line-height: 1.5;
          color: #1f2937;
          /* Fill preview container and scroll internally to prevent flicker */
          flex: 1;
          overflow-y: auto;
          /* Reduce repaint jitter during frequent updates */
          contain: content;
          will-change: transform;
          transform: translateZ(0);
          overflow-anchor: none;
        }

        .preview-content p {
          margin: 0 0 8px;
        }

        .preview-content ul,
        .preview-content ol {
          margin: 0 0 8px 18px;
        }
  
      .footer {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 18px;
        font-size: 12px;
        color: #64748b;
        border-top: 1px solid rgba(148, 163, 184, 0.35);
        background: #fff;
      }

      .footer[data-visible="true"] { display: flex; }

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

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
        border-radius: 999px;
        background: rgba(37, 99, 235, 0.12);
        color: #1d4ed8;
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
  
    /**
     * Performs a lightweight subsequence fuzzy match to determine whether the term appears
     * in order within the provided text.
     *
     * @param {string} term - Search query typed by the user.
     * @param {string} text - Candidate string to test.
     * @returns {boolean} True when the term's characters appear sequentially in the text.
     */
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

    /**
     * Escapes HTML-sensitive characters so dynamic text can be safely inserted into templates.
     *
     * @param {string} value - Raw text value to encode.
     * @returns {string} Escaped string.
     */
    function escapeHTML(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  
    /**
     * Custom element that renders the HE Command Palette, handling keyboard interaction,
     * filtering logic, previews, and streaming updates.
     *
     * @extends HTMLElement
     */
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
        root.style.setProperty('--cp-list-height', `${this.config.listHeight}px`);
        root.style.setProperty('--cp-preview-height', `${this.config.previewHeight}px`);
        root.style.setProperty('--cp-icon-size', `${this.config.iconSize}px`);
        this._container = root;
  
        const header = document.createElement('div');
        header.className = 'header';
  
        header.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M10 4h10M4 9h16M4 15h16M10 20h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        `;
  
        this.input = document.createElement('textarea');
        this.input.rows = 1;
        this.input.placeholder = this.config.placeholder;
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
        this.input.autocapitalize = 'none';
        this.input.setAttribute('autocorrect', 'off');
        this.input.setAttribute('inputmode', 'text');
        this.input.style.overflow = 'hidden';
        this.input.addEventListener('input', () => this._handleQueryInput());
        this.input.addEventListener('keydown', (e) => this._handleInputKeys(e));
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

        // Prevent list selection on press while allowing button clicks/Enter to work
        const stopPress = (e) => e.stopPropagation();
        this.preview.addEventListener('mousedown', stopPress, true);

        const previewHeader = document.createElement('div');
        previewHeader.className = 'preview-header';

        this.previewTitle = document.createElement('span');
        this.previewTitle.className = 'preview-title';
        this.previewTitle.textContent = 'Preview';

        this.previewActions = document.createElement('div');
        this.previewActions.className = 'preview-actions';

        this.previewPrimaryButton = document.createElement('button');
        this.previewPrimaryButton.type = 'button';
        this.previewPrimaryButton.textContent = 'Insert into editor';
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

        this.header = header;
        root.appendChild(header);
        root.appendChild(this.statusBar);
        root.appendChild(this.list);
        root.appendChild(this.preview);
        
        this.footer = document.createElement('div');
        this.footer.className = 'footer';
        this.footer.dataset.visible = 'false';
        root.appendChild(this.footer);
  
        const style = document.createElement('style');
        style.textContent = CSS;
        this.shadowRoot.append(style, root);
  
        this.items = [];
        this.filteredItems = [];
        this.activeIndex = -1;
        this.paletteData = [];
        this._lastQuery = '';
        this._filterRAF = 0;
        this._boundKeyHandler = this._handleKey.bind(this);
        this._shortcutHandler = this._toggleFromShortcut.bind(this);
        this._previewPrimaryHandler = null;
        this._previewSecondaryHandler = null;
  
        this.list.addEventListener('mousedown', (e) => this._handleClick(e));

        // Capture Enter anywhere in the shadow root when preview is visible
        this.shadowRoot.addEventListener('keydown', (event) => {
          if (this.preview?.dataset?.visible !== 'true') return;
          if (event.key !== 'Enter') return;
          if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (typeof this._previewPrimaryHandler === 'function') {
            try { this._previewPrimaryHandler(); } catch (err) { console.error('Preview primary action error:', err); }
          }
        }, true);

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
        this._previewUpdateRAF = 0;
        this._lastPreviewHTML = '';

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
  
      /**
       * Replaces the palette's dataset with a new set of grouped command definitions.
       *
       * @param {Array} data - Array of groups containing command item descriptors.
       */
      setData(data) {
        this.paletteData = Array.isArray(data) ? data : [];
        this._render();
        this._filter();
      }
  
      /**
       * Displays the palette overlay and focuses the search textarea.
       */
      open() {
        if (this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        this.dataset.state = 'open';
        const query = typeof this._lastQuery === 'string' ? this._lastQuery : '';
        this.input.value = query;
        this.input.style.height = 'auto';
        this.input.style.height = `${this.input.scrollHeight}px`;
        this._filter();
        requestAnimationFrame(() => {
          this.input.focus();
        });
  
        document.addEventListener('keydown', this._boundKeyHandler, true);
        this.dispatchEvent(new CustomEvent('he:open', { detail: { palette: this } }));
      }
  
      /**
       * Hides the palette overlay and clears selection state.
       */
      close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dataset.state = 'closed';
        if (this._filterRAF) {
          cancelAnimationFrame(this._filterRAF);
          this._filterRAF = 0;
        }
        this.activeIndex = -1;
        this._highlightActive();
        document.removeEventListener('keydown', this._boundKeyHandler, true);
        this.dispatchEvent(new CustomEvent('he:close', { detail: { palette: this } }));
      }
  
      /**
       * Toggles the palette between open and closed states.
       */
      toggle() {
        if (this.dataset.state === 'open') {
          this.close();
        } else {
          this.open();
        }
      }
  
      _handleQueryInput() {
        if (!this.input) return;
        this.input.style.height = 'auto';
        this.input.style.height = `${this.input.scrollHeight}px`;
        this._lastQuery = this.input.value;
        this._scheduleFilter();
      }

      _scheduleFilter() {
        if (this._filterRAF) return;
        this._filterRAF = requestAnimationFrame(() => {
          this._filterRAF = 0;
          this._filter();
        });
      }

      /**
       * Handles the global keyboard shortcut listeners bound on the document to toggle the palette.
       *
       * @param {KeyboardEvent} event - Key event triggered on the host page.
       */
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
  
      /**
       * Processes high-level key events while the palette is open (e.g., Escape).
       *
       * @param {KeyboardEvent} event - Key event captured on the document.
       */
      _handleKey(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          this._lastQuery = '';
          if (this.input) {
            this.input.value = '';
            this.input.style.height = 'auto';
            this.input.style.height = `${this.input.scrollHeight}px`;
          }
          this.close();
        }
      }
  
      /**
       * Handles keyboard interactions scoped to the palette's search textarea.
       *
       * @param {KeyboardEvent} event - Keyboard event fired within the input.
       */
      _handleInputKeys(event) {
        // When preview is visible, Enter should confirm preview; Shift+Enter still inserts newline
        if (this.preview?.dataset?.visible === 'true') {
          if (event.key === 'Enter') {
            const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
            if (!hasModifier) {
              event.preventDefault();
              event.stopPropagation();
              if (typeof this._previewPrimaryHandler === 'function') {
                try { this._previewPrimaryHandler(); } catch (err) { console.error('Preview primary action error:', err); }
              }
              return;
            }
            // Shift+Enter → allow newline in textarea
            return;
          }
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this._moveSelection(1);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          this._moveSelection(-1);
          return;
        }

        if (event.key === 'Enter') {
          const queryRaw = this.input.value;
          const query = queryRaw.trim();
          const modifierSubmit = (event.metaKey || event.ctrlKey) && query;

          if (modifierSubmit) {
            event.preventDefault();
            this.dispatchEvent(
              new CustomEvent('he:submit', {
                detail: { query, queryRaw, via: 'modifier-enter' },
                bubbles: true,
                composed: true,
              })
            );
            return;
          }

          event.preventDefault();
          if (this.filteredItems.length && this.activeIndex >= 0) {
            this._activate();
          } else if (query) {
            this.dispatchEvent(
              new CustomEvent('he:submit', {
                detail: { query, queryRaw, via: 'empty' },
                bubbles: true,
                composed: true,
              })
            );
          }
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          this._moveSelection(event.shiftKey ? -1 : 1);
        }
      }
  
      /**
       * Responds to mouse clicks on command items within the palette list.
       *
       * @param {MouseEvent} event - Click event with composed path support.
       */
      _handleClick(event) {
        const item = event.composedPath().find((node) => node?.dataset?.index);
        if (!item) return;
        const index = Number(item.dataset.index);
        this.activeIndex = index;
        this._highlightActive(true);
        this._activate();
      }

      /**
       * Updates the status bar beneath the search input with the provided message and style.
       *
       * @param {string} message - Message to display.
       * @param {Object} [options={}] - Extra status metadata.
       * @param {('info'|'success'|'warning'|'danger')} [options.variant='info'] - Visual tone.
       * @param {boolean} [options.loading=false] - When true, displays a spinner.
       */
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

      /**
       * Clears the status bar message and hides the element.
       */
      clearStatus() {
        this.statusBar.dataset.visible = 'false';
        this.statusBar.innerHTML = '';
      }

      /**
       * Sets footer text and shows the footer area.
       * @param {string} message - Text to display in the footer.
       */
      setFooter(message) {
        if (!this.footer) return;
        const value = String(message || '').trim();
        if (!value) {
          this.clearFooter();
          return;
        }
        this.footer.textContent = value;
        this.footer.dataset.visible = 'true';
      }

      /**
       * Hides the footer and clears its contents.
       */
      clearFooter() {
        if (!this.footer) return;
        this.footer.dataset.visible = 'false';
        this.footer.textContent = '';
      }

      /**
       * Renders the preview pane with text or HTML content and optional action buttons.
       *
       * @param {Object} [options={}] - Preview configuration.
       * @returns {CommandPalette} Fluent reference to the palette instance.
       */
      setPreview(options = {}) {
        const {
          title = 'Preview',
          html = '',
          text = '',
          append = false,
          primary = undefined,
          secondary = undefined,
          primaryDisabled = false,
        } = options;

        if (!append) {
          this.previewContent.innerHTML = '';
          this._previewPlainText = '';
          this._lastPreviewHTML = '';
        }

        this.previewTitle.textContent = title;

        if (html) {
          this._schedulePreviewHTMLUpdate(html, append);
        } else if (text) {
          const safe = escapeHTML(text).replace(/\n/g, '<br>');
          this._schedulePreviewHTMLUpdate(safe, append);
        }

        if (text) {
          this._previewPlainText = append ? `${this._previewPlainText}${text}` : text;
        } else if (!this._previewPlainText) {
          this._previewPlainText = this.previewContent.textContent || '';
        }

        const shouldUpdatePrimary = (primary !== undefined) || !append || primaryDisabled;
        if ((primary && typeof primary === 'object') || primaryDisabled) {
          const label = (primary && primary.label) || 'Insert into editor';
          const disabled = (primary && primary.disabled === true) || primaryDisabled === true;
          this.previewPrimaryButton.textContent = label;
          this.previewPrimaryButton.hidden = false;
          this.previewPrimaryButton.disabled = !!disabled;
          this._previewPrimaryHandler = disabled ? null : (primary && primary.onClick) || null;
        } else if (shouldUpdatePrimary) {
          this.previewPrimaryButton.hidden = true;
          this.previewPrimaryButton.disabled = false;
          this._previewPrimaryHandler = null;
        }

        const shouldUpdateSecondary = secondary !== undefined || !append;
        if (secondary && typeof secondary === 'object') {
          this.previewSecondaryButton.textContent = secondary.label || 'Copy';
          this.previewSecondaryButton.hidden = false;
          this._previewSecondaryHandler = secondary.onClick || null;
        } else if (shouldUpdateSecondary) {
          this.previewSecondaryButton.hidden = true;
          this._previewSecondaryHandler = null;
        }

        this.preview.dataset.visible = 'true';
        this._container.dataset.mode = 'preview';
        if (this.header) this.header.setAttribute('aria-disabled', 'true');
        if (this.list) this.list.setAttribute('aria-disabled', 'true');
        return this;
      }

      /**
       * Appends content to the existing preview without clearing prior output.
       *
       * @param {Object} [options={}] - Preview configuration.
       * @returns {CommandPalette} Fluent reference to the palette instance.
       */
      appendPreview(options = {}) {
        return this.setPreview({ ...options, append: true });
      }

      /**
       * Appends plain text to the existing preview without forcing a full HTML diff.
       *
       * @param {string} text - Text chunk to append.
       * @param {Object} [options={}] - Additional options.
       * @param {boolean} [options.smooth=true] - Smooth scroll to bottom when the user is anchored.
       * @returns {CommandPalette} Fluent reference to the palette instance.
       */
      appendPreviewText(text, { smooth = true } = {}) {
        if (!text) return this;
        const container = this.previewContent;
        if (!container) return this;

        const stickToBottom = Math.abs(container.scrollHeight - (container.scrollTop + container.clientHeight)) < 4;
        const fragment = document.createDocumentFragment();
        const lines = String(text).split('\n');

        lines.forEach((line, index) => {
          fragment.appendChild(document.createTextNode(line));
          if (index < lines.length - 1) {
            fragment.appendChild(document.createElement('br'));
          }
        });

        container.appendChild(fragment);

        this._previewPlainText = `${this._previewPlainText}${text}`;
        this._lastPreviewHTML = container.innerHTML;

        if (stickToBottom) {
          if (smooth) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          } else {
            container.scrollTop = container.scrollHeight;
          }
        }

        return this;
      }

      /**
       * Hides the preview pane, optionally clearing rendered content and handlers.
       *
       * @param {boolean} [clearContent=false] - When true, purge the preview content.
       * @returns {CommandPalette} Fluent reference to the palette instance.
       */
      hidePreview(clearContent = false) {
        this.preview.dataset.visible = 'false';
        if (clearContent) {
          this.previewContent.innerHTML = '';
          this._previewPlainText = '';
          this._lastPreviewHTML = '';
          if (this._previewUpdateRAF) {
            cancelAnimationFrame(this._previewUpdateRAF);
            this._previewUpdateRAF = 0;
          }
        }
        this.previewPrimaryButton.hidden = true;
        this.previewSecondaryButton.hidden = true;
        this._previewPrimaryHandler = null;
        this._previewSecondaryHandler = null;
        this._container.removeAttribute('data-mode');
        if (this.header) this.header.removeAttribute('aria-disabled');
        if (this.list) this.list.removeAttribute('aria-disabled');
        return this;
      }

      /**
       * Returns the plain text representation of the current preview.
       *
       * @returns {string} Preview content as plain text.
       */
      getPreviewText() {
        return this._previewPlainText || this.previewContent.textContent || '';
      }

      /**
       * Schedules a diff-aware update to the preview content to minimize flicker during streaming.
       * - If the new HTML starts with the previous content, only the delta is appended.
       * - Otherwise, replaces the content once per animation frame.
       * - Preserves scroll position, auto-sticks to bottom when already at bottom.
       */
      /**
       * Schedules a diff-aware DOM update for the preview content to minimise flicker.
       *
       * @param {string} newHTML - Latest HTML snapshot for the preview.
       * @param {boolean} append - Whether the update represents incremental appends.
       */
      _schedulePreviewHTMLUpdate(newHTML, append) {
        const container = this.previewContent;
        if (this._previewUpdateRAF) {
          cancelAnimationFrame(this._previewUpdateRAF);
          this._previewUpdateRAF = 0;
        }

        const prevHTML = append ? (this._lastPreviewHTML || container.innerHTML) : container.innerHTML;

        this._previewUpdateRAF = requestAnimationFrame(() => {
          const stickToBottom = Math.abs(container.scrollHeight - (container.scrollTop + container.clientHeight)) < 4;

          if (append && newHTML && newHTML.startsWith(prevHTML)) {
            const delta = newHTML.slice(prevHTML.length);
            if (delta) {
              container.insertAdjacentHTML('beforeend', delta);
            }
          } else {
            container.innerHTML = newHTML || '';
          }

          this._lastPreviewHTML = container.innerHTML;
          if (stickToBottom) {
            container.scrollTop = container.scrollHeight;
          }
          this._previewUpdateRAF = 0;
        });
      }
  
      /**
       * Moves the highlighted list selection up or down by the provided offset.
       *
       * @param {number} delta - Signed offset to apply to the active index.
       */
      _moveSelection(delta) {
        if (!this.filteredItems.length) return;
        this.activeIndex = (this.activeIndex + delta + this.filteredItems.length) % this.filteredItems.length;
        this._highlightActive(true);
      }
  
      /**
       * Executes the currently highlighted command, invoking its `onSelect` behaviour.
       */
      _activate() {
        if (this.activeIndex < 0 || this.activeIndex >= this.filteredItems.length) return;
        const entry = this.filteredItems[this.activeIndex];
        const item = entry?.data;
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
  
      /**
       * Rebuilds the palette DOM based on the latest grouped dataset.
       */
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
                <div class="tags" hidden></div>
              </div>
              <span class="shortcut"></span>
            `;
  
            const front = div.querySelector('.icon');
            const title = div.querySelector('.title');
            const meta = div.querySelector('.meta');
            const tagsEl = div.querySelector('.tags');
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
            else meta.style.display = '';
            if (!item.shortcut) shortcut.style.display = 'none';
            else shortcut.style.display = '';
  
            const rawTags = Array.isArray(item.tags)
              ? item.tags
              : typeof item.tags === 'string'
                ? item.tags.split(',')
                : [];
            const cleanedTags = rawTags
              .map((tag) => String(tag || '').trim())
              .filter(Boolean);

            if (cleanedTags.length) {
              tagsEl.hidden = false;
              tagsEl.innerHTML = '';
              cleanedTags.forEach((tagValue) => {
                const normalizedLabel = tagValue.startsWith('#') ? tagValue.slice(1) : tagValue;
                const badge = document.createElement('span');
                badge.className = 'tag';
                badge.textContent = `#${normalizedLabel}`;
                tagsEl.appendChild(badge);
              });
            } else {
              tagsEl.hidden = true;
              tagsEl.innerHTML = '';
            }

            const normalizedTags = cleanedTags
              .map((tag) => (tag.startsWith('#') ? tag.slice(1) : tag).toLowerCase())
              .filter(Boolean);

            const haystackParts = [
              item.title || '',
              item.description || '',
              group.label || '',
              cleanedTags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' '),
            ];

            this.items.push({
              element: div,
              data: item,
              groupLabel: group.label || '',
              normalizedTags,
              searchHaystack: haystackParts.join(' '),
            });
  
            section.appendChild(div);
          });
  
          this.list.appendChild(section);
        });
      }
  
      /**
       * Filters palette items using the current input value and updates the DOM.
       */
      _filter() {
        if (this._filterRAF) {
          cancelAnimationFrame(this._filterRAF);
          this._filterRAF = 0;
        }
        if (this.input) {
          this._lastQuery = this.input.value;
        }
        const raw = this.input.value;
        const trimmed = raw.trim();
        this.currentQuery = raw;
        this.filteredItems = [];

        const tokens = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
        const tagTokens = [];
        const textTokens = [];

        tokens.forEach((token) => {
          const lower = token.toLowerCase();
          if (lower.startsWith('#')) {
            const tag = lower.slice(1);
            if (tag) tagTokens.push(tag);
          } else {
            textTokens.push(lower);
          }
        });

        this.items.forEach((entry) => {
          const { element, normalizedTags = [], searchHaystack = '' } = entry;

          const matchesTags = tagTokens.length
            ? tagTokens.every((needle) => normalizedTags.some((tag) => tag.includes(needle)))
            : true;

          if (!matchesTags) {
            element.style.display = 'none';
            delete element.dataset.index;
            return;
          }

          const matchesText = textTokens.length
            ? textTokens.every((token) => fuzzymatch(token, searchHaystack))
            : true;

          if (!matchesText) {
            element.style.display = 'none';
            delete element.dataset.index;
            return;
          }

          element.style.display = '';
          element.dataset.index = String(this.filteredItems.length);
          this.filteredItems.push(entry);
        });
  
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
  
      /**
       * Applies active state styles to the highlighted item and optionally scrolls it into view.
       *
       * @param {boolean} scrollIntoView - When true, ensures the active item is visible.
       */
      _highlightActive(scrollIntoView = false) {
        this.items.forEach((entry) => {
          entry.element.dataset.active = 'false';
        });
  
        if (this.activeIndex < 0 || this.activeIndex >= this.filteredItems.length) return;
        const activeItem = this.filteredItems[this.activeIndex];
        const el = activeItem?.element;
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
  
      /**
       * Ensures the empty state message is visible when no items match the current query.
       */
      _showEmptyState() {
        if (this._emptyEl) return;
        this._emptyEl = document.createElement('div');
        this._emptyEl.className = 'empty';
        this._emptyEl.textContent = this.config.emptyState;
        this.list.appendChild(this._emptyEl);
      }
  
      /**
       * Removes the empty state message if it is currently displayed.
       */
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

  window.HeCommandPalette.bootstrapGeneric = function bootstrapGeneric(config = {}) {
    console.log('[CMD generic] Initialising command palette logic');

    const defaultConfig = {
      palette: {
        toggleKey: 'k',
        toggleModifier: 'metaKey',
        secondaryModifier: 'ctrlKey',
        allowInInputs: true,
        backdropOpacity: 0.4,
        closeOnBackdrop: true,
        placeholder: 'Search commands…',
        emptyState: 'No matching commands.',
      },
      editors: {
        selectors: ['textarea', 'input[type="text"]', 'input[type="search"]', '[contenteditable="true"]'],
      },
      webhooks: {},
      quickPrompt: {
        enabled: true,
        webhookKey: '',
        insertMode: 'caret',
        titlePrefix: 'Quick prompt',
        description: 'Ad-hoc AI prompt',
        fallback: ['No response available. Please try again.'],
      },
      context: {
        includeSelection: true,
        includePageMeta: true,
      },
      catalog: {
        url: '',
        headers: {},
        fallback: [],
      },
    };

    const CONFIG = deepMerge(defaultConfig, sanitizeGenericConfig(config));

    const palette = window.HeCommandPalette.create({
      toggleKey: CONFIG.palette.toggleKey,
      toggleModifier: CONFIG.palette.toggleModifier,
      secondaryModifier: CONFIG.palette.secondaryModifier,
      allowInInputs: CONFIG.palette.allowInInputs,
      backdropOpacity: CONFIG.palette.backdropOpacity,
      closeOnBackdrop: CONFIG.palette.closeOnBackdrop,
      placeholder: CONFIG.palette.placeholder,
      emptyState: CONFIG.palette.emptyState,
    });

    const selectors = Array.isArray(CONFIG.editors?.selectors) && CONFIG.editors.selectors.length
      ? CONFIG.editors.selectors
      : ['textarea', 'input[type="text"]', 'input[type="search"]', '[contenteditable="true"]'];

    let activeEditable = null;

    function isEditableNode(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      if (node.isContentEditable) return true;
      return selectors.some((selector) => {
        try {
          return node.matches(selector);
        } catch (_) {
          return false;
        }
      });
    }

    function findEditableFrom(target) {
      if (!target) return null;
      if (isEditableNode(target)) return target;
      if (typeof target.closest === 'function') {
        for (const selector of selectors) {
          try {
            const match = target.closest(selector);
            if (match) return match;
          } catch (_) {}
        }
      }
      return null;
    }

    function captureEditable(target) {
      const editable = findEditableFrom(target) || (document.activeElement && findEditableFrom(document.activeElement));
      if (editable) {
        activeEditable = editable;
      }
    }

    function getActiveEditable() {
      if (activeEditable && document.contains(activeEditable)) return activeEditable;
      const active = document.activeElement;
      if (active && findEditableFrom(active)) {
        activeEditable = active;
        return activeEditable;
      }
      return null;
    }

    function normalizeInsertMode(value) {
      if (window.TextInsertionUtils && typeof window.TextInsertionUtils.normalizeInsertMode === 'function') {
        return window.TextInsertionUtils.normalizeInsertMode(value);
      }
      return typeof value === 'string' ? value : 'caret';
    }

    function insertTextIntoEditable(text, mode = 'caret', options = {}) {
      const target = getActiveEditable();
      if (!target || !window.TextInsertionUtils || typeof window.TextInsertionUtils.insertText !== 'function') {
        return { success: false };
      }

      const logger = (message, level = 'log') => console[level]('[CMD generic]', message);
      return window.TextInsertionUtils.insertText(target, text, {
        mode: normalizeInsertMode(mode),
        asHtml: options.asHtml === true,
        logger,
        onCopyFallback: (value) => void navigator.clipboard.writeText(value),
      });
    }

    document.addEventListener('focusin', (event) => captureEditable(event.target));
    document.addEventListener('pointerdown', (event) => captureEditable(event.target));

    function handleUtilityAction(action) {
      switch ((action || '').toLowerCase()) {
        case 'reload':
        case 'refresh':
          location.reload();
          break;
        case 'copy-url':
          navigator.clipboard
            .writeText(location.href)
            .then(() => palette.setStatus('URL copied to clipboard.', { variant: 'success' }))
            .catch((error) => {
              console.warn('[CMD generic] Clipboard write failed', error);
              palette.setStatus('Unable to copy URL to clipboard.', { variant: 'danger' });
            });
          break;
        default:
          console.warn('[CMD generic] Unknown utility action', action);
      }
    }

    function showTextPreview({
      title,
      text,
      insertMode = 'caret',
      statusVariant = 'info',
      statusMessage,
      closeOnInsert = true,
      primaryDisabled = false,
      primaryLabel = 'Insert into field',
      secondaryLabel = 'Copy to clipboard',
    }) {
      if (!palette || typeof palette.setPreview !== 'function') return;

      const payload = String(text ?? '');
      const message = statusMessage || `Previewing “${title || 'Snippet'}”.`;
      palette.setStatus(message, { variant: statusVariant });

      const maybeClose = () => {
        if (closeOnInsert && typeof palette.close === 'function') {
          palette.close();
        }
      };

      const primary = primaryDisabled
        ? {
            label: primaryLabel,
            disabled: true,
          }
        : {
            label: primaryLabel,
            onClick: async () => {
              const result = insertTextIntoEditable(payload, insertMode);
              if (result.success) {
                palette.setStatus('Inserted into active field.', { variant: 'success' });
                maybeClose();
              } else {
                await navigator.clipboard.writeText(payload);
                palette.setStatus('No editable detected. Copied to clipboard instead.', { variant: 'warning' });
              }
            },
          };

      palette.setPreview({
        title: title || 'Snippet',
        text: payload,
        primary,
        secondary: {
          label: secondaryLabel,
          onClick: async () => {
            await navigator.clipboard.writeText(payload);
            palette.setStatus('Copied to clipboard.', { variant: 'success' });
          },
        },
      });
    }

    function truncate(value, max = 64) {
      const text = String(value ?? '');
      return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
    }

    function handleQuickPrompt(query) {
      const settings = CONFIG.quickPrompt || {};
      if (settings.enabled === false) {
        palette.setStatus('Quick prompt is disabled.', { variant: 'warning' });
        return;
      }

      const webhookKey = settings.webhookKey;
      const webhook = webhookKey ? CONFIG.webhooks?.[webhookKey] : null;
      if (!webhook || !webhook.url) {
        palette.setStatus('Quick prompt webhook is not configured.', { variant: 'danger' });
        return;
      }

      const title = `${settings.titlePrefix || 'Quick prompt'}: ${truncate(query, 64)}`;
      runAiCommand({
        id: 'quick-prompt',
        title,
        description: settings.description,
        prompt: query,
        webhookKey,
        fallback: settings.fallback,
        insertMode: settings.insertMode,
      });
    }

    function buildRequestPayload({ command, prompt }) {
      const metadata = {
        url: location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      };
      if (command?.id) metadata.commandId = command.id;

      const payload = { prompt, metadata };

      if (CONFIG.context?.includeSelection && typeof window.getSelection === 'function') {
        const selection = window.getSelection().toString().trim();
        if (selection) payload.selection = selection;
      }

      if (CONFIG.context?.includePageMeta) {
        payload.page = {
          url: location.href,
          title: document.title,
        };
      }

      return payload;
    }

    async function runAiCommand(command) {
      if (!palette) return;

      const inlineWebhook = command.webhook && typeof command.webhook === 'object' ? command.webhook : null;
      const settings = inlineWebhook || (command.webhookKey ? CONFIG.webhooks?.[command.webhookKey] : null) || null;
      const fallbackBlocks = Array.isArray(command.fallback)
        ? command.fallback
        : Array.isArray(settings?.fallback)
        ? settings.fallback
        : [];
      const insertMode = normalizeInsertMode(command.insertMode || 'caret');
      const prompt = command.prompt || inlineWebhook?.prompt || '';

      if (!settings || !settings.url) {
        showTextPreview({
          title: command.title || 'AI Command',
          text:
            fallbackBlocks.join('\n\n') || 'No webhook configuration found. Update CONFIG.webhooks to continue.',
          statusVariant: fallbackBlocks.length ? 'warning' : 'danger',
        });
        return;
      }

      if (!prompt) {
        showTextPreview({
          title: command.title || 'AI Command',
          text: fallbackBlocks.join('\n\n') || 'No prompt defined for this command.',
          statusVariant: 'warning',
        });
        return;
      }

      palette.setStatus(`Requesting “${command.title || 'AI Command'}”…`, { variant: 'info', loading: true });

      const controller = new AbortController();
      const timeoutMs = Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : 20000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let responseText = '';
      let fallbackUsed = false;

      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(settings.headers || {}),
        };

        const payload = buildRequestPayload({ command, prompt });
        if (command.payload && typeof command.payload === 'object') {
          payload.payload = { ...(payload.payload || {}), ...command.payload };
        }
        if (inlineWebhook?.payload && typeof inlineWebhook.payload === 'object') {
          payload.payload = { ...(payload.payload || {}), ...inlineWebhook.payload };
        }

        const response = await fetch(settings.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const streamed = { value: '' };
        const insertLabel = 'Insert response';
        const copyLabel = 'Copy response';

        const streamingResult =
          window.AIStreamUtils && typeof window.AIStreamUtils.tryHandleStreamingResponse === 'function'
            ? await window.AIStreamUtils.tryHandleStreamingResponse(response.clone(), {
                onStart: () => {
                  streamed.value = '';
                  showTextPreview({
                    title: command.title || 'AI Command',
                    text: '',
                    insertMode,
                    statusVariant: 'info',
                    statusMessage: 'Streaming AI response…',
                    primaryDisabled: true,
                    primaryLabel: insertLabel,
                    secondaryLabel: copyLabel,
                    closeOnInsert: false,
                  });
                },
                onChunk: (chunk) => {
                  if (!chunk) return;
                  streamed.value += chunk;
                  if (typeof palette.appendPreviewText === 'function') {
                    palette.appendPreviewText(chunk, { smooth: true });
                  } else {
                    showTextPreview({
                      title: command.title || 'AI Command',
                      text: streamed.value,
                      insertMode,
                      statusVariant: 'info',
                      statusMessage: 'Streaming AI response…',
                      primaryDisabled: true,
                      primaryLabel: insertLabel,
                      secondaryLabel: copyLabel,
                      closeOnInsert: false,
                    });
                  }
                },
                onComplete: ({ text }) => {
                  if (text && text !== streamed.value) {
                    streamed.value = text;
                  }
                  showTextPreview({
                    title: command.title || 'AI Command',
                    text: streamed.value,
                    insertMode,
                    statusVariant: streamed.value ? 'success' : 'warning',
                    statusMessage: streamed.value ? 'AI response ready.' : 'Streaming finished without content.',
                    primaryLabel: insertLabel,
                    secondaryLabel: copyLabel,
                    closeOnInsert: false,
                  });
                },
                onError: (error) => {
                  console.warn('[CMD generic] Streaming handler error', error);
                },
              })
            : { handled: false };

        if (streamingResult.handled) {
          clearTimeout(timeout);
          return;
        }

        const raw = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${raw.slice(0, 200)}`);
        }

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          parsed = null;
        }

        const candidate =
          typeof parsed === 'string'
            ? parsed
            : parsed?.response || parsed?.text || parsed?.result || raw;
        responseText = String(candidate || '').trim();
        if (!responseText) {
          throw new Error('Webhook returned an empty response.');
        }
      } catch (error) {
        console.warn('[CMD generic] AI webhook failed', error);
        responseText =
          fallbackBlocks.join('\n\n') || 'Unable to fetch response, and no fallback text is configured.';
        fallbackUsed = true;
      } finally {
        clearTimeout(timeout);
      }

      showTextPreview({
        title: command.title || 'AI Command',
        text: responseText,
        insertMode,
        statusVariant: fallbackUsed ? 'warning' : 'success',
        statusMessage: fallbackUsed ? 'Using fallback response.' : 'AI response ready.',
        primaryLabel: 'Insert response',
        secondaryLabel: 'Copy response',
        closeOnInsert: false,
      });
    }

    function buildStaticCommand(item) {
      if (!item || !item.body) return null;
      const text = String(item.body);
      return {
        title: item.title || 'Snippet',
        description: item.description || '',
        tags: item.tags,
        keepOpen: item.keepOpen ?? true,
        onSelect: () => {
          showTextPreview({
            title: item.title || 'Snippet',
            text,
            insertMode: item.insertMode,
            closeOnInsert: item.keepOpen !== true,
          });
        },
      };
    }

    function buildAiCommand(item) {
      if (!item) return null;
      return {
        title: item.title || 'AI Command',
        description: item.description || '',
        tags: item.tags,
        keepOpen: true,
        onSelect: () => runAiCommand(item),
      };
    }

    function buildUtilityCommand(item) {
      if (!item) return null;
      return {
        title: item.title || 'Utility',
        description: item.description || '',
        tags: item.tags,
        keepOpen: item.keepOpen ?? false,
        onSelect: () => {
          try {
            if (item.sidebarAction) {
              window.dispatchEvent(
                new CustomEvent('he:sidebar-action', {
                  detail: {
                    action: String(item.sidebarAction),
                    payload: item.payload || {},
                  },
                })
              );
            } else if (item.action) {
              handleUtilityAction(item.action);
            } else if (item.href) {
              window.open(item.href, item.target || '_blank');
            }
          } catch (error) {
            console.error('[CMD generic] Utility command failed', error);
            palette.setStatus('Unable to execute utility command.', { variant: 'danger' });
          }
        },
      };
    }

    function buildPaletteItem(group, item) {
      const type = (item.type || group.type || 'static').toLowerCase();
      switch (type) {
        case 'static':
        case 'snippet':
          return buildStaticCommand(item);
        case 'ai':
          return buildAiCommand(item);
        case 'utility':
        case 'tool':
          return buildUtilityCommand(item);
        default:
          console.warn('[CMD generic] Unsupported item type', type, item);
          return null;
      }
    }

    function buildPaletteData(groups = []) {
      return groups
        .map((group) => {
          const items = (group.items || [])
            .map((item) => buildPaletteItem(group, item))
            .filter(Boolean);
          if (!items.length) return null;
          return { label: group.label || 'Commands', items };
        })
        .filter(Boolean);
    }

    async function refreshCatalog(paletteInstance) {
      if (!CONFIG.catalog.url) return;
      try {
        const response = await fetch(CONFIG.catalog.url, { headers: CONFIG.catalog.headers || {} });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const groups = Array.isArray(data?.groups) ? data.groups : [];
        if (groups.length) {
          paletteInstance.setData(buildPaletteData(groups));
          paletteInstance.setStatus('Commands loaded from remote catalog.', { variant: 'success' });
        }
      } catch (error) {
        console.warn('[CMD generic] Catalog fetch failed, using fallback.', error);
        paletteInstance.setStatus('Using fallback command set.', { variant: 'warning' });
      }
    }

    const fallbackGroups = Array.isArray(CONFIG.catalog.fallback) ? CONFIG.catalog.fallback : [];
    palette.setData(buildPaletteData(fallbackGroups));

    palette.addEventListener('he:open', () => {
      captureEditable(document.activeElement);
      palette.clearStatus();
      palette.hidePreview(true);
      palette.setStatus('Type to filter commands.', { variant: 'info' });
    });

    palette.addEventListener('he:close', () => {
      palette.clearStatus();
      palette.hidePreview(true);
    });

    palette.addEventListener('he:submit', (event) => {
      const queryRaw = event.detail?.queryRaw ?? '';
      const query = queryRaw.trim();
      if (!query) return;
      handleQuickPrompt(query);
    });

    palette.addEventListener('keydown', (event) => {
      if (palette.dataset.state !== 'open') return;
      const key = event.key;
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Tab' || key === ' ' || key === 'Spacebar') {
        event.stopPropagation();
      }
    });

    const mountPalette = () => {
      if (palette.__heMounted) return true;
      const host = document.body || document.documentElement;
      if (!host) return false;
      host.appendChild(palette);
      palette.__heMounted = true;
      return true;
    };

    if (!mountPalette()) {
      const onReady = () => {
        if (mountPalette()) {
          document.removeEventListener('DOMContentLoaded', onReady, true);
        }
      };
      document.addEventListener('DOMContentLoaded', onReady, true);

      const observer = new MutationObserver(() => {
        if (mountPalette()) observer.disconnect();
      });
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    }

    try {
      if (palette && palette.shadowRoot && !palette.shadowRoot.querySelector('style[data-he-layout]')) {
        const style = document.createElement('style');
        style.setAttribute('data-he-layout', 'true');
        style.textContent = `:host{place-content:start center !important;padding-top:4rem !important;padding-bottom:4rem !important;}`;
        palette.shadowRoot.appendChild(style);
      }
    } catch (_) {}

    // Keep footer ticket context updated while palette is open
    try {
      palette.addEventListener('he:open', () => {
        try { refreshFooterTicket(); } catch (_) {}
      });
      palette.addEventListener('he:close', () => {
        try { if (typeof palette.clearFooter === 'function') palette.clearFooter(); } catch (_) {}
      });
      document.addEventListener('focusin', () => {
        if (palette && palette.dataset && palette.dataset.state === 'open') {
          try { refreshFooterTicket(); } catch (_) {}
        }
      });
    } catch (_) {}

    if (CONFIG.catalog.url) {
      refreshCatalog(palette);
    }

    return palette;
  };

  window.HeCommandPalette.bootstrapZendesk = function bootstrapZendesk(config = {}) {
    console.log('[CMD zd] Initialising command palette logic');

    const defaultConfig = {
      palette: {
        toggleKey: 'k',
        toggleModifier: 'metaKey',
        secondaryModifier: 'ctrlKey',
        allowInInputs: true,
        backdropOpacity: 0.45,
        closeOnBackdrop: true,
        placeholder: 'Search prompts, tools, and AI actions…',
        emptyState: 'No matching commands found.',
      },

      urls: {
        n8n_ai_api: {
          url: 'https://n8n-woo.a12s.blog/webhook/14bb86a8-944e-4de2-bf39-137b56859028',
          headers: {
            // Authorization: 'Bearer demo-token',
          },
          timeoutMs: 20000,
        },
        n8n_predefs_api: {
          url: 'https://nocodb.danielk.am/api/v2/tables/mwtuuj5sornu0w9/records?offset=0&limit=1000&where=&viewId=vwisqbbudajbm2xm',
          headers: {
            Authorization: 'Bearer demo-token',
          },
          timeoutMs: 20000,
        },
        n8n_prompts_api: {
          url: 'https://nocodb.danielk.am/api/v2/tables/mb8tegrc6juyoi1/records?offset=0&limit=100&where=&viewId=vwg467y8kndlaf5b',
          headers: {
            Authorization: 'Bearer demo-token',
          },
          timeoutMs: 20000,
        },
        n8n_tools_api: {
          url: 'https://nocodb.danielk.am/api/v2/tables/mwtuuj5sornu0w9/records?offset=0&limit=1000&where=&viewId=vwisqbbudajbm2xm',
          headers: {
            Authorization: 'Bearer demo-token',
          },
          timeoutMs: 20000,
        },
        n8n_db_api: {
          url: 'https://nocodb.danielk.am/api/v2/tables/mwtuuj5sornu0w9/records?offset=0&limit=1000&where=&viewId=vwisqbbudajbm2xm',
          headers: {
            Authorization: 'Bearer demo-token',
          },
          timeoutMs: 20000,
        },
      },

      webhooks: {
        aiFriendlyUpdate: {
          url: 'https://n8n-woo.a12s.blog/webhook/14bb86a8-944e-4de2-bf39-137b56859028',
          headers: {
            // Authorization: 'Bearer demo-token',
          },
          timeoutMs: 20000,
          fallback: [
            'Thanks for your patience while we double-check your ticket.',
            'If anything still looks off, grab a screenshot and reply so we can jump back in.',
          ],
        },
        aiTicketSummary: {
          url: 'https://n8n-woo.a12s.blog/webhook/14bb86a8-944e-4de2-bf39-137b56859028',
          timeoutMs: 20000,
          headers: {
            // Authorization: 'Bearer demo-token',
          },
          fallback: [
            '• Issue: Brief description of what the customer reported.',
            '• Steps tried: Outline the main troubleshooting completed so far.',
            '• Next action: What we will do or monitor next.',
          ],
        },
      },

      quickPrompt: {
        enabled: true,
        webhookKey: 'aiFriendlyUpdate',
        insertMode: 'caret',
        titlePrefix: 'Quick prompt',
        description: 'Ad-hoc AI prompt',
        fallback: [
          'I do not have a response yet - please provide more details or try again a little later.',
        ],
      },

      context: {
        includeTicket: true,
        includeConversation: true,
        includeSidebar: true,
        includePageData: true,
      },

      catalog: {
        url: '',
        headers: {},
        cacheMs: 5 * 60 * 1000,
        fallback: [
          {
            label: 'Predefs (Predefined Responses)',
            type: 'static',
            items: [
              {
                id: 'warm-greeting',
                title: 'Warm Greeting',
                description: 'Friendly hello with gratitude.',
                body: 'Hi {{ticket.requester.first_name}},\n\nThanks so much for reaching out today! I just reviewed your ticket and wanted to share a quick update.',
                tags: ['greeting', 'warm'],
                insertMode: 'caret',
              },
              {
                id: 'closing-thanks',
                title: 'Closing Thanks',
                description: 'Wrap-up message encouraging follow-up.',
                body: 'You are all set! If anything else crops up, reply to this ticket and we will take another look right away.',
                tags: ['closing', 'thanks'],
                insertMode: 'caret',
              },
              {
                id: 'sample-reply',
                title: 'Sample Reply',
                description: 'Wrap-up message encouraging follow-up.',
                body: 'This is a sample reply.',
                tags: ['sample', 'reply'],
                insertMode: 'caret',
              },
            ],
          },
          {
            label: 'Prompts (AI Powered)',
            type: 'webhook',
            items: [
              {
                id: 'ai-friendly-update',
                title: 'Draft friendly update',
                description: 'Generate a warm progress update for the customer.',
                webhookKey: 'aiFriendlyUpdate',
                prompt:
                  'Draft a friendly progress update for a customer, thanking them for their patience and explaining the next step in plain language.',
                transform: {
                  insertMode: 'caret',
                },
              },
              {
                id: 'ai-ticket-summary',
                title: 'Summarize ticket for handoff',
                description: 'Summarise the ticket in 3 bullet points.',
                webhookKey: 'aiTicketSummary',
                prompt:
                  'Summarize the current support ticket in three concise bullet points that cover the reported issue, work performed, and the next action.',
                transform: {
                  insertMode: 'caret',
                },
              },
            ],
          },
          {
            label: 'Tools & Shortcuts',
            type: 'utility',
            items: [
              {
                id: 'open-help',
                title: 'Open Help Center',
                description: 'Launch the Zendesk help docs in a new tab.',
                icon: '<path d="M12 5v14m7-7H5"/>',
                href: 'https://support.zendesk.com/hc/en-us',
                target: '_blank',
              },
              {
                id: 'refresh-composer',
                title: 'Refresh Composer',
                description: 'Reload the page to recover a stuck composer.',
                icon: '<path d="M4 4v6h6M20 20v-6h-6M20 4l-3.5 3.5M4 20l3.5-3.5"/>',
                action: 'reload',
              },
            ],
          },
          {
            label: 'Sidebar · System Status Report',
            type: 'utility',
            items: [
              {
                id: 'sidebar-ssr-open',
                title: 'Open System Status Report',
                description: 'Open the System Status Report overlay for the current ticket.',
                icon: '<path d="M5 12l4 4L19 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
                tags: ['sidebar', 'ssr', 'open'],
                sidebarAction: 'ssr:open',
              },
              {
                id: 'sidebar-ssr-copy',
                title: 'Copy System Status Report',
                description: 'Copy the parsed SSR contents to your clipboard.',
                icon: '<path d="M4 4h12v12H4z"/>',
                tags: ['sidebar', 'ssr', 'copy'],
                sidebarAction: 'ssr:copy',
              },
              {
                id: 'sidebar-ssr-refresh',
                title: 'Refresh System Status Report',
                description: 'Reload the System Status Report cache before reviewing.',
                icon: '<path d="M13.1 12c-1.2 1.5-3 2.5-5.1 2.5-3.6 0-6.5-2.9-6.5-6.5S4.4 1.5 8 1.5c2.2 0 4.1 1.1 5.3 2.7m.2-3.7V4c0 .3-.2.5-.5.5H9.5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
                tags: ['sidebar', 'ssr', 'refresh'],
                sidebarAction: 'ssr:refresh',
              },
            ],
          },
          {
            label: 'Sidebar · Conversation Log',
            type: 'utility',
            items: [
              {
                id: 'sidebar-conv-open',
                title: 'Open Conversation Log',
                description: 'Open the full conversation history overlay.',
                icon: '<path d="M4 5h16M4 12h10M4 19h16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
                tags: ['sidebar', 'conversation', 'open'],
                sidebarAction: 'conv:open',
              },
              {
                id: 'sidebar-conv-copy',
                title: 'Copy Conversation Log',
                description: 'Copy the conversation log as NDJSON for handoff or analysis.',
                icon: '<path d="M5 4h10v10H5z"/>',
                tags: ['sidebar', 'conversation', 'copy'],
                sidebarAction: 'conv:copy',
              },
            ],
          },
          {
            label: 'Sidebar · Domain & DNS',
            type: 'utility',
            items: [
              {
                id: 'sidebar-domain-open',
                title: 'Open Domain & DNS',
                description: 'Launch the Domain & DNS overlay for quick investigation.',
                icon: '<path d="M12 3a9 9 0 1 0 9 9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
                tags: ['sidebar', 'domain', 'dns', 'open'],
                sidebarAction: 'domain:open',
              },
              {
                id: 'sidebar-domain-copy',
                title: 'Copy Domain & DNS',
                description: 'Copy the current domain details and DNS records to clipboard.',
                icon: '<path d="M6 6h12v12H6z"/>',
                tags: ['sidebar', 'domain', 'dns', 'copy'],
                sidebarAction: 'domain:copy',
              },
            ],
          },
          {
            label: 'Sidebar · AI Assistants',
            type: 'utility',
            items: [
              {
                id: 'sidebar-ai-open',
                title: 'Browse AI Assistants',
                description: 'Open the AI assistants directory overlay to search by category.',
                icon: '<path d="M12 5a7 7 0 1 0 7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
                tags: ['sidebar', 'ai', 'assistants', 'open'],
                sidebarAction: 'ai:open',
              },
              {
                id: 'sidebar-ai-panel',
                title: 'Show Floating AI Panel',
                description: 'Pop open the floating AI assistants chat panel.',
                icon: '<path d="M5 19h14V5H5v3H3v8h2z"/>',
                tags: ['sidebar', 'ai', 'panel'],
                sidebarAction: 'ai:panel',
              },
            ],
          },
          {
            label: 'Sidebar · Ticket Data',
            type: 'utility',
            items: [
              {
                id: 'sidebar-data-copy',
                title: 'Copy Ticket Data Bundle',
                description: 'Copy ticket details, SSR, and conversation data as NDJSON.',
                icon: '<path d="M4 4h10v12H4z"/>',
                tags: ['sidebar', 'ticket-data', 'copy'],
                sidebarAction: 'data:copy',
              },
              {
                id: 'sidebar-data-refresh',
                title: 'Ticket Data · Refresh Notice',
                description: 'Trigger the ticket data refresh notification.',
                icon: '<path d="M12 5v2m0 8v2m8-8h-2M6 12H4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
                tags: ['sidebar', 'ticket-data', 'refresh'],
                sidebarAction: 'data:refresh',
              },
            ],
          },
        ],
      },
    };

    const CONFIG = deepMerge(defaultConfig, sanitizeZendeskConfig(config));

    const palette = window.HeCommandPalette.create({
      toggleKey: '/',
      toggleModifier: 'ctrlKey',
      secondaryModifier: 'metaKey',
      allowInInputs: true,
      backdropOpacity: 0.45,
      closeOnBackdrop: true,
      placeholder: 'Search prompts, tools, and AI actions…',
      emptyState: 'No matching commands found.',
    });

    const editorState = window.ZendeskEditorUtils.createEditorState();
    const contextHelpers = window.ZendeskEditorUtils.createContextHelpers(CONFIG);
    const { buildZendeskContext } = contextHelpers;
    let previewKeyHandler = null;
    let previewKeyUpHandler = null;

    window.ZendeskEditorUtils.setupPaletteEnvironment({
      palette,
      config: CONFIG,
      captureCurrentEditable,
      clearPreviewKeyHandler,
      handleQuickPrompt,
    });

    document.body.appendChild(palette);

    // Apply layout override once at creation time so the palette grows downward
    try {
      if (palette && palette.shadowRoot && !palette.shadowRoot.querySelector('style[data-he-layout]')) {
        const style = document.createElement('style');
        style.setAttribute('data-he-layout', 'true');
        style.textContent = `:host{place-content:start center !important;padding-top:4rem !important;padding-bottom:4rem !important;}`;
        palette.shadowRoot.appendChild(style);
      }
    } catch (_) {}

  /**
   * ---------------------------------------------------------------------------
   * SETUP COMMAND DATA
   * ---------------------------------------------------------------------------
   */
  let cachedCatalogGroups = null;
  let cachedCatalogFetchedAt = 0;

  initializeCatalog().catch((error) => {
    console.error('Command palette initialization failed:', error);
    palette.setStatus('Failed to load commands.', { variant: 'danger' });
  });

  /**
   * Loads palette data either from a remote catalog or the local fallback set.
   *
   * @param {boolean} [force=false] - When true, bypasses cached catalog data.
   * @returns {Promise<void>} Resolves once the palette data has been applied.
   */
  async function initializeCatalog(force = false) {
    const { groups, source } = await loadCatalogGroups(force);
    const paletteData = buildPaletteData(groups);
    palette.setData(paletteData);

    if (!paletteData.length) {
      palette.setStatus('No commands available. Check catalog configuration.', { variant: 'warning' });
      return;
    }

    const statusMessage =
      source === 'remote'
        ? 'Commands loaded from remote catalog.'
        : source === 'remote-cache'
        ? 'Commands loaded from cached catalog.'
        : 'Using fallback command set.';

    const variant = source === 'fallback' ? 'warning' : 'success';
    palette.setStatus(statusMessage, { variant });
  }

  /**
   * Fetches command groups from the configured catalog endpoint, falling back to the
   * local configuration when the request fails or caching is sufficient.
   *
   * @param {boolean} [force=false] - Forces a network fetch instead of using cached data.
   * @returns {Promise<{groups: Array, source: 'remote'|'remote-cache'|'fallback'}>}
   *   Resolves with catalog groups and the data source indicator.
   */
  async function loadCatalogGroups(force = false) {
    const catalog = CONFIG.catalog || {};
    const fallback = Array.isArray(catalog.fallback) ? catalog.fallback : [];

    if (!catalog.url) {
      return { groups: fallback, source: 'fallback' };
    }

    const now = Date.now();
    const cacheMs = Number.isFinite(catalog.cacheMs) ? catalog.cacheMs : 0;

    if (
      !force &&
      cachedCatalogGroups &&
      cacheMs > 0 &&
      now - cachedCatalogFetchedAt < cacheMs
    ) {
      return { groups: cachedCatalogGroups, source: 'remote-cache' };
    }

    try {
      const response = await fetch(catalog.url, {
        headers: catalog.headers || {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error('Catalog response was not valid JSON.');
      }

      const groups = Array.isArray(data?.groups) ? data.groups : [];
      if (!groups.length) {
        throw new Error('Catalog JSON missing a non-empty "groups" array.');
      }

      cachedCatalogGroups = groups;
      cachedCatalogFetchedAt = now;
      return { groups, source: 'remote' };
    } catch (error) {
      console.warn('Command catalog fetch failed, using fallback groups.', error);
      cachedCatalogGroups = fallback;
      cachedCatalogFetchedAt = now;
      return { groups: fallback, source: 'fallback' };
    }
  }

  /**
   * Converts a catalog group configuration into palette dataset consumable by the UI component.
   *
   * @param {Array} [groups=[]] - Catalog group definitions.
   * @returns {Array} Formatted dataset to pass to `palette.setData`.
   */
  function buildPaletteData(groups = []) {
    return groups
      .map((group) => {
        const items = (group.items || [])
          .map((item) => buildPaletteItem(group, item))
          .filter(Boolean);

        if (!items.length) return null;

        return {
          label: group.label || 'Commands',
          items,
        };
      })
      .filter(Boolean);
  }

  /**
   * Normalizes an individual catalog entry into a palette command definition.
   *
   * @param {Object} group - The parent catalog group definition.
   * @param {Object} item - The raw catalog item definition.
   * @returns {Object|null} Palette item configuration or null when unsupported.
   */
  function buildPaletteItem(group, item) {
    const groupType = (group.type || '').toLowerCase();
    const itemType = (item.type || groupType || 'static').toLowerCase();

    switch (itemType) {
      case 'static':
      case 'snippet':
        return buildStaticCommand(item);
      case 'webhook':
      case 'ai':
        return buildWebhookCommand(item);
      case 'utility':
      case 'tool':
        return buildUtilityCommand(item);
      default:
        console.warn('Unknown command type, skipping item:', itemType, item);
        return null;
    }
  }

  /**
   * ---------------------------------------------------------------------------
   * HELPERS: DOM & EDITOR
   * ---------------------------------------------------------------------------
   */
  /**
   * Persists a reference to the current Zendesk editor for later text insertion.
   *
   * @param {Node} node - Optional node to treat as the active editor root.
   */
  function captureCurrentEditable(node) {
    window.ZendeskEditorUtils.captureCurrentEditable(editorState, node);
  }

  /**
   * Resolves the node that should receive text insertion from palette commands.
   *
   * @returns {HTMLElement|null} The active contenteditable or input element, if found.
   */
  function getActiveEditable() {
    const node = window.ZendeskEditorUtils.getActiveEditable(editorState);
    if (!node) return null;
    if (node.isContentEditable === true) return node;
    try {
      if (typeof node.querySelector === 'function') {
        const inner = node.querySelector('[contenteditable="true"]');
        if (inner) return inner;
      }
    } catch (_) {}
    return node;
  }

  /**
   * Extracts the current ticket ID using DOM heuristics within Zendesk.
   *
   * @param {Node} node - DOM node near the editor where the search should begin.
   * @returns {string|null} The ticket ID when located.
   */
  function getTicketIdFromDom(node) {
    return window.ZendeskEditorUtils.getTicketIdFromDom(node);
  }

  /**
   * Identifies the current ticket ID by parsing the Zendesk URL.
   *
   * @returns {string|null} Ticket ID when present in the URL; otherwise null.
   */
  function getTicketIdFromUrl() {
    return window.ZendeskEditorUtils.getTicketIdFromUrl();
  }

  /**
   * Normalizes an insert mode configuration to the supported palette values.
   *
   * @param {string} mode - Requested insert mode.
   * @returns {string} The normalized insert mode.
   */
  function normalizeInsertMode(mode) {
    return window.TextInsertionUtils.normalizeInsertMode(mode);
  }

  function refreshFooterTicket() {
    try {
      const activeNode = getActiveEditable();
      const fromDom = activeNode ? getTicketIdFromDom(activeNode) : null;
      const id = fromDom || editorState.ticketId || getTicketIdFromUrl();
      if (id) {
        if (typeof palette.setFooter === 'function') palette.setFooter(`Ticket #${id}`);
      } else {
        if (typeof palette.clearFooter === 'function') palette.clearFooter();
      }
    } catch (_) {
      try { if (typeof palette.clearFooter === 'function') palette.clearFooter(); } catch (_) {}
    }
  }

  /**
   * Inserts text (or HTML) into the currently active Zendesk editor, with clipboard fallback.
   *
   * @param {string} text - The content to insert.
   * @param {string} [mode='caret'] - Preferred insertion mode.
   * @param {Object} [options={}] - Additional insertion flags.
   */
  function insertTextIntoEditable(text, mode = 'caret', options = {}) {
    const target = getActiveEditable();
    const logger = (message, level = 'log') => console[level]('Cmd Logs:', message);

    const result = window.TextInsertionUtils.insertText(target, text, {
      mode,
      logger,
      asHtml: options.asHtml === true,
      onCopyFallback: (value) => void navigator.clipboard.writeText(value),
    });

    if (!result.success) {
      palette.setStatus('Copied response to clipboard.', { variant: 'warning' });
    }
  }

  /**
   * Removes any keyboard handlers bound to the palette preview controls.
   */
  function clearPreviewKeyHandler() {
    if (previewKeyHandler) {
      palette.removeEventListener('keydown', previewKeyHandler, true);
      previewKeyHandler = null;
    }
    if (previewKeyUpHandler) {
      palette.removeEventListener('keyup', previewKeyUpHandler, true);
      previewKeyUpHandler = null;
    }
  }

  /**
   * Encodes unsafe HTML characters to avoid script injection when rendering plain text.
   *
   * @param {string} value - Raw string value.
   * @returns {string} HTML escaped string.
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Converts plain text or lightweight markdown-like content into HTML for previews.
   *
   * @param {string} text - Source text to convert.
   * @returns {string} Sanitized HTML string.
   */
  function convertTextToHtml(text) {
    if (!text) return '';
    const raw = String(text);

    // Convert markdown-like patterns
    let processed = raw
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');

    function escapeTextPreservingTags(value) {
      const parts = String(value).split(/(<\/?(?:a|strong|em|code)\b[^>]*>)/);
      return parts
        .map((part) => (/^<\/?(?:a|strong|em|code)\b[^>]*>$/.test(part) ? part : escapeHtml(part)))
        .join('');
    }

    const blocks = processed.split(/\n\s*\n/);
    let html = '';
    let inNumberedSequence = false;

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex].trim();
      if (!block) continue;

      if (block === '---') {
        html += '<hr>';
        inNumberedSequence = false;
        continue;
      }

      if (block.startsWith('###')) {
        const content = escapeTextPreservingTags(block.replace(/^###\s*/, ''));
        html += `<h3>${content}</h3>`;
        inNumberedSequence = false;
        continue;
      }
      if (block.startsWith('##')) {
        const content = escapeTextPreservingTags(block.replace(/^##\s*/, ''));
        html += `<h2>${content}</h2>`;
        inNumberedSequence = false;
        continue;
      }
      if (block.startsWith('#')) {
        const content = escapeTextPreservingTags(block.replace(/^#\s*/, ''));
        html += `<h1>${content}</h1>`;
        inNumberedSequence = false;
        continue;
      }

      const lines = block.split('\n');
      const firstLine = lines[0].trim();

      if (/^\d+\.\s/.test(firstLine)) {
        if (!inNumberedSequence) {
          html += '<ol>';
          inNumberedSequence = true;
        }

        const mainContent = escapeTextPreservingTags(firstLine.replace(/^\d+\.\s/, ''));
        html += `<li>${mainContent}`;

        for (let j = 1; j < lines.length; j++) {
          const subLine = lines[j];
          const trimmedSub = subLine.trim();
          if (!trimmedSub) continue;

          if (/^\s+[-*•]\s/.test(subLine)) {
            const subContent = escapeTextPreservingTags(trimmedSub.replace(/^[-*•]\s/, ''));
            html += `<br>&nbsp;&nbsp;• ${subContent}`;
          } else if (/^\s+/.test(subLine)) {
            const subContent = escapeTextPreservingTags(trimmedSub);
            html += `<br>&nbsp;&nbsp;${subContent}`;
          }
        }
        html += '</li>';

        if (blockIndex + 1 >= blocks.length || !/^\d+\.\s/.test(blocks[blockIndex + 1].trim())) {
          html += '</ol>';
          inNumberedSequence = false;
        }
        continue;
      }

      if (/^[-*•]\s/.test(firstLine)) {
        inNumberedSequence = false;
        html += '<ul>';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (/^[-*•]\s/.test(trimmed)) {
            const content = escapeTextPreservingTags(trimmed.replace(/^[-*•]\s/, ''));
            html += `<li>${content}</li>`;
          } else if (/^\s*[-*•]\s/.test(trimmed)) {
            const content = escapeTextPreservingTags(trimmed.replace(/^\s*[-*•]\s/, ''));
            html += `<li style="margin-left: 20px;">${content}</li>`;
          }
        }
        html += '</ul>';
        continue;
      }

      inNumberedSequence = false;
      const content = escapeTextPreservingTags(block).replace(/\n/g, '<br>');
      html += `<p>${content}</p>`;
    }

    if (inNumberedSequence) {
      html += '</ol>';
    }

    return html;
  }


  /**
   * Handles submission of free-form commands typed directly into the palette input.
   *
   * @param {string} query - Raw user-entered prompt.
   */
  function handleQuickPrompt(query) {
    const settings = CONFIG.quickPrompt || {};
    if (settings.enabled === false) {
      palette.setStatus('Quick prompts are disabled in the configuration.', { variant: 'warning' });
      return;
    }

    const webhookKey = settings.webhookKey;
    if (!webhookKey || !CONFIG.webhooks[webhookKey]) {
      palette.setStatus('Quick prompt webhook is not configured.', { variant: 'danger' });
      return;
    }

    const displayTitle = truncateText(`${settings.titlePrefix || 'Quick prompt'}: ${query}`, 72);

    const command = {
      id: 'quick-prompt',
      title: displayTitle,
      description: settings.description || 'Runs the default AI webhook with your prompt.',
      prompt: query,
      webhookKey,
      insertMode: settings.insertMode || 'caret',
      fallback: Array.isArray(settings.fallback) ? settings.fallback : [],
    };

    console.log('Cmd Logs: Quick prompt', { query, webhookKey });
    runAiCommand(command);
  }

  /**
   * Truncates text to the desired length while appending ellipsis when required.
   *
   * @param {string} text - Original string value.
   * @param {number} [maxLength=72] - Maximum characters allowed.
   * @returns {string} Truncated text with ellipsis when applicable.
   */
  function truncateText(text, maxLength = 72) {
    const value = String(text ?? '');
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
  }

  /**
   * Creates a palette command for static snippets backed by local catalog configuration.
   *
   * @param {Object} item - Static snippet definition.
   * @returns {Object|null} Palette item descriptor.
   */
  function buildStaticCommand(item) {
    if (!item || !item.body) return null;

    const insertMode = normalizeInsertMode(item.insertMode);

    return {
      title: item.title || 'Snippet',
      description: item.description || '',
      tags: item.tags,
      shortcut: item.shortcut,
      keepOpen: true,
      onSelect: () =>
        showPreview({
          title: item.title || 'Snippet',
          text: item.body,
          variant: 'info',
          insertMode,
        }),
    };
  }

  /**
   * Creates a palette command that invokes an external webhook to produce a dynamic response.
   *
   * @param {Object} item - Webhook catalog configuration.
   * @returns {Object|null} Palette item descriptor configured for AI execution.
   */
  function buildWebhookCommand(item) {
    if (!item) return null;

    const insertMode = normalizeInsertMode(item.transform?.insertMode || item.insertMode);

    return {
      title: item.title || 'AI Command',
      description: item.description || '',
      tags: item.tags,
      shortcut: item.shortcut,
      keepOpen: true,
      onSelect: () => runAiCommand({ ...item, insertMode }),
    };
  }

  /**
   * Creates a palette command that runs a local utility (e.g., open link, reload).
   *
   * @param {Object} item - Utility catalog configuration.
   * @returns {Object|null} Palette item descriptor.
   */
  function buildUtilityCommand(item) {
    if (!item) return null;

    return {
      title: item.title || 'Utility',
      description: item.description || '',
      tags: item.tags,
      shortcut: item.shortcut,
      icon: item.icon,
      keepOpen: item.keepOpen ?? false,
      onSelect: () => {
        try {
          if (item.sidebarAction) {
            const activeNodeForId = getActiveEditable();
            const ticketId = (activeNodeForId ? getTicketIdFromDom(activeNodeForId) : null) || editorState.ticketId || getTicketIdFromUrl();
            window.dispatchEvent(
              new CustomEvent('he:sidebar-action', {
                detail: {
                  action: String(item.sidebarAction),
                  payload: { ...(item.payload || {}), ticketId },
                },
              })
            );
          } else if (typeof item.onSelect === 'function') {
            item.onSelect();
          } else if (item.action) {
            handleUtilityAction(item.action, item);
          } else if (item.href) {
            window.open(item.href, item.target || '_blank');
          } else {
            console.warn('Utility command has no action:', item);
            palette.setStatus('No action defined for this command.', { variant: 'warning' });
            return;
          }

          palette.setStatus(`${item.title || 'Utility'} triggered.`, { variant: 'success' });
        } catch (error) {
          console.error('Utility command failed:', error);
          palette.setStatus('Unable to execute command.', { variant: 'danger' });
        }
      },
    };
  }

  /**
   * Executes predefined utility command actions such as reloading the page or copying URLs.
   *
   * @param {string} action - Utility action identifier.
   * @param {Object} item - Catalog item providing additional metadata.
   */
  function handleUtilityAction(action, item) {
    switch ((action || '').toLowerCase()) {
      case 'reload':
      case 'refresh':
        location.reload();
        break;
      case 'copy-url':
        void navigator.clipboard.writeText(location.href);
        break;
      case 'open':
      case 'open-modal':
        if (item.href) {
          window.open(item.href, item.target || '_blank');
        }
        break;
      default:
        console.warn('Unknown utility action:', action, item);
    }
  }

  /**
   * ---------------------------------------------------------------------------
   * HELPERS: PREVIEW & STATUS
   * ---------------------------------------------------------------------------
   */
  /**
   * Renders an interactive preview card inside the palette, providing insert/copy actions.
   *
   * @param {Object} options - Preview configuration object including content and handlers.
   */
  function showPreview({
    title,
    text = '',
    html = null,
    variant = 'info',
    statusMessage = `Previewing “${title}”`,
    insertLabel = 'Insert into editor',
    copyLabel = 'Copy to clipboard',
    copySuccessMessage = 'Copied to clipboard.',
    insertHandler,
    copyHandler,
    insertMode = 'caret',
    primaryDisabled = false,
  }) {
    const primaryHandler = primaryDisabled
      ? null
      : (insertHandler
          ? insertHandler
          : async () => {
              try { captureCurrentEditable(); } catch (_) {}
              const payload = html || text;
              const asHtml = !!html;
              insertTextIntoEditable(payload, insertMode, { asHtml });
              palette.setStatus(`${title} inserted.`, { variant: 'success' });
              palette.hidePreview();
              palette.close();
            });

    const secondaryHandler = async () => {
      const payload = html ? palette.getPreviewText() : text;
      await navigator.clipboard.writeText(payload);
      palette.setStatus(copySuccessMessage, { variant: 'success' });
      if (typeof copyHandler === 'function') copyHandler();
    };

    const runPrimary = async () => {
      try {
        await primaryHandler();
      } catch (error) {
        console.error('Insert handler failed:', error);
        palette.setStatus('Unable to insert content.', { variant: 'danger' });
        return;
      }

      clearPreviewKeyHandler();
    };

    const runSecondary = async () => {
      try {
        await secondaryHandler();
      } catch (error) {
        console.error('Copy handler failed:', error);
        palette.setStatus('Copy failed. Check clipboard permissions.', { variant: 'danger' });
      }
    };

    clearPreviewKeyHandler();

    palette.setStatus(statusMessage, { variant });
    palette.setPreview({
      title,
      ...(html ? { html } : { text }),
      primary: {
        label: insertLabel,
        onClick: primaryHandler ? runPrimary : null,
        disabled: !!primaryDisabled,
      },
      secondary: {
        label: copyLabel,
        onClick: runSecondary,
      },
      primaryDisabled: !!primaryDisabled,
    });

    if (primaryHandler) {
      previewKeyHandler = (event) => {
        if (event.defaultPrevented) return;
        if (event.key !== 'Enter') return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else event.stopPropagation();
        void runPrimary();
      };

      palette.addEventListener('keydown', previewKeyHandler, true);
      // Also suppress keyup to avoid any secondary handlers triggering selection
      previewKeyUpHandler = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else event.stopPropagation();
      };
      palette.addEventListener('keyup', previewKeyUpHandler, true);
    }
  }

  /**
   * ---------------------------------------------------------------------------
   * AI COMMAND FLOW
   * ---------------------------------------------------------------------------
   */
  /**
   * Executes an AI-enabled palette command by invoking the configured webhook and managing
   * streaming responses, fallbacks, previews, and text insertion.
   *
   * @param {Object} command - Catalog command augmented with runtime parameters.
   * @returns {Promise<void>} Resolves once the preview has been updated.
   */
  async function runAiCommand(command) {
    palette.hidePreview(true);

    const inlineWebhook = command.webhook && typeof command.webhook === 'object' ? command.webhook : null;
    const settings = inlineWebhook || (command.webhookKey ? CONFIG.webhooks[command.webhookKey] : null) || null;
    const fallbackBlocks = Array.isArray(command.fallback)
      ? command.fallback
      : Array.isArray(settings?.fallback)
      ? settings.fallback
      : [];
    const insertMode = normalizeInsertMode(command.insertMode);
    const prompt = command.prompt || inlineWebhook?.prompt || '';
    const activeNodeForId = getActiveEditable();
    const ticketId = command.ticketId || (activeNodeForId ? getTicketIdFromDom(activeNodeForId) : null) || editorState.ticketId || getTicketIdFromUrl();

    if (!settings || !settings.url) {
      showPreview({
        title: command.title || 'AI Command',
        text:
          fallbackBlocks.join('\n\n') || 'No webhook configuration found. Update the command catalog or CONFIG.webhooks.',
        variant: fallbackBlocks.length ? 'warning' : 'danger',
        statusMessage: fallbackBlocks.length
          ? 'Using fallback text (webhook missing).'
          : 'No webhook configured for this command.',
        insertMode,
      });
      return;
    }

    if (!prompt) {
      console.warn('AI command is missing a prompt. Falling back to demo text.', command);
      showPreview({
        title: command.title || 'AI Command',
        text: fallbackBlocks.join('\n\n') || 'No prompt defined for this command.',
        variant: 'warning',
        statusMessage: 'Command missing a prompt definition.',
        insertMode,
      });
      return;
    }

    palette.setStatus(`Requesting “${command.title || 'AI Command'}”…`, { variant: 'info', loading: true });

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let responseText = '';
    let fallbackUsed = false;

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(settings.headers || {}),
      };

      const payload = {
        prompt,
        metadata: buildRequestMetadata({ ...command, ticketId }),
      };

      const zendeskContext = await buildZendeskContext(ticketId);
      if (zendeskContext) {
        if (ticketId) payload.ticketId = ticketId;
        if (zendeskContext.ticket) payload.ticket = zendeskContext.ticket;
        if (zendeskContext.conversation) payload.context = zendeskContext.conversation;
        if (zendeskContext.additional && Object.keys(zendeskContext.additional).length) {
          Object.assign(payload, zendeskContext.additional);
        }
        payload.contextBundle = zendeskContext;
      }

      if (command.payload && typeof command.payload === 'object') {
        payload.payload = command.payload;
      }

      if (inlineWebhook && inlineWebhook.payload && typeof inlineWebhook.payload === 'object') {
        payload.payload = {
          ...(payload.payload || {}),
          ...inlineWebhook.payload,
        };
      }

      const response = await fetch(settings.url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      const insertLabel = command.insertLabel || 'Insert response';
      const copyLabel = command.copyLabel || 'Copy response';
      const streamed = { value: '' };
      const getStreamedText = () => streamed.value || palette.getPreviewText() || '';

      const focusPaletteInput = () => {
        try {
          requestAnimationFrame(() => {
            try { palette.input && palette.input.focus(); } catch (_) {}
          });
        } catch (_) {}
      };

      const insertFromStream = async () => {
        try { captureCurrentEditable(); } catch (_) {}
        const payload = getStreamedText();
        if (!payload) {
          palette.setStatus('AI response is still loading.', { variant: 'warning' });
          return;
        }

        const htmlOut = convertTextToHtml(payload);
        insertTextIntoEditable(htmlOut, insertMode, { asHtml: true });
        palette.setStatus(`${command.title || 'AI Command'} inserted.`, { variant: 'success' });
        palette.hidePreview();
        palette.close();
      };

      const copyFromStream = async () => {
        const payload = getStreamedText();
        if (!payload) {
          palette.setStatus('Nothing to copy yet.', { variant: 'warning' });
          return;
        }

        await navigator.clipboard.writeText(payload);
        palette.setStatus('Response copied.', { variant: 'success' });
      };

      const streamingResult = await window.AIStreamUtils.tryHandleStreamingResponse(response.clone(), {
        onStart: () => {
          streamed.value = '';
          showPreview({
            title: command.title || 'AI Command',
            html: '',
            text: '',
            variant: 'info',
            statusMessage: 'Streaming AI response…',
            insertLabel,
            copyLabel,
            copySuccessMessage: 'Response copied.',
            insertHandler: insertFromStream,
            copyHandler: copyFromStream,
            insertMode,
            primaryDisabled: true,
          });
        },
        onChunk: (chunk) => {
          if (!chunk) return;
          streamed.value += chunk;
          palette.appendPreviewText(chunk, { smooth: true });
        },
        onComplete: ({ text, receivedAny }) => {
          if (text && text !== streamed.value) {
            streamed.value = text;
          }
          const finalVariant = receivedAny ? 'success' : 'warning';
          const finalStatus = receivedAny ? 'AI response ready.' : 'Streaming yielded no content; falling back.';
          showPreview({
            title: command.title || 'AI Command',
            html: convertTextToHtml(streamed.value),
            text: streamed.value,
            variant: finalVariant,
            statusMessage: finalStatus,
            insertLabel,
            copyLabel,
            copySuccessMessage: 'Response copied.',
            insertHandler: insertFromStream,
            copyHandler: copyFromStream,
            insertMode,
          });
          focusPaletteInput();
        },
        onError: (error) => {
          console.warn('Cmd Logs: Streaming response handling failed', error);
        },
      });

      if (streamingResult.handled) {
        clearTimeout(timeout);
        return;
      }

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${raw.slice(0, 250)}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        parsed = null;
      }

      const candidate =
        typeof parsed === 'string'
          ? parsed
          : parsed?.response || parsed?.text || parsed?.result || raw;

      responseText = String(candidate || '').trim();
      if (!responseText) {
        throw new Error('Webhook returned an empty response.');
      }
    } catch (error) {
      console.warn('AI webhook failed, falling back to demo text.', error);
      responseText =
        fallbackBlocks.join('\n\n') || 'Unable to fetch response, and no fallback text is configured.';
      fallbackUsed = true;
    } finally {
      clearTimeout(timeout);
    }

    showPreview({
      title: command.title || 'AI Command',
      html: convertTextToHtml(responseText),
      text: responseText,
      variant: fallbackUsed ? 'warning' : 'success',
      statusMessage: fallbackUsed ? 'Using fallback demo response.' : 'AI response ready.',
      insertLabel: command.insertLabel || 'Insert response',
      copyLabel: command.copyLabel || 'Copy response',
      copySuccessMessage: fallbackUsed ? 'Fallback response copied.' : 'AI response copied.',
      insertMode,
    });
  }

  /**
   * Constructs metadata describing the command invocation to include with webhook requests.
   *
   * @param {Object} command - Palette command context.
   * @returns {Object} Metadata payload summarizing environment details.
   */
  function buildRequestMetadata(command) {
    const base = {
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
    };

    const ticketId = command?.ticketId || editorState.ticketId || getTicketIdFromUrl();
    if (ticketId) {
      base.ticketId = ticketId;
    }

    if (command?.id) {
      base.commandId = command.id;
    }

    if (command?.metadata && typeof command.metadata === 'object') {
      return { ...base, ...command.metadata };
    }

    return base;
  }

  };

  })();