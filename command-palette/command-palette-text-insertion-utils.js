// command-palette-text-insertion-utils.js
// Generic helpers for inserting text into plain inputs and contenteditable editors

(function () {
  'use strict';

  /**
   * Normalizes an insertion mode string to one of the supported values.
   *
   * @param {string} mode - Requested insertion hint.
   * @returns {('caret'|'append'|'prepend'|'replace')} Normalized mode.
   */
  function normalizeInsertMode(mode) {
    const normalized = (mode == null ? 'caret' : String(mode)).toLowerCase();

    switch (normalized) {
      case 'append':
      case 'prepend':
      case 'replace':
      case 'caret':
        return normalized;
      default:
        return 'caret';
    }
  }

  /**
   * Inserts text or HTML into a DOM target, falling back to clipboard copy when unavailable.
   *
   * @param {HTMLElement|null} target - Target input or contenteditable element.
   * @param {string} text - Content to insert.
   * @param {Object} [options={}] - Insertion flags.
   * @param {('caret'|'append'|'prepend'|'replace')} [options.mode='caret'] - Insertion mode.
   * @param {Function} [options.onCopyFallback] - Callback when clipboard fallback occurs.
   * @param {Function} [options.logger] - Optional logging function.
   * @param {boolean} [options.asHtml=false] - Whether the payload should be treated as HTML.
   * @returns {{success: boolean, method: string}} Result describing insertion path.
   */
  function insertText(target, text, options = {}) {
    const { mode = 'caret', onCopyFallback, logger, asHtml = false } = options;

    if (!target) {
      if (typeof onCopyFallback === 'function') onCopyFallback(text);
      logger?.('No editable target available; copied text instead.', 'warn');
      return { success: false, method: 'copy' };
    }

    const normalizedMode = normalizeInsertMode(mode);

    if (isPlainTextInput(target)) {
      // Plain inputs cannot render HTML; fall back to plaintext
      const payload = asHtml ? htmlToText(text) : text;
      insertIntoPlainTextInput(target, payload, normalizedMode);
      logger?.('Inserted via plain-text input.', 'log');
      return { success: true, method: 'input' };
    }

    const result = insertIntoContentEditable(target, text, normalizedMode, logger, asHtml);
    if (!result.success && typeof onCopyFallback === 'function') {
      onCopyFallback(text);
    }
    return result;
  }

  /**
   * Inserts text into a native input/textarea element using the requested mode.
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} target - Plain text field.
   * @param {string} text - Text to inject.
   * @param {string} mode - Normalized insertion mode.
   */
  function insertIntoPlainTextInput(target, text, mode) {
    const value = target.value ?? '';

    if (mode === 'replace') {
      target.value = text;
      const newPos = target.value.length;
      target.selectionStart = target.selectionEnd = newPos;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.focus();
      return;
    }

    if (mode === 'append') {
      target.selectionStart = target.selectionEnd = value.length;
    } else if (mode === 'prepend') {
      target.selectionStart = target.selectionEnd = 0;
    }

    const start = target.selectionStart ?? value.length;
    const end = target.selectionEnd ?? value.length;
    target.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const cursor = start + text.length;
    target.selectionStart = target.selectionEnd = cursor;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
  }

  /**
   * Inserts text or HTML into a contenteditable node, attempting the most compatible strategy.
   *
   * @param {HTMLElement} target - Contenteditable destination.
   * @param {string} text - Payload to insert.
   * @param {string} mode - Normalized insertion mode.
   * @param {Function} logger - Logger utility.
   * @param {boolean} asHtml - Whether to treat payload as HTML.
   * @returns {{success: boolean, method: string}} Result describing insertion path.
   */
  function insertIntoContentEditable(target, text, mode, logger, asHtml) {
    try {
      const doc = target.ownerDocument || document;
      const win = doc.defaultView || window;
      target.focus();

      if (mode === 'replace') {
        document.execCommand('selectAll', false, null);
      } else if (mode === 'append') {
        placeCaretAtEnd(target);
      } else if (mode === 'prepend') {
        placeCaretAtStart(target);
      }

      const beforeEvent = safeCreateInputEvent(win, 'beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: asHtml ? 'insertHTML' : 'insertText',
        data: text,
      });
      target.dispatchEvent(beforeEvent);

      let success = false;
      let method = 'fragment';

      if (asHtml) {
        // Prefer ClipboardEvent paste first for Zendesk editor compatibility
        success = tryPasteHtml(target, text, logger);
        if (success) {
          method = 'clipboard-paste';
        } else {
          // Fallback to execCommand, then DOM fragment append
          let insertedWithExecCommand = false;
          try {
            insertedWithExecCommand = doc.execCommand && doc.execCommand('insertHTML', false, String(text));
          } catch (_) {
            insertedWithExecCommand = false;
          }
          if (insertedWithExecCommand && wasHtmlInserted(target, text)) {
            logger?.('Inserted via document.execCommand.', 'log');
            success = true;
            method = 'execCommand';
          } else {
            if (insertedWithExecCommand) {
              logger?.('execCommand reported success but content did not change; falling back.', 'warn');
            }
            success = appendHtmlFragmentFallback(target, text, logger);
            method = 'fragment';
          }
        }
      } else {
        // Plain text path: try execCommand first, then fragment fallback
        let insertedWithExecCommand = false;
        try {
          insertedWithExecCommand = doc.execCommand && doc.execCommand('insertText', false, String(text));
        } catch (_) {
          insertedWithExecCommand = false;
        }
        if (insertedWithExecCommand && wasTextInserted(target, text)) {
          logger?.('Inserted via document.execCommand.', 'log');
          success = true;
          method = 'execCommand';
        } else {
          if (insertedWithExecCommand) {
            logger?.('execCommand reported success but content did not change; falling back.', 'warn');
          }
          success = appendFragmentFallback(target, text, logger);
          method = 'fragment';
        }
      }

      dispatchInput(target, text);
      return { success, method };
    } catch (error) {
      logger?.(`Failed to insert into contenteditable: ${error.message}`, 'warn');
      return { success: false, method: 'error' };
    }
  }

  /**
   * Appends plain text to a contenteditable element as a DOM fragment fallback.
   *
   * @param {HTMLElement} target - Contenteditable destination.
   * @param {string} text - Text to insert.
   * @param {Function} logger - Logger utility.
   * @returns {boolean} True when fallback succeeded.
   */
  function appendFragmentFallback(target, text, logger) {
    try {
      appendedFragment(target, text);
      logger?.('Inserted via fragment append fallback.', 'log');
      return true;
    } catch (error) {
      logger?.(`Fragment append fallback failed: ${error.message}`, 'warn');
      return false;
    }
  }

  /**
   * Appends HTML to a contenteditable element as a DOM fragment fallback.
   *
   * @param {HTMLElement} target - Contenteditable destination.
   * @param {string} html - HTML string to insert.
   * @param {Function} logger - Logger utility.
   * @returns {boolean} True when fallback succeeded.
   */
  function appendHtmlFragmentFallback(target, html, logger) {
    try {
      appendedHtml(target, html);
      logger?.('Inserted via HTML fragment append fallback.', 'log');
      return true;
    } catch (error) {
      logger?.(`HTML fragment append fallback failed: ${error.message}`, 'warn');
      return false;
    }
  }

  /**
   * Dispatches an input event on the target to notify host frameworks of content changes.
   *
   * @param {HTMLElement} target - Element that received inserted content.
   * @param {string} text - Text payload used for the event.
   */
  function dispatchInput(target, text) {
    try {
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      });
      target.dispatchEvent(inputEvent);
    } catch (error) {
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Appends a plaintext DOM fragment, preserving line breaks, to the contenteditable target.
   *
   * @param {HTMLElement} target - Destination node.
   * @param {string} text - Text payload.
   */
  function appendedFragment(target, text) {
    const doc = target.ownerDocument || document;
    const fragment = doc.createDocumentFragment();
    const lines = String(text ?? '').split(/\n/);
    lines.forEach((line, index) => {
      fragment.appendChild(doc.createTextNode(line));
      if (index < lines.length - 1) {
        fragment.appendChild(doc.createElement('br'));
      }
    });

    target.appendChild(fragment);
    placeCaretAtEnd(target);
  }

  /**
   * Appends an HTML fragment to the contenteditable target at the current caret position.
   *
   * @param {HTMLElement} target - Destination node.
   * @param {string} html - HTML payload.
   */
  function appendedHtml(target, html) {
    const fragment = htmlToFragment(String(html ?? ''));
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(fragment);
    } else {
      target.appendChild(fragment);
    }
    placeCaretAtEnd(target);
  }

  /**
   * Places the caret at the end of the provided element.
   *
   * @param {HTMLElement} element - Editable target.
   */
  function placeCaretAtEnd(element) {
    try {
      const doc = element.ownerDocument || document;
      const win = doc.defaultView || window;
      const range = doc.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = win.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {}
  }

  /**
   * Places the caret at the beginning of the provided element.
   *
   * @param {HTMLElement} element - Editable target.
   */
  function placeCaretAtStart(element) {
    try {
      const doc = element.ownerDocument || document;
      const win = doc.defaultView || window;
      const range = doc.createRange();
      range.selectNodeContents(element);
      range.collapse(true);
      const selection = win.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {}
  }

  /**
   * Determines whether the element is a plain text input or textarea.
   *
   * @param {Element} el - DOM element to inspect.
   * @returns {boolean} True when the element should be treated as a plaintext input.
   */
  function isPlainTextInput(el) {
    return !!el && ((el.tagName === 'INPUT' && el.type === 'text') || el.tagName === 'TEXTAREA');
  }

  /**
   * Checks whether text insertion succeeded by comparing the target contents.
   *
   * @param {HTMLElement} target - Destination element.
   * @param {string} text - Text payload.
   * @returns {boolean} True when the text appears within the element.
   */
  function wasTextInserted(target, text) {
    const expected = String(text ?? '').trim();
    if (!expected) return true;
    const snapshot = (target.innerText || target.textContent || '').trim();
    return snapshot.includes(expected);
  }

  /**
   * Checks whether HTML insertion succeeded by evaluating the target's innerHTML/text.
   *
   * @param {HTMLElement} target - Destination element.
   * @param {string} html - HTML payload used for insertion.
   * @returns {boolean} True when the HTML appears within the element.
   */
  function wasHtmlInserted(target, html) {
    const expected = String(html ?? '').trim();
    if (!expected) return true;
    const snapshot = (target.innerHTML || '').trim();
    return snapshot.includes(expected) || wasTextInserted(target, htmlToText(html));
  }

  /**
   * Converts an HTML string to a document fragment using a template element.
   *
   * @param {string} html - HTML payload.
   * @param {Document} [docOverride] - Optional document context to use.
   * @returns {DocumentFragment} Resulting fragment.
   */
  function htmlToFragment(html, docOverride) {
    const doc = docOverride || document;
    const template = doc.createElement('template');
    template.innerHTML = String(html);
    return template.content.cloneNode(true);
  }

  /**
   * Strips HTML tags, returning a plaintext representation of the markup.
   *
   * @param {string} html - HTML payload.
   * @returns {string} Plain text version.
   */
  function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html);
    return div.innerText || div.textContent || '';
  }

  /**
   * Attempts to insert HTML content using a synthetic paste ClipboardEvent for compatibility.
   *
   * @param {HTMLElement} target - Destination contenteditable element.
   * @param {string} html - HTML payload.
   * @param {Function} logger - Logger utility.
   * @returns {boolean} True when the paste event succeeded and content was inserted.
   */
  function tryPasteHtml(target, html, logger) {
    try {
      const doc = target.ownerDocument || document;
      const win = doc.defaultView || window;
      const DataTransferCtor = win.DataTransfer || window.DataTransfer;
      const ClipboardEventCtor = win.ClipboardEvent || window.ClipboardEvent;
      const data = new DataTransferCtor();
      data.setData('text/html', String(html));
      data.setData('text/plain', htmlToText(html));
      const pasteEvent = new ClipboardEventCtor('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      });
      target.focus();
      const dispatched = target.dispatchEvent(pasteEvent);
      const ok = dispatched && wasHtmlInserted(target, html);
      if (ok) logger?.('Inserted via ClipboardEvent paste HTML.', 'log');
      return ok;
    } catch (error) {
      logger?.(`ClipboardEvent paste fallback failed: ${error.message}`, 'warn');
      return false;
    }
  }

  /**
   * Safely constructs an InputEvent, providing fallbacks for older browser implementations.
   *
   * @param {Window} win - Window context.
   * @param {string} type - Event type name.
   * @param {Object} init - Event init dictionary.
   * @returns {Event} Constructed event instance.
   */
  function safeCreateInputEvent(win, type, init) {
    try {
      const Ctor = win.InputEvent || window.InputEvent;
      return new Ctor(type, init);
    } catch (_) {
      try {
        return new Event(type, init);
      } catch (e) {
        return new window.Event(type, init);
      }
    }
  }

  window.TextInsertionUtils = {
    insertText,
    normalizeInsertMode,
  };
})();

