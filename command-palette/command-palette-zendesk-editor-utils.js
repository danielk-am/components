// command-palette-zendesk-editor-utils.js
// Zendesk-specific helpers for resolving active editors and ticket context

(function () {
  'use strict';

  const FALLBACK_SELECTORS = [
    '[data-test-id^="omnicomposer-"][contenteditable="true"]',
    '[contenteditable="true"]',
    'textarea',
    'input[type="text"]',
  ];

  /**
   * Creates a shared editor state container for tracking the active Zendesk composer.
   *
   * @param {Object} [initialState={}] - Optional property overrides.
   * @returns {{lastEditable: HTMLElement|null, ticketId: string|null}} Editor state object.
   */
  function createEditorState(initialState = {}) {
    return {
      lastEditable: null,
      ticketId: null,
      ...initialState,
    };
  }

  /**
   * Records the most relevant editor node and ticket ID based on the provided origin.
   *
   * @param {Object} state - Shared editor state container.
   * @param {Node} originNode - Node used as the starting point for detection.
   */
  function captureCurrentEditable(state, originNode) {
    const candidate = originNode || document.activeElement;
    const editable = findEditableRoot(candidate);
    if (!editable) return;

    state.lastEditable = editable;
    state.ticketId = getTicketIdFromDom(editable) || state.ticketId || getTicketIdFromUrl() || null;
  }

  /**
   * Resolves the best candidate editor element available for text insertion.
   *
   * @param {Object} state - Shared editor state container.
   * @returns {HTMLElement|null} The active contenteditable/input element, if found.
   */
  function getActiveEditable(state) {
    const activeEditable = findEditableRoot(document.activeElement);
    if (activeEditable) {
      captureCurrentEditable(state, activeEditable);
      return activeEditable;
    }

    if (state.lastEditable && document.contains(state.lastEditable)) {
      return state.lastEditable;
    }

    const fallbackEditable = resolveEditableFallback(state);
    if (fallbackEditable) {
      captureCurrentEditable(state, fallbackEditable);
      return fallbackEditable;
    }

    return null;
  }

  /**
   * Attempts to locate a visible editor within the Zendesk layout when the active element is lost.
   *
   * @param {Object} state - Shared editor state container.
   * @returns {HTMLElement|null} Fallback editor reference.
   */
  function resolveEditableFallback(state) {
    const ticketId = state.ticketId || getTicketIdFromUrl();
    if (!ticketId) return null;

    const layout = document.querySelector(`[data-test-id="ticket-${ticketId}-custom-layout"]`);
    if (!layout) return null;

    const editable = FALLBACK_SELECTORS.reduce((resolved, selector) => {
      if (resolved) return resolved;
      const candidates = Array.from(layout.querySelectorAll(selector));
      return candidates.find((node) => node.offsetParent !== null) || null;
    }, null);

    return editable || null;
  }

  /**
   * Finds the closest editable ancestor for the provided node.
   *
   * @param {Node} node - Element or text node to inspect.
   * @returns {HTMLElement|null} Editable root element when located.
   */
  function findEditableRoot(node) {
    if (!node) return null;
    if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
      return node;
    }
    return node.closest?.('[contenteditable="true"]') || null;
  }

  /**
   * Parses the current Zendesk URL to locate the active ticket ID.
   *
   * @returns {string|null} Ticket ID captured from the pathname.
   */
  function getTicketIdFromUrl() {
    try {
      const match = (location.pathname || '').match(/\/agent\/(?:tickets|workspaces)\/(\d+)/);
      if (match && match[1]) return match[1];
    } catch (error) {}
    return null;
  }

  /**
   * Extracts the ticket ID from DOM attributes near an editor, falling back to the URL.
   *
   * @param {HTMLElement} startEl - Element near the active editor.
   * @returns {string|null} Ticket ID when found.
   */
  function getTicketIdFromDom(startEl) {
    try {
      const composer = startEl?.closest?.('[data-test-id^="omnicomposer-"]');
      if (composer) {
        const ticketButton = composer.querySelector('[data-channel-switcher-trigger-for-ticket-id]');
        const ticketId = ticketButton?.getAttribute('data-channel-switcher-trigger-for-ticket-id');
        if (ticketId) return ticketId;
      }

      const row = startEl?.closest?.('[data-ticket-id]');
      if (row) {
        const ticketId = row.getAttribute('data-ticket-id');
        if (ticketId) return ticketId;
      }
    } catch (error) {}

    return getTicketIdFromUrl();
  }

  function isContextEnabled(config, flag) {
    const context = config?.context;
    if (!context || typeof context[flag] === 'undefined') return true;
    return context[flag] !== false;
  }

  function createContextHelpers(config = {}) {
    const ticketDetailsCache = new Map();
    const conversationCache = new Map();

    async function fetchTicketDetails(ticketId) {
      if (!ticketId || !isContextEnabled(config, 'includeTicket')) return null;
      const cached = ticketDetailsCache.get(ticketId);
      if (cached) return cached;

      try {
        const params = new URLSearchParams({ include: 'metric_set,groups,users,organizations,custom_fields' });
        const response = await fetch(`${location.origin}/api/v2/tickets/${ticketId}.json?${params.toString()}`, {
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) throw new Error(`ticket fetch ${response.status}`);
        const data = await response.json();
        ticketDetailsCache.set(ticketId, data);
        return data;
      } catch (error) {
        console.warn('Cmd Logs: Failed to fetch ticket details', error);
        return null;
      }
    }

    async function fetchConversationContext(ticketId) {
      if (!ticketId || !isContextEnabled(config, 'includeConversation')) return null;
      const cached = conversationCache.get(ticketId);
      if (cached?.loaded) return cached;

      try {
        const response = await fetch(`${location.origin}/api/v2/tickets/${ticketId}/conversation_log.json`, {
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) throw new Error(`conversation fetch ${response.status}`);
        const data = await response.json();
        const payload = Array.isArray(data) && data.length ? data[0] : data;
        const events = Array.isArray(payload?.events) ? payload.events : [];

        let customerName = '';
        let agentName = '';
        let lastEndUserMessage = '';

        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          const name = event?.author?.display_name || event?.author?.name || '';
          const type = event?.author?.type || '';

          if (!agentName && type === 'agent') agentName = name;
          if (!lastEndUserMessage && (type === 'end_user' || type === 'customer' || type === 'end-user')) {
            customerName = name || customerName;
            const content = event?.content;
            if (content?.type === 'text' && content?.text) lastEndUserMessage = content.text;
            else if (content?.body) lastEndUserMessage = content.body;
            else if (content?.text) lastEndUserMessage = content.text;
          }

          if (customerName && lastEndUserMessage && agentName) break;
        }

        const first = (value) => (value || '').trim().split(/\s+/)[0] || '';
        const context = {
          loaded: true,
          events,
          customerName,
          customerFirstName: first(customerName),
          agentName,
          agentFirstName: first(agentName),
          lastEndUserMessage,
        };

        conversationCache.set(ticketId, context);
        return context;
      } catch (error) {
        console.warn('Cmd Logs: Failed to fetch conversation log', error);
        return null;
      }
    }

    function getSSRData(ticketId) {
      if (!ticketId || !isContextEnabled(config, 'includeSidebar')) return '';
      const selector = `[data-test-id="ticket-${ticketId}-custom-layout"]`;
      const container = document.querySelector(selector);
      if (!container) return '';

      const ssrTextarea = container.querySelector('textarea[data-test-id="ticket-form-field-multiline-field-22871957"]');
      if (ssrTextarea && typeof ssrTextarea.value === 'string') {
        return ssrTextarea.value.trim();
      }

      const ssrBlock = container.querySelector('[data-test-id="ssr-section"]') || container;
      return ssrBlock ? (ssrBlock.innerText || ssrBlock.textContent || '').trim() : '';
    }

    async function collectAdditionalData(ticketId) {
      const additional = {};
      try {
        if (isContextEnabled(config, 'includeSidebar')) {
          const ssr = getSSRData(ticketId);
          if (ssr) additional.ssrData = ssr;
        }

        if (isContextEnabled(config, 'includePageData') && window.heCollector && typeof window.heCollector.scrapePage === 'function') {
          try {
            additional.pageData = window.heCollector.scrapePage();
          } catch (collectorError) {
            console.warn('Cmd Logs: heCollector scrape failed', collectorError);
          }
        }
      } catch (error) {
        console.warn('Cmd Logs: collectAdditionalData failed', error);
      }

      return additional;
    }

    async function buildZendeskContext(ticketId) {
      if (!ticketId) return null;

      const [ticketDetails, conversation, additional] = await Promise.all([
        fetchTicketDetails(ticketId),
        fetchConversationContext(ticketId),
        collectAdditionalData(ticketId),
      ]);

      const context = { ticketId };

      if (ticketDetails) context.ticket = ticketDetails;
      if (conversation) context.conversation = conversation;
      if (additional && Object.keys(additional).length) context.additional = additional;

      return Object.keys(context).length ? context : null;
    }

    function clearCaches() {
      ticketDetailsCache.clear();
      conversationCache.clear();
    }

    return {
      fetchTicketDetails,
      fetchConversationContext,
      getSSRData,
      collectAdditionalData,
      buildZendeskContext,
      clearCaches,
    };
  }

  function setupPaletteEnvironment(options = {}) {
    const {
      palette,
      config = {},
      captureCurrentEditable,
      clearPreviewKeyHandler,
      handleQuickPrompt,
    } = options;

    if (!palette || typeof palette.addEventListener !== 'function') {
      throw new Error('setupPaletteEnvironment requires a valid palette instance.');
    }

    if (typeof captureCurrentEditable !== 'function') {
      throw new Error('setupPaletteEnvironment requires captureCurrentEditable callback.');
    }

    if (typeof clearPreviewKeyHandler !== 'function') {
      throw new Error('setupPaletteEnvironment requires clearPreviewKeyHandler callback.');
    }

    if (typeof handleQuickPrompt !== 'function') {
      throw new Error('setupPaletteEnvironment requires handleQuickPrompt callback.');
    }

    function isToggleShortcut(event) {
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : event.key;
      if (!key) return false;

      const toggleKey = (config.palette?.toggleKey || '/').toLowerCase();
      const matchesKey = key === toggleKey || (toggleKey === '/' && key === '?');
      if (!matchesKey) return false;

      const modifiers = [config.palette?.toggleModifier, config.palette?.secondaryModifier].filter((modifier) => typeof modifier === 'string' && modifier.length);
      if (!modifiers.length) {
        return event.ctrlKey || event.metaKey;
      }

      return modifiers.some((modifier) => event[modifier]);
    }

    function captureEditableFromTarget(target) {
      try {
        if (palette && (target === palette || (target && typeof target.closest === 'function' && (target.closest('he-command-palette') || palette.contains(target))))) {
          return;
        }
        const path = typeof target?.composedPath === 'function' ? target.composedPath() : null;
        if (path && path.includes(palette)) return;
      } catch (_) {}

      if (target && target.nodeType === Node.ELEMENT_NODE) {
        captureCurrentEditable(target);
        return;
      }

      if (target && target.nodeType === Node.DOCUMENT_NODE) {
        const active = target.activeElement;
        if (active) {
          captureCurrentEditable(active);
          return;
        }
      }

      captureCurrentEditable();
    }

    const documentKeydownHandler = (event) => {
      try {
        if (palette && (palette === event.target || palette.contains(event.target))) {
          return;
        }
        const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
        if (path && path.includes(palette)) {
          return;
        }
      } catch (_) {}

      if (!isToggleShortcut(event)) return;

      captureEditableFromTarget(event.target);

      event.preventDefault();
      event.stopImmediatePropagation();

      if (palette.dataset.state === 'open') {
        palette.close();
      } else {
        palette.open();
      }
    };

    const frameKeyHandler = (event) => {
      try {
        if (palette && (palette === event.target || palette.contains(event.target))) {
          return;
        }
        const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
        if (path && path.includes(palette)) {
          return;
        }
      } catch (_) {}

      if (!isToggleShortcut(event)) return;
      captureEditableFromTarget(event.target);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (palette.dataset.state === 'open') {
        palette.close();
      } else {
        palette.open();
      }
    };

    const frameFocusHandler = (event) => {
      captureEditableFromTarget(event.target);
    };

    const boundFrameDocuments = new Set();

    function bindShortcutInFrames() {
      const frames = Array.from(document.querySelectorAll('iframe'));
      frames.forEach((frame) => {
        try {
          const doc = frame.contentWindow && frame.contentWindow.document;
        if (!doc) return;
        if (boundFrameDocuments.has(doc)) return;
        boundFrameDocuments.add(doc);
          doc.addEventListener('keydown', frameKeyHandler, true);
          doc.addEventListener('focusin', frameFocusHandler, true);
        } catch (_) {}
      });
    }

    bindShortcutInFrames();
    const iframeObserver = new MutationObserver(() => bindShortcutInFrames());
    iframeObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

    const documentFocusHandler = (event) => {
      try {
        const target = event.target;
        if (palette && (target === palette || (target && typeof target.closest === 'function' && (target.closest('he-command-palette') || palette.contains(target))))) {
          return;
        }
        const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
        if (path && path.includes(palette)) return;
      } catch (_) {}
      captureEditableFromTarget(event.target);
    };

    const paletteOpenHandler = () => {
      captureEditableFromTarget(document.activeElement);
      palette.clearStatus();
      palette.hidePreview(true);
      clearPreviewKeyHandler();
      palette.setStatus('Type to filter commands or use arrow keys to browse.', { variant: 'info' });

      try {
        if (palette.shadowRoot && !palette.shadowRoot.querySelector('style[data-he-layout]')) {
          const style = document.createElement('style');
          style.setAttribute('data-he-layout', 'true');
          style.textContent = `:host{place-content:start center !important;padding-top:4rem !important;padding-bottom:4rem !important;}`;
          palette.shadowRoot.appendChild(style);
        }
      } catch (_) {}

      try {
        const input = palette.input || (palette.shadowRoot && palette.shadowRoot.querySelector('textarea'));
        if (input && !input.__heNavFix) {
          input.__heNavFix = true;
          input.addEventListener(
            'keydown',
            (event) => {
              if (palette.dataset.state !== 'open') return;
              let delta = 0;
              if (event.key === 'ArrowDown') delta = 1;
              else if (event.key === 'ArrowUp') delta = -1;
              else if (event.key === 'Tab') delta = event.shiftKey ? -1 : 1;
              else {
                if (event.key === 'Enter') {
                  if (event.shiftKey) {
                    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                    else event.stopPropagation();
                  }
                  return;
                }

                if (event.key !== 'Escape') {
                  event.stopPropagation();
                }
                return;
              }

              event.preventDefault();
              if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
              } else {
                event.stopPropagation();
              }

              try {
                if (typeof palette._moveSelection === 'function') {
                  palette._moveSelection(delta);
                }
              } catch (_) {}
            },
            true
          );
        }
      } catch (_) {}
    };

    const paletteCloseHandler = () => {
      palette.clearStatus();
      palette.hidePreview(true);
      clearPreviewKeyHandler();
    };

    const paletteSubmitHandler = (event) => {
      const query = (event.detail?.queryRaw ?? event.detail?.query ?? '').trim();
      if (!query) return;
      captureCurrentEditable();
      handleQuickPrompt(query);
    };

    const paletteKeydownFilter = (event) => {
      if (palette.dataset.state !== 'open') return;
      const key = event.key;
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Tab' || key === ' ' || key === 'Spacebar') {
        event.stopPropagation();
      }
    };

    document.addEventListener('keydown', documentKeydownHandler, true);
    document.addEventListener('focusin', documentFocusHandler);
    palette.addEventListener('he:open', paletteOpenHandler);
    palette.addEventListener('he:close', paletteCloseHandler);
    palette.addEventListener('he:submit', paletteSubmitHandler);
    palette.addEventListener('keydown', paletteKeydownFilter);

    const dispose = () => {
      document.removeEventListener('keydown', documentKeydownHandler, true);
      document.removeEventListener('focusin', documentFocusHandler);
      palette.removeEventListener('he:open', paletteOpenHandler);
      palette.removeEventListener('he:close', paletteCloseHandler);
      palette.removeEventListener('he:submit', paletteSubmitHandler);
      palette.removeEventListener('keydown', paletteKeydownFilter);

      iframeObserver.disconnect();

      boundFrameDocuments.forEach((doc) => {
        try {
          doc.removeEventListener('keydown', frameKeyHandler, true);
          doc.removeEventListener('focusin', frameFocusHandler, true);
        } catch (_) {}
      });
      boundFrameDocuments.clear();
    };

    return { dispose };
  }

  window.ZendeskEditorUtils = {
    createEditorState,
    captureCurrentEditable,
    getActiveEditable,
    getTicketIdFromDom,
    getTicketIdFromUrl,
    createContextHelpers,
    setupPaletteEnvironment,
  };
})();

