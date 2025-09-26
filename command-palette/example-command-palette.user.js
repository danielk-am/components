// ==UserScript==
// @name         Example Command Palette Usage
// @namespace    https://danielk.am
// @version      2025.09.25
// @description  Example showing how to use the reusable command palette from HE Core
// @author       Daniel Kam
// @match        https://*.zendesk.com/agent/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function waitForEvent(name, timeoutMs = 15000) {
        return new Promise((resolve) => {
            let done = false;
            const on = (e) => { if (done) return; done = true; resolve(e); document.removeEventListener(name, on); };
            document.addEventListener(name, on);
            setTimeout(() => { if (!done) resolve(null); }, timeoutMs);
        });
    }

    // Example command suggestions
    const exampleCommands = [
        {
            name: 'Generate Summary',
            command: 'summarize',
            description: 'Create a concise summary of the conversation',
            category: 'AI Tools',
            tags: ['summary', 'ai']
        },
        {
            name: 'Professional Tone',
            command: 'make professional',
            description: 'Rewrite text in a professional tone',
            category: 'AI Tools',
            tags: ['tone', 'professional']
        },
        {
            name: 'Create Troubleshooting Steps',
            command: 'troubleshoot',
            description: 'Generate step-by-step troubleshooting guide',
            category: 'Support',
            tags: ['troubleshoot', 'steps']
        },
        {
            name: 'Format as List',
            command: 'format list',
            description: 'Convert text to numbered or bulleted list',
            category: 'Formatting',
            tags: ['format', 'list']
        }
    ];

    // Example AI processing function
    async function processAiCommand(command, targetEditor) {
        // Simulate API call
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(`This is a sample AI response for command: "${command}"\n\n1. **First step** - Do something important\n   - Sub-item with [example link](https://example.com)\n   - Another sub-item\n\n2. **Second step** - Do something else\n   - More details here\n\n3. **Final step** - Complete the process\n\n---\n\n**Note**: This is just an example response showing formatting capabilities.`);
            }, 2000);
        });
    }

    async function init() {
        // Wait for HE Core to be ready
        let ui = window.zenHeUi || null;
        if (!ui) {
            const ev = await waitForEvent('zen-he-tool-ready', 15000);
            if (!ev || !ev.detail || !ev.detail.ui) return;
            ui = ev.detail.ui;
        }

        // Create the command palette
        const palette = ui.createCommandPalette({
            id: 'example-ai-palette',
            title: 'Example AI Command Palette',
            placeholder: 'Type AI command or select from suggestions...',
            showPreview: true,
            suggestions: exampleCommands,
            keyboardShortcut: { key: '/', ctrlKey: true, shiftKey: true }, // Ctrl+Shift+/
            
            // Handle suggestion selection
            onSuggestionSelect: async (item, targetEditor) => {
                console.log('Selected command:', item.command);
                
                // Show loading status
                ui.updateCommandPaletteStatus(palette.id, `Processing: "${item.command}"`, true);
                
                try {
                    // Process the command
                    const response = await processAiCommand(item.command, targetEditor);
                    
                    // Convert to HTML and show in preview
                    const htmlContent = ui.convertTextToHtml(response);
                    palette.showPreview(htmlContent);
                    
                    // Update status
                    ui.updateCommandPaletteStatus(palette.id, '✅ Response ready - review and copy to insert');
                    
                } catch (error) {
                    console.error('Error processing command:', error);
                    ui.updateCommandPaletteStatus(palette.id, '❌ Error processing command');
                }
            },
            
            // Handle custom commands (typed directly)
            onCustomCommand: async (command, targetEditor) => {
                console.log('Custom command:', command);
                
                // Show loading status
                ui.updateCommandPaletteStatus(palette.id, `Processing: "${command}"`, true);
                
                try {
                    // Process the custom command
                    const response = await processAiCommand(command, targetEditor);
                    
                    // Convert to HTML and show in preview
                    const htmlContent = ui.convertTextToHtml(response);
                    palette.showPreview(htmlContent);
                    
                    // Update status
                    ui.updateCommandPaletteStatus(palette.id, '✅ Response ready - review and copy to insert');
                    
                } catch (error) {
                    console.error('Error processing custom command:', error);
                    ui.updateCommandPaletteStatus(palette.id, '❌ Error processing command');
                }
            }
        });

        console.log('Example Command Palette initialized! Press Ctrl+Shift+/ to test.');
        
        // You can also create sections that open the palette
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="font-size:11px; color:#666; margin-bottom:8px;">
                Example command palette with AI preview functionality.
            </div>
            <button type="button" style="background:#fff; border:1px solid #d8dcde; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:12px;">
                Open Example Palette
            </button>
        `;
        
        const button = content.querySelector('button');
        button.addEventListener('click', () => {
            // Find any active editor
            const activeEditor = document.activeElement;
            if (activeEditor && (
                activeEditor.tagName === 'TEXTAREA' ||
                activeEditor.tagName === 'INPUT' ||
                activeEditor.contentEditable === 'true'
            )) {
                palette.show(activeEditor);
            } else {
                // Find a text editor on the page
                const editor = document.querySelector('textarea, input[type="text"], [contenteditable="true"]');
                palette.show(editor);
            }
        });

        ui.registerSection({
            id: 'example-command-palette',
            title: 'Example Command Palette',
            priority: 999, // Show at bottom
            content,
            onTicketChange: () => {}
        });
    }

    init();
})();
