// command-palette-ai-stream-utils.js
// Shared utilities for handling AI streaming responses

(function () {
  'use strict';

  /**
   * Detects whether a response content-type represents streaming-friendly formats.
   *
   * @param {string} contentType - Response header value to inspect.
   * @returns {boolean} True when the type corresponds to streaming payloads.
   */
  function isStreamingContentType(contentType) {
    if (!contentType) return false;
    const lowered = contentType.toLowerCase();
    return (
      lowered.includes('text/event-stream') ||
      lowered.includes('application/x-ndjson') ||
      lowered.includes('application/jsonl') ||
      lowered.includes('application/stream+json')
    );
  }

  /**
   * Parses a raw line from streaming responses, attempting to extract textual content.
   *
   * @param {string} line - Raw NDJSON/SSE line.
   * @returns {string} Extracted text portion or an empty string when none was found.
   */
  function defaultParseChunk(line) {
    if (!line) return '';

    const trimmedLine = line.replace(/^data:\s*/, '').trim();
    if (!trimmedLine) return '';

    try {
      const parsed = JSON.parse(trimmedLine);
      if (parsed == null) return '';

      const type = typeof parsed.type === 'string' ? parsed.type.toLowerCase() : '';

      if (type === 'begin' || type === 'start') return '';
      if (type === 'end' || type === 'finish') return '';

      if (type === 'item' || type === 'chunk' || type === 'delta' || type === 'token') {
        return (
          parsed.content ||
          parsed.text ||
          parsed.delta ||
          parsed.token ||
          ''
        );
      }

      if (parsed.choices && parsed.choices[0]) {
        const choice = parsed.choices[0];
        if (choice.delta && choice.delta.content) {
          return choice.delta.content;
        }
        if (choice.message && choice.message.content) {
          return choice.message.content;
        }
      }

      if (typeof parsed.content === 'string') return parsed.content;
      if (typeof parsed.text === 'string') return parsed.text;
      if (typeof parsed.response === 'string') return parsed.response;

      return trimmedLine;
    } catch (error) {
      return trimmedLine;
    }
  }

  /**
   * Processes a fetch Response as a streaming payload, dispatching lifecycle callbacks.
   *
   * @param {Response} response - Fetch response to inspect for stream support.
   * @param {Object} [options={}] - Streaming handlers and configuration flags.
   * @param {boolean} [options.requireStreamingContentType=false] - Guard to ensure header validation.
   * @param {Function} [options.parseChunk=defaultParseChunk] - Parser for each streamed line.
   * @param {Function} [options.onStart] - Invoked before streaming begins.
   * @param {Function} [options.onChunk] - Invoked per chunk with parsed text.
   * @param {Function} [options.onComplete] - Invoked when the stream finishes.
   * @param {Function} [options.onError] - Invoked when streaming throws.
   * @returns {Promise<{handled: boolean, text: string}>} Result describing streaming outcome.
   */
  async function tryHandleStreamingResponse(response, options = {}) {
    const {
      requireStreamingContentType = false,
      parseChunk = defaultParseChunk,
      onStart,
      onChunk,
      onComplete,
      onError,
    } = options;

    try {
      if (!response || !response.body) return { handled: false, text: '' };

      const contentType = response.headers?.get('content-type') || '';
      if (requireStreamingContentType && !isStreamingContentType(contentType)) {
        return { handled: false, text: '' };
      }

      const reader = response.body.getReader();
      if (!reader) return { handled: false, text: '' };

      onStart?.(response);

      const decoder = new TextDecoder();
      let buffer = '';
      let finalText = '';
      let receivedAny = false;
      let structuredChunkSeen = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          const chunk = parseChunk(line);
          if (!chunk) continue;
          receivedAny = true;
          if (chunk !== line) structuredChunkSeen = true;
          finalText += chunk;
          onChunk?.(chunk);
        }
      }

      buffer += decoder.decode();
      const remaining = buffer.trim();
      if (remaining) {
        const chunk = parseChunk(remaining);
        if (chunk) {
          receivedAny = true;
          if (chunk !== remaining) structuredChunkSeen = true;
          finalText += chunk;
          onChunk?.(chunk);
        }
      }

      onComplete?.({
        text: finalText,
        receivedAny,
        structured: structuredChunkSeen,
        contentType,
      });

      if (!receivedAny || (!structuredChunkSeen && !finalText.trim())) {
        return { handled: false, text: finalText };
      }

      return { handled: true, text: finalText };
    } catch (error) {
      onError?.(error);
      return { handled: false, text: '' };
    }
  }

  window.AIStreamUtils = {
    tryHandleStreamingResponse,
    parseChunk: defaultParseChunk,
    isStreamingContentType,
  };
})();

