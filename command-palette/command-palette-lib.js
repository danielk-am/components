(function () {
    'use strict';
  
    const DEFAULT_OPTIONS = {
      toggleKey: '/',
      toggleModifier: 'ctrlKey',
      width: 640,
      maxHeight: 440,
      placeholder: 'Type to search…',
      emptyState: 'No results found.',
      iconSize: 18,
    };
  
    const CSS = `
      :host {
        position: fixed;
        inset: 0;
        display: none;
        place-content: center;
        background: rgba(17, 24, 39, 0.6);
        z-index: 2147483000;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #0f172a;
      }
  
      :host([open]) { display: grid; }
  
      .palette {
        width: var(--cp-width);
        max-width: calc(100vw - 32px);
        background: white;
        border-radius: 14px;
        box-shadow:
          0 40px 80px rgba(15, 23, 42, 0.28),
          0 8px 20px rgba(15, 23, 42, 0.18);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
  
      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 18px 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.35);
      }
  
      .header svg { width: 16px; height: 16px; color: #64748b; }
  
      input[type="search"] {
        flex: 1;
        border: none;
        font-size: 15px;
        font-weight: 500;
        outline: none;
        background: transparent;
        color: inherit;
      }
  
      input[type="search"]::placeholder { color: #94a3b8; }
  
      .list {
        overflow-y: auto;
        max-height: var(--cp-max-height);
        padding: 10px 4px 12px;
        scrollbar-width: thin;
      }
  
      .group {
        padding: 10px 10px 0;
      }
  
      .group h2 {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #64748b;
        margin: 0 0 6px;
        font-weight: 600;
      }
  
      .item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        margin: 0 0 6px;
        border-radius: 10px;
        cursor: pointer;
        transition: background 160ms ease, transform 160ms ease;
      }
  
      .item[data-active="true"] {
        background: rgba(79, 70, 229, 0.1);
        color: #312e81;
      }
  
      .item[data-active="true"] .meta { color: #3730a3; }
  
      .item:active { transform: scale(0.995); }
  
      .icon {
        width: var(--cp-icon-size);
        height: var(--cp-icon-size);
        display: grid;
        place-items: center;
        border-radius: 6px;
        background: rgba(148, 163, 184, 0.16);
        color: #475569;
        flex-shrink: 0;
      }
  
      .icon img,
      .icon svg {
        width: 100%;
        height: 100%;
      }
  
      .body {
        flex: 1;
        min-width: 0;
      }
  
      .title {
        font-size: 14px;
        font-weight: 600;
        margin: 0;
        line-height: 1.35;
      }
  
      .meta {
        display: block;
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
      }
  
      .shortcut {
        margin-left: auto;
        font-size: 11px;
        color: #64748b;
        font-weight: 600;
        letter-spacing: 0.08em;
      }
  
      .empty {
        padding: 40px 20px;
        text-align: center;
        color: #64748b;
        font-size: 14px;
        font-weight: 500;
      }
    `;
  
    function fuzzymatch(term, text) {
      if (!term) return true;
      term = term.toLowerCase();
      text = text.toLowerCase();
  
      let ti = 0;
      let matches = 0;
      for (let i = 0; i < text.length && ti < term.length; i++) {
        if (term[ti] === text[i]) {
          ti++;
          matches++;
        }
      }
      return matches === term.length;
    }
  
    class CommandPalette extends HTMLElement {
      constructor(options = {}) {
        super();
        this.attachShadow({ mode: 'open' });
  
        this.config = { ...DEFAULT_OPTIONS, ...options };
        this.dataset.state = 'closed';
  
        const root = document.createElement('div');
        root.className = 'palette';
        root.style.setProperty('--cp-width', `${this.config.width}px`);
        root.style.setProperty('--cp-max-height', `${this.config.maxHeight}px`);
        root.style.setProperty('--cp-icon-size', `${this.config.iconSize}px`);
  
        const header = document.createElement('div');
        header.className = 'header';
  
        header.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M10 4h10M4 9h16M4 15h16M10 20h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        `;
  
        this.input = document.createElement('input');
        this.input.type = 'search';
        this.input.placeholder = this.config.placeholder;
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
  
        header.appendChild(this.input);
  
        this.list = document.createElement('div');
        this.list.className = 'list';
  
        root.appendChild(header);
        root.appendChild(this.list);
  
        const style = document.createElement('style');
        style.textContent = CSS;
        this.shadowRoot.append(style, root);
  
        this.items = [];
        this.filteredItems = [];
        this.activeIndex = -1;
        this.paletteData = [];
        this._boundKeyHandler = this._handleKey.bind(this);
        this._shortcutHandler = this._toggleFromShortcut.bind(this);
  
        this.input.addEventListener('input', () => this._filter());
        this.input.addEventListener('keydown', (e) => this._handleInputKeys(e));
        this.list.addEventListener('mousedown', (e) => this._handleClick(e));
      }
  
      connectedCallback() {
        document.addEventListener('keydown', this._shortcutHandler, true);
        document.body.appendChild(this);
      }
  
      disconnectedCallback() {
        document.removeEventListener('keydown', this._shortcutHandler, true);
      }
  
      setData(data) {
        this.paletteData = Array.isArray(data) ? data : [];
        this._render();
        this._filter();
      }
  
      open() {
        if (this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        this.dataset.state = 'open';
        this.input.value = '';
        this._filter();
        requestAnimationFrame(() => {
          this.input.focus();
        });
  
        document.addEventListener('keydown', this._boundKeyHandler, true);
      }
  
      close() {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dataset.state = 'closed';
        this.activeIndex = -1;
        this._highlightActive();
        document.removeEventListener('keydown', this._boundKeyHandler, true);
      }
  
      toggle() {
        if (this.dataset.state === 'open') {
          this.close();
        } else {
          this.open();
        }
      }
  
      _toggleFromShortcut(event) {
        if (event.key !== this.config.toggleKey || !event[this.config.toggleModifier]) return;
        if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)) return;
  
        event.preventDefault();
        this.toggle();
      }
  
      _handleKey(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          this.close();
        }
      }
  
      _handleInputKeys(event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this._moveSelection(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this._moveSelection(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this._activate();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          this._moveSelection(event.shiftKey ? -1 : 1);
        }
      }
  
      _handleClick(event) {
        const item = event.composedPath().find((node) => node?.dataset?.index);
        if (!item) return;
        const index = Number(item.dataset.index);
        this.activeIndex = index;
        this._highlightActive(true);
        this._activate();
      }
  
      _moveSelection(delta) {
        if (!this.filteredItems.length) return;
        this.activeIndex = (this.activeIndex + delta + this.filteredItems.length) % this.filteredItems.length;
        this._highlightActive(true);
      }
  
      _activate() {
        if (this.activeIndex < 0 || this.activeIndex >= this.filteredItems.length) return;
        const item = this.filteredItems[this.activeIndex];
        if (!item) return;
  
        if (typeof item.onSelect === 'function') {
          try {
            item.onSelect(item);
          } catch (err) {
            console.error('Command palette item threw:', err);
          }
        } else if (item.href) {
          window.open(item.href, item.target || '_blank');
        }
  
        if (item.keepOpen !== true) {
          this.close();
        }
      }
  
      _render() {
        this.list.innerHTML = '';
        this.items = [];
  
        this.paletteData.forEach((group, groupIndex) => {
          const section = document.createElement('div');
          section.className = 'group';
  
          if (group.label) {
            const heading = document.createElement('h2');
            heading.textContent = group.label;
            section.appendChild(heading);
          }
  
          (group.items || []).forEach((item, itemIndex) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.dataset.group = groupIndex;
            div.dataset.indexInGroup = itemIndex;
  
            div.innerHTML = `
              <div class="icon"></div>
              <div class="body">
                <p class="title"></p>
                <span class="meta"></span>
              </div>
              <span class="shortcut"></span>
            `;
  
            const front = div.querySelector('.icon');
            const title = div.querySelector('.title');
            const meta = div.querySelector('.meta');
            const shortcut = div.querySelector('.shortcut');
  
            if (item.icon) {
              if (item.icon.startsWith('<svg') || item.icon.startsWith('<path')) {
                front.innerHTML = item.icon.startsWith('<svg') ? item.icon : `<svg viewBox="0 0 24 24" fill="none">${item.icon}</svg>`;
              } else if (item.icon.startsWith('http')) {
                front.innerHTML = `<img src="${item.icon}" alt="" />`;
              } else {
                front.textContent = item.icon;
              }
            } else {
              front.style.visibility = 'hidden';
            }
  
            title.textContent = item.title || '';
            meta.textContent = item.description || '';
            shortcut.textContent = item.shortcut || '';
  
            if (!item.description) meta.style.display = 'none';
            if (!item.shortcut) shortcut.style.display = 'none';
  
            this.items.push({
              element: div,
              data: item,
              groupLabel: group.label || '',
              tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === 'string' ? item.tags.split(',') : []),
            });
  
            section.appendChild(div);
          });
  
          this.list.appendChild(section);
        });
      }
  
      _filter() {
        const term = this.input.value.trim();
        this.filteredItems = [];
  
        this.items.forEach((entry) => {
          const { data, element, groupLabel } = entry;
  
          const haystack = [
            data.title || '',
            data.description || '',
            groupLabel,
            (entry.tags || []).join(' '),
          ].join(' ');
  
          if (fuzzymatch(term, haystack)) {
            element.style.display = '';
            this.filteredItems.push(data);
            data._element = element;
          } else {
            element.style.display = 'none';
          }
        });
  
        if (term) {
          this.filteredItems.sort((a, b) => {
            const av = (a.title || '').toLowerCase();
            const bv = (b.title || '').toLowerCase();
            return av.localeCompare(bv);
          });
        }
  
        this.list.querySelectorAll('.group').forEach((groupEl) => {
          const hasVisible = Array.from(groupEl.children).some((child) => child.classList.contains('item') && child.style.display !== 'none');
          groupEl.style.display = hasVisible ? '' : 'none';
        });
  
        if (!this.filteredItems.length) {
          this._showEmptyState();
        } else {
          this._removeEmptyState();
        }
  
        this.activeIndex = this.filteredItems.length ? 0 : -1;
        this._highlightActive();
      }
  
      _highlightActive(scrollIntoView = false) {
        this.items.forEach((entry) => {
          entry.element.dataset.active = 'false';
        });
  
        if (this.activeIndex < 0 || this.activeIndex >= this.filteredItems.length) return;
        const activeItem = this.filteredItems[this.activeIndex];
        const el = activeItem._element;
        if (!el) return;
        el.dataset.active = 'true';
  
        if (scrollIntoView) {
          const container = this.list;
          const rect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
  
          if (rect.top < containerRect.top) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (rect.bottom > containerRect.bottom) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }
  
      _showEmptyState() {
        if (this._emptyEl) return;
        this._emptyEl = document.createElement('div');
        this._emptyEl.className = 'empty';
        this._emptyEl.textContent = this.config.emptyState;
        this.list.appendChild(this._emptyEl);
      }
  
      _removeEmptyState() {
        if (!this._emptyEl) return;
        this._emptyEl.remove();
        this._emptyEl = null;
      }
    }
  
    customElements.define('he-command-palette', CommandPalette);
  
    window.HeCommandPalette = {
      create(options = {}) {
        const palette = new CommandPalette(options);
        return palette;
      },
    };
  })();
