// command-palette-text-insertion-utils.js
// Generic helpers for inserting text into plain inputs and contenteditable editors

(function () {
  'use strict';

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

  function isPlainTextInput(el) {
    return !!el && ((el.tagName === 'INPUT' && el.type === 'text') || el.tagName === 'TEXTAREA');
  }

  function wasTextInserted(target, text) {
    const expected = String(text ?? '').trim();
    if (!expected) return true;
    const snapshot = (target.innerText || target.textContent || '').trim();
    return snapshot.includes(expected);
  }

  function wasHtmlInserted(target, html) {
    const expected = String(html ?? '').trim();
    if (!expected) return true;
    const snapshot = (target.innerHTML || '').trim();
    return snapshot.includes(expected) || wasTextInserted(target, htmlToText(html));
  }

  function htmlToFragment(html, docOverride) {
    const doc = docOverride || document;
    const template = doc.createElement('template');
    template.innerHTML = String(html);
    return template.content.cloneNode(true);
  }

  function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html);
    return div.innerText || div.textContent || '';
  }

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

