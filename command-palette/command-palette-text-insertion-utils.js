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
    const { mode = 'caret', onCopyFallback, logger } = options;

    if (!target) {
      if (typeof onCopyFallback === 'function') onCopyFallback(text);
      logger?.('No editable target available; copied text instead.', 'warn');
      return { success: false, method: 'copy' };
    }

    const normalizedMode = normalizeInsertMode(mode);

    if (isPlainTextInput(target)) {
      insertIntoPlainTextInput(target, text, normalizedMode);
      logger?.('Inserted via plain-text input.', 'log');
      return { success: true, method: 'input' };
    }

    const result = insertIntoContentEditable(target, text, normalizedMode, logger);
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

  function insertIntoContentEditable(target, text, mode, logger) {
    try {
      target.focus();

      if (mode === 'replace') {
        document.execCommand('selectAll', false, null);
      } else if (mode === 'append') {
        placeCaretAtEnd(target);
      } else if (mode === 'prepend') {
        placeCaretAtStart(target);
      }

      const beforeEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      });
      target.dispatchEvent(beforeEvent);

      let insertedWithExecCommand = false;
      try {
        insertedWithExecCommand = document.execCommand && document.execCommand('insertText', false, text);
      } catch (error) {
        insertedWithExecCommand = false;
      }

      let success = false;
      if (insertedWithExecCommand && wasTextInserted(target, text)) {
        logger?.('Inserted via document.execCommand.', 'log');
        success = true;
      } else {
        if (insertedWithExecCommand) {
          logger?.('execCommand reported success but content did not change; falling back.', 'warn');
        }
        success = appendFragmentFallback(target, text, logger);
      }

      dispatchInput(target, text);
      return { success, method: success && insertedWithExecCommand ? 'execCommand' : 'fragment' };
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
    const fragment = document.createDocumentFragment();
    const lines = String(text ?? '').split(/\n/);
    lines.forEach((line, index) => {
      fragment.appendChild(document.createTextNode(line));
      if (index < lines.length - 1) {
        fragment.appendChild(document.createElement('br'));
      }
    });

    target.appendChild(fragment);
    placeCaretAtEnd(target);
  }

  function placeCaretAtEnd(element) {
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {}
  }

  function placeCaretAtStart(element) {
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(true);
      const selection = window.getSelection();
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

  window.TextInsertionUtils = {
    insertText,
    normalizeInsertMode,
  };
})();

