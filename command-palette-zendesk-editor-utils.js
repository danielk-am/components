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

  function createEditorState(initialState = {}) {
    return {
      lastEditable: null,
      ticketId: null,
      ...initialState,
    };
  }

  function captureCurrentEditable(state, originNode) {
    const candidate = originNode || document.activeElement;
    const editable = findEditableRoot(candidate);
    if (!editable) return;

    state.lastEditable = editable;
    state.ticketId = getTicketIdFromDom(editable) || state.ticketId || getTicketIdFromUrl() || null;
  }

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

  function findEditableRoot(node) {
    if (!node) return null;
    if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') {
      return node;
    }
    return node.closest?.('[contenteditable="true"]') || null;
  }

  function getTicketIdFromUrl() {
    try {
      const match = (location.pathname || '').match(/\/agent\/(?:tickets|workspaces)\/(\d+)/);
      if (match && match[1]) return match[1];
    } catch (error) {}
    return null;
  }

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

  window.ZendeskEditorUtils = {
    createEditorState,
    captureCurrentEditable,
    getActiveEditable,
    getTicketIdFromDom,
    getTicketIdFromUrl,
  };
})();

