# Command Palette Implementation Guide

This guide walks through configuring and extending `zendesk--cmd.user.js`.

## 1. Preparation

1. Install the userscript in Tampermonkey.
2. Ensure the shared helpers are accessible via their `@require` URLs (`command-palette-lib.js`, `command-palette-ai-stream-utils.js`, `command-palette-zendesk-editor-utils.js`, `command-palette-text-insertion-utils.js`).
3. Open `zendesk--cmd.user.js` in your editor.

## 2. Configuration Layout

All settings live inside the top-level `CONFIG` object.

```
CONFIG = {
  palette: { … },
  webhooks: { … },
  catalog: {
    url: '',
    headers: { … },
    cacheMs: 300000,
    fallback: [ … ]
  }
};
```

Modify these sections rather than editing the helper logic below. The script loads `catalog.url` when present and falls back to `catalog.fallback` (an array of groups) if the request fails or the URL is blank.

## 3. Palette Behaviour

- `toggleKey`, `toggleModifier`, `secondaryModifier`: Keyboard shortcut.
- `allowInInputs`: Keep true to let the palette open while typing in Zendesk editors.
- `backdropOpacity`: Adjust overlay darkness (0–1 range).
- `closeOnBackdrop`: When true, clicking outside the panel closes the palette.

## 4. Command Types

Each group in the catalog JSON—or in the `catalog.fallback` array—should declare a `type` (defaults to `static`). Supported values:

- `static` / `snippet`: Provide `body` (string) and optional `insertMode` (`caret`, `append`, `prepend`, `replace`).
- `webhook` / `ai`: Provide `prompt` plus either `webhookKey` (looked up in `CONFIG.webhooks`) or an inline `webhook` object `{ url, headers, timeoutMs, fallback, payload }`.
- `utility` / `tool`: Provide `href`/`target`, an `action` (e.g. `reload`, `copy-url`), or leave behaviour to the local script via `action` handlers.

Each item automatically gains preview, copy, and insert actions with the insert behaviour controlled by `insertMode`.

4. The AI workflow uses the shared helpers:
   - `AIStreamUtils.tryHandleStreamingResponse` to stream NDJSON/SSE content into the preview.
   - `ZendeskEditorUtils` to track the active Zendesk composer and ticket ID.
   - `TextInsertionUtils` to insert results into CKEditor or plain inputs.

Fallback text is displayed whenever the webhook fails or is not configured.

## 6. Utility Commands

Utility commands can:

- Open links (`href`, optional `target`).
- Trigger built-in actions via `action` (e.g. `reload`, `copy-url`).
- Combine both (e.g. `action: "open"` with `href`).

Add additional cases inside `handleUtilityAction` if you need bespoke behaviour.

## 7. Testing Checklist

- [ ] Palette opens with `Ctrl+/` or `Cmd+/` on any editor.
- [ ] Static snippets preview and insert correctly.
- [ ] AI commands hit the webhook and fall back gracefully.
- [ ] Utility actions run without errors.
- [ ] Backdrop click closes the palette (if enabled).

## 8. Extending Further

- Inject personalisation inside `insertTextIntoEditable` (e.g., replace `{{firstName}}`).
- Log command usage by extending the `onSelect` handlers before calling the preview helper.
- Add dynamic groups by returning them from your remote catalog service (no extra code changes required).
- Share logic between scripts by pulling in the helper modules (`AIStreamUtils`, `ZendeskEditorUtils`, `TextInsertionUtils`).

## 9. Deployment Tips

- Keep secrets (API keys) out of the script when possible; rely on webhook-side validation.
- Version bump the userscript metadata (`@version`) when pushing updates to keep Tampermonkey in sync.
- Document new commands in `README.md` so teammates know what is available.

