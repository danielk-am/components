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
  })();