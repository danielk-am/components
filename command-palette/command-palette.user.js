// ==UserScript==
// @name         Palette Test
// @namespace    https://example.com
// @version      1.1.0
// @description  Shared palette demo
// @author       You
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/danielk-am/components/refs/heads/main/command-palette/command-palette-lib.js
// ==/UserScript==

(function () {
  'use strict';

  const palette = window.HeCommandPalette.create({
    toggleKey: '/',
    toggleModifier: 'ctrlKey',
    allowInInputs: true,
    placeholder: 'Search commands or help…',
    emptyState: 'No matching actions.',
    backdropOpacity: 0.45,
    closeOnBackdrop: true,
  });

  const CONFIG = {
    WEBHOOK_URL: (window.HE_COMMAND_PALETTE_WEBHOOK || '').trim(),
    WEBHOOK_HEADERS: window.HE_COMMAND_PALETTE_HEADERS || null,
    TIMEOUT_MS: 15000,
    DEMO_RESPONSES: [
      'Hi there! Thanks so much for your patience while we looked into this. I re-checked your order and everything is ready to go—feel free to refresh the page if you do not see the update right away.',
      'If the issue comes back, grab a screenshot and let us know. It really helps us chase down anything that still looks off, and we can jump back in immediately.',
      'Appreciate you flagging this. I will keep an eye on the ticket for the next day so we can follow up if anything else needs attention.',
    ],
  };

  document.addEventListener(
    'keydown',
    (event) => {
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : event.key;
      if (key !== '/' && key !== '?') return;
      if (!event.ctrlKey && !event.metaKey) return;

      captureCurrentEditable();

      event.preventDefault();
      event.stopImmediatePropagation();

      if (palette.dataset.state === 'open') {
        palette.close();
      } else {
        palette.open();
      }
    },
    true
  );

  document.body.appendChild(palette);

  let lastEditable = null;
  document.addEventListener('focusin', (event) => {
    const editable = findEditableRoot(event.target);
    if (editable) {
      lastEditable = editable;
    }
  });

  palette.addEventListener('he:open', () => {
    captureCurrentEditable();
    palette.clearStatus();
    palette.hidePreview(true);
    palette.setStatus('Type to filter commands or use arrow keys to browse.', { variant: 'info' });
  });

  palette.addEventListener('he:close', () => {
    palette.clearStatus();
    palette.hidePreview(true);
  });

  function findEditableRoot(target) {
    if (!target) return null;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return target;
    }
    const closest = target.closest?.('[contenteditable="true"]');
    return closest || null;
  }

  function getActiveEditable() {
    const active = document.activeElement;
    const activeEditable = findEditableRoot(active);
    if (activeEditable) return activeEditable;
    return lastEditable;
  }

  function captureCurrentEditable() {
    const active = document.activeElement;
    const editable = findEditableRoot(active);
    if (editable) {
      lastEditable = editable;
    }
  }

  function insertTextIntoEditable(text) {
    const target = getActiveEditable();
    if (!target) {
      navigator.clipboard.writeText(text);
      return;
    }

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const value = target.value ?? '';
      target.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
      const cursor = start + text.length;
      target.selectionStart = target.selectionEnd = cursor;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.focus();
      return;
    }

    target.focus();
    try {
      document.execCommand('insertText', false, text);
    } catch (error) {
      console.warn('Insert via execCommand failed, appending instead.', error);
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        target.textContent += text;
      } else {
        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(text));
      }
    }
  }

  function getFallbackResponse() {
    return CONFIG.DEMO_RESPONSES.join('\n\n');
  }

  function showPreview(title, content, options = {}) {
    const {
      variant = 'info',
      statusMessage = `Previewing “${title}”`,
      insertLabel = 'Insert into editor',
      insertHandler,
      copyLabel = 'Copy to clipboard',
      copySuccessMessage = 'Copied to clipboard.',
      enableCopy = true,
      copyHandler,
      html = null,
    } = options;

    const textPayload = typeof content === 'string' ? content : '';
    const previewPayload = html ? { html } : { text: textPayload };

    const primaryHandler = insertHandler
      ? insertHandler
      : async () => {
          insertTextIntoEditable(textPayload);
          palette.setStatus(`${title} inserted.`, { variant: 'success' });
          palette.hidePreview();
          palette.close();
        };

    const secondaryHandler = enableCopy
      ? async () => {
          try {
            const toCopy = html ? palette.getPreviewText() : textPayload;
            await navigator.clipboard.writeText(toCopy);
            palette.setStatus(copySuccessMessage, { variant: 'success' });
            if (typeof copyHandler === 'function') copyHandler();
          } catch (error) {
            console.error('Copy failed:', error);
            palette.setStatus('Copy failed. Check clipboard permissions.', { variant: 'danger' });
          }
        }
      : null;

    palette.setStatus(statusMessage, { variant });
    palette.setPreview({
      title,
      ...previewPayload,
      primary: primaryHandler
        ? {
            label: insertLabel,
            onClick: async () => {
              try {
                await primaryHandler();
              } catch (error) {
                console.error('Insert handler failed:', error);
                palette.setStatus('Unable to insert content.', { variant: 'danger' });
              }
            },
          }
        : null,
      secondary: secondaryHandler
        ? {
            label: copyLabel,
            onClick: secondaryHandler,
          }
        : null,
    });
  }

  async function requestWebhookText(prompt) {
    if (!CONFIG.WEBHOOK_URL) {
      return { text: getFallbackResponse(), fallback: true };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(CONFIG.WEBHOOK_HEADERS || {}),
      };

      const response = await fetch(CONFIG.WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          url: location.href,
          title: document.title,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

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

      const textCandidate =
        typeof parsed === 'string'
          ? parsed
          : parsed?.response || parsed?.text || parsed?.result || raw;

      const trimmed = String(textCandidate || '').trim();
      if (!trimmed) {
        throw new Error('Webhook returned an empty response');
      }

      return { text: trimmed, fallback: false };
    } catch (error) {
      console.warn('HeCommandPalette: webhook request failed, using fallback.', error);
      return { text: getFallbackResponse(), fallback: true, error };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function runWebhookFlow({ title, prompt }) {
    palette.hidePreview(true);
    palette.setStatus(`Requesting “${title}”…`, { variant: 'info', loading: true });

    const { text, fallback } = await requestWebhookText(prompt);

    const variant = fallback ? 'warning' : 'success';
    const statusMessage = fallback ? 'Demo response ready.' : 'AI response ready.';

    showPreview(title, text, {
      variant,
      statusMessage,
      insertLabel: 'Insert response',
      copyLabel: 'Copy response',
      copySuccessMessage: fallback ? 'Demo response copied.' : 'Response copied to clipboard.',
    });
  }

  const paletteData = [
    {
      label: 'General',
      items: [
        {
          title: 'Open Help Center',
          description: 'Peek at the docs',
          icon: '<path d="M12 4v16m8-8H4"/>',
          shortcut: 'Ctrl + /',
          href: 'https://support.example.com',
        },
        {
          title: 'Copy page URL',
          description: 'Put current page URL on clipboard',
          icon: '<path d="M7 7h10v10H7z"/>',
          onSelect: async () => {
            await navigator.clipboard.writeText(location.href);
            palette.setStatus('Copied page URL to clipboard.', { variant: 'success' });
          },
        },
      ],
    },
    {
      label: 'Insert Snippet',
      items: [
        {
          title: 'Greeting',
          description: 'Warm welcome template',
          icon: '👋',
          tags: ['greeting', 'hello'],
          keepOpen: true,
          onSelect: () =>
            showPreview('Greeting', 'Hi there! Thanks for reaching out. If you have any other questions just let me know!'),
        },
        {
          title: 'Troubleshooting Checklist',
          description: 'Step-by-step support guide',
          icon: '🛠️',
          tags: ['troubleshooting'],
          keepOpen: true,
          onSelect: () =>
            showPreview(
              'Troubleshooting Checklist',
              [
                '1. Restart the device and confirm it powers on successfully.',
                '2. Verify the account credentials and permissions.',
                '3. Clear browser cache or try an incognito window.',
                '4. Collect console/network logs if the issue persists.',
              ].join('\n')
            ),
        },
      ],
    },
    {
      label: 'AI Assist',
      items: [
        {
          title: 'Draft friendly reply',
          description: 'Request a warm customer update via webhook (falls back to demo text).',
          icon: '✨',
          tags: ['ai', 'webhook', 'reply'],
          keepOpen: true,
          onSelect: () =>
            runWebhookFlow({
              title: 'Friendly Customer Update',
              prompt:
                'Draft a friendly, professional update thanking the customer for their patience, confirming the current status, and outlining the next action we will take.',
            }),
        },
        {
          title: 'Summarize ticket for handoff',
          description: 'Generate a concise summary with next steps.',
          icon: '📝',
          tags: ['ai', 'summary'],
          keepOpen: true,
          onSelect: () =>
            runWebhookFlow({
              title: 'Ticket Summary',
              prompt:
                'Summarize the current customer ticket in 3 bullet points covering the reported issue, what we have tried, and the immediate next step.',
            }),
        },
      ],
    },
  ];

  palette.setData(paletteData);
})();