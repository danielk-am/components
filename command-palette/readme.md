# Zendesk Command Palette Hub

Centralised userscript that adds a configurable command palette to Zendesk. It aggregates static prompts, AI-assisted flows, and handy tooling in one searchable overlay powered by `command-palette-lib.js`.

## Features

- Unified palette toggle (`Ctrl+/` or `Cmd+/`) everywhere in the agent UI.
- Static snippets with preview, copy, and insert actions.
- AI-enabled commands that call configurable webhooks with fallback text.
- Streaming AI preview with graceful fallback to full responses.
- Utility actions for navigation, page refreshes, and external resources.
- Shadow DOM encapsulated UI via the shared `HeCommandPalette` web component.

## Quick Start

### 1. Install the Userscript

1. Load Tampermonkey/Greasemonkey in your browser.
2. Add `zendesk--cmd.user.js` and confirm the `@require` entries resolve (`command-palette-lib.js`, `command-palette-ai-stream-utils.js`, `command-palette-zendesk-editor-utils.js`, `command-palette-text-insertion-utils.js`).
3. Confirm the `@match` covers your Zendesk environment (defaults to `https://*.zendesk.com/*`).

### 2. Configure Commands

Open `zendesk--cmd.user.js` and update the top-level `CONFIG` object:

- `palette`: Shortcut and UI behaviour.
- `webhooks`: Optional shared webhook definitions that commands can reference via `webhookKey`.
- `catalog`: Remote command source. Provide a JSON endpoint in `catalog.url` or rely on the bundled `catalog.fallback` groups if the endpoint is blank/offline.

Reload Zendesk to apply changes. The script caches a remote catalog for five minutes by default (`catalog.cacheMs`).

Reload Zendesk to apply changes.

### 3. Use the Palette

Press `Ctrl+/` (Windows/Linux) or `Cmd+/` (macOS) to open. Type to filter commands, use arrow keys to navigate, and press `Enter` to trigger.

## Folder Structure

- `zendesk--cmd.user.js`: Main userscript implementation.
- `command-palette-lib.js`: Shared palette web component (pulled via `@require`).
- `command-palette-ai-stream-utils.js`: Streaming helpers for AI webhooks (exposed as `window.AIStreamUtils`).
- `command-palette-zendesk-editor-utils.js`: Zendesk-specific editor/ticket helpers (exposed as `window.ZendeskEditorUtils`).
- `command-palette-text-insertion-utils.js`: Editor-agnostic text insertion helpers (exposed as `window.TextInsertionUtils`).
- `COMMAND-PALETTE-GUIDE.md`: Step-by-step configuration guide.

## Customisation Tips

- **Personalisation tokens**: Use placeholders like `{{firstName}}` in static snippets and expand them during `insertTextIntoEditable` if desired.
- **AI payload metadata**: Extend `buildRequestMetadata()` (or supply `metadata` in the catalog JSON) to include ticket IDs, tags, or custom context before hitting webhooks.
- **Insertion modes**: Commands can specify `insertMode` (`caret`, `append`, `prepend`, `replace`) to control where text lands in the active editor.
- **Fallbacks**: Populate `fallback` arrays at the command or webhook level to keep flows useful when the API is offline.
- **Reusable helpers**: In new scripts, require the shared helpers instead of copying logic (`AIStreamUtils`, `ZendeskEditorUtils`, `TextInsertionUtils`).

## Troubleshooting

- **Palette does not open**: Ensure there are no conflicting keyboard shortcuts and that Tampermonkey reports the script as active on the page.
- **AI commands return demo text**: Populate the relevant `CONFIG.webhooks[key].url` and any required headers.
- **CSS collisions**: The UI renders in a Shadow DOM; confirm no third-party script overrides `HeCommandPalette` definition.

## License

MIT for the scripts in this folder unless stated otherwise. Refer to the upstream library repository for its licensing notes.

## Remote Command Catalogue Schema

When `CONFIG.catalog.url` is set, the script expects the endpoint to return JSON shaped like:

```json
{
  "updated_at": "2025-09-25T22:12:00Z",
  "groups": [
    {
      "label": "Predefined Responses",
      "type": "static",
      "items": [
        {
          "id": "warm-greeting",
          "title": "Warm Greeting",
          "description": "Friendly hello",
          "body": "Hi {{firstName}}…",
          "tags": ["greeting", "warm"],
          "insertMode": "caret"
        }
      ]
    },
    {
      "label": "AI Assist",
      "type": "webhook",
      "items": [
        {
          "id": "ai-friendly-update",
          "title": "Draft friendly update",
          "description": "Generate a warm progress update",
          "prompt": "Draft a friendly progress update…",
          "webhookKey": "aiFriendlyUpdate",
          "fallback": [
            "Thanks for your patience while we double-check your ticket.",
            "If anything still looks off, grab a screenshot and reply."
          ],
          "transform": { "insertMode": "append" }
        }
      ]
    },
    {
      "label": "Tools & Shortcuts",
      "type": "utility",
      "items": [
        {
          "id": "open-help",
          "title": "Open Help Center",
          "description": "Launch Zendesk docs",
          "icon": "<path d=\"M12 5v14m7-7H5\"/>",
          "href": "https://support.zendesk.com/hc/en-us",
          "target": "_blank"
        },
        {
          "id": "refresh-composer",
          "title": "Refresh Composer",
          "description": "Reload the page",
          "action": "reload"
        }
      ]
    }
  ]
}
```

### Supported Command Types

- `static` / `snippet`: Provide a `body` field (plain text/markdown) and optional `insertMode`.
- `webhook` / `ai`: Provide a `prompt`, plus either `webhookKey` (lookup in `CONFIG.webhooks`) or an inline `webhook` object `{ url, headers, timeoutMs, fallback, payload }`.
- `utility` / `tool`: Provide either `href` + `target`, an `action` (e.g. `reload`, `copy-url`), or implement custom logic inside the userscript.

### Optional Fields

- `tags`: Array of strings used to improve filtering.
- `shortcut`: Display text for command hinting.
- `fallback`: Array of strings shown when the webhook is unavailable (command-level).
- `metadata`: Object merged into the request metadata payload.
- `payload`: Extra JSON object sent under `payload` alongside the prompt.

## Shared Utility Modules

Each helper script attaches utilities to the `window` namespace so other Zendesk userscripts can reuse them without copy/pasting:

```javascript
// ==UserScript==
// @require https://raw.githubusercontent.com/danielk-am/components/refs/heads/main/command-palette/command-palette-lib.js
// @require https://raw.githubusercontent.com/danielk-am/components/refs/heads/main/command-palette/command-palette-ai-stream-utils.js
// @require https://raw.githubusercontent.com/danielk-am/components/refs/heads/main/command-palette/command-palette-zendesk-editor-utils.js
// @require https://raw.githubusercontent.com/danielk-am/components/refs/heads/main/command-palette/command-palette-text-insertion-utils.js
// ==/UserScript==
```

- `AIStreamUtils.tryHandleStreamingResponse(response, handlers)` handles NDJSON/SSE streams and surfaces decoded chunks.
- `ZendeskEditorUtils.createEditorState()` + `captureCurrentEditable()` keep track of the focused composer and ticket ID.
- `TextInsertionUtils.insertText(target, text, { mode })` performs resilient insertion for both CKEditor and plain inputs.

Import the helpers in any future Zendesk scripts to keep behaviours consistent (e.g., autosuggest, macros, QA tooling).

