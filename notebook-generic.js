window.NOTEBOOK_CONFIG = {
    outputCurtailThresholdLines: 40,
    outputCurtailShowLines: 10,
    outputLineHeightPx: 21,
    autoClearOutputOnEdit: true
};

const MathJaxHelper = {
    queue: function(el, onComplete) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([el]).then(() => {
                if(onComplete) onComplete();
            }).catch(err => console.log("MathJax error:", err.message));
        } else {
            setTimeout(() => this.queue(el, onComplete), 500);
        }
    }
};

class PyodideKernel {
    constructor() {
        this.isReady = false;
        this.pyodide = null;
        this.currentOutputDiv = null;
    }

    async init(statusCallback) {
        statusCallback('loading');
        try {
            this.pyodide = await loadPyodide({
                stdout: (text) => this.writeOutput(text, 'text-slate-700'),
                stderr: (text) => this.writeOutput(text, 'text-red-500 font-semibold')
            });
            
            statusCallback('loading-packages');
            await this.pyodide.loadPackage(['matplotlib', 'numpy']);

            window._injectKernelSvg = (svgData) => this.injectSvg(svgData);
            
            const setupCode = `
import matplotlib
matplotlib.use('svg')
import matplotlib.pyplot as plt
import io
import js
plt.close('all')

def _custom_show():
    buf = io.BytesIO()
    plt.savefig(buf, format='svg', bbox_inches='tight')
    buf.seek(0)
    js._injectKernelSvg(buf.read().decode('utf-8'))
    plt.close()

plt.show = _custom_show
`;                  
            await this.pyodide.loadPackagesFromImports(setupCode);
            await this.pyodide.runPythonAsync(setupCode);
            
            this.isReady = true;
            statusCallback('ready');
        } catch (err) {
            statusCallback('error');
            console.error("Kernel Boot Error:", err);
        }
    }

    writeOutput(text, classes) {
        if (!this.currentOutputDiv) return;
        const span = document.createElement('span');
        span.className = classes;
        span.innerText = text + "\n";
        this.currentOutputDiv.appendChild(span);
    }

    injectSvg(svgData) {
        if (!this.currentOutputDiv) return;
        const wrap = document.createElement('div');
        wrap.className = 'inline-block bg-white my-2 p-2 rounded shadow-sm border border-slate-200'; 
        wrap.innerHTML = svgData;
        const svgEl = wrap.querySelector('svg');
        if(svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
        this.currentOutputDiv.appendChild(wrap);
    }

    async execute(code, targetDiv) {
        this.currentOutputDiv = targetDiv;
        await this.pyodide.loadPackagesFromImports(code);
        const result = await this.pyodide.runPythonAsync(code);

        try { await this.pyodide.runPythonAsync(`import matplotlib.pyplot as plt\nif plt.get_fignums(): plt.show()`); } catch(e) {}

        if (result !== undefined) {
            this.pyodide.globals.set('_last_result', result);
            const reprStr = this.pyodide.runPython('repr(_last_result)');
            if (reprStr !== 'None') {
                const outWrap = document.createElement('div');
                outWrap.className = 'mt-1 font-mono text-sm text-slate-800';
                outWrap.innerText = reprStr;
                this.currentOutputDiv.appendChild(outWrap);
            }
        }
        this.currentOutputDiv = null;
    }
}

class BaseNotebookCell extends HTMLElement {
    constructor() {
        super();
        this._initialized = false;
        this.actionBtnElement = null;
        this.resizeObserver = null;
    }

    connectedCallback() {
        if (this._initialized) return;
        this._initialized = true;
        
        this.cellId = this.getAttribute('cell-id') || Math.random().toString(36).substring(2, 9);
        this.cellType = this.getAttribute('cell-type') || 'text';
        this.isReadOnly = this.hasAttribute('is-readonly');
        this.isLocked = this.hasAttribute('is-locked') || this.isReadOnly; // Locked implies non-editable/non-deletable
        this.content = this.getAttribute('content') || '';

        this.renderShell();
        this.mountContent(this.contentArea);

        this.resizeObserver = new ResizeObserver(() => {
            this.dispatchAction('cell-height-changed');
        });

        if (this.mainBox) this.resizeObserver.observe(this.mainBox);
    }

    disconnectedCallback() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this._kernelStatusHandler) window.removeEventListener('kernel-status-changed', this._kernelStatusHandler);
    }

    dispatchAction(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: { id: this.cellId, ...detail }, bubbles: true, composed: true }));
    }

    renderShell() {
        this.className = 'cell-wrapper relative flex flex-col w-full my-1.5 group/wrapper block box-border';

        this.mainBox = document.createElement('div');
        this.mainBox.className = 'cell-container group/cell relative bg-white border border-slate-200 rounded-md shadow-sm flex items-stretch transition-all hover:border-slate-300 min-h-[1.75rem] box-border';
        if (this.isLocked) this.mainBox.classList.add('bg-slate-50', 'border-slate-300');

        // Render Drag Handle ONLY if not locked
        if (!this.isLocked) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-600 group-hover/cell:bg-blue-400 cursor-grab z-30 rounded-l-md opacity-0 group-hover/cell:opacity-100 transition-all';
            this.mainBox.appendChild(dragHandle);
        }

        this.contentArea = document.createElement('div');
        this.contentArea.className = 'flex-1 relative flex flex-col min-w-0 p-0 box-border min-h-0';
        
        // Render Toolbar (Modified for Locked state)
        if (!this.isReadOnly) {
            const toolbar = document.createElement('div');
            toolbar.className = 'cell-toolbar absolute z-40 flex items-center gap-1 bg-white/95 backdrop-blur-sm shadow-sm border border-slate-200 rounded-md px-1.5 py-0.5 opacity-0 group-hover/cell:opacity-100 transition-all text-xs';

            if (this.isLocked) {
                // Locked Cell Toolbar: Just a static badge showing the type
                const badge = document.createElement('span');
                badge.className = 'text-slate-400 font-medium px-1 cursor-default pointer-events-none uppercase tracking-wider text-[10px]';
                badge.innerText = this.cellType;
                badge.title = 'This cell is locked by the instructor';
                toolbar.appendChild(badge);
            } else {
                // Full Editable Toolbar
                const dropdownWrap = document.createElement('div');
                dropdownWrap.className = 'relative flex items-center justify-center rounded hover:bg-slate-100 transition-colors text-slate-500 font-medium px-1 cursor-pointer';
                dropdownWrap.innerHTML = `
                    <span>${this.cellType}</span>
                    <svg class="w-3 h-3 ml-0.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    <select class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="Change Cell Type">
                        <option value="code" ${this.cellType === 'code' ? 'selected' : ''}>code</option>
                        <option value="markdown" ${this.cellType === 'markdown' ? 'selected' : ''}>markdown</option>
                        <option value="text" ${this.cellType === 'text' ? 'selected' : ''}>text</option>
                    </select>
                `;
                dropdownWrap.querySelector('select').addEventListener('change', (e) => {
                    this.dispatchAction('cell-type-changed', { newType: e.target.value, content: this.content });
                });
                toolbar.appendChild(dropdownWrap);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors ml-0.5 border-l border-slate-200 pl-1';
                deleteBtn.title = 'delete cell';
                deleteBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
                deleteBtn.onclick = () => this.dispatchAction('cell-deleted');
                toolbar.appendChild(deleteBtn);
            }

            this.contentArea.appendChild(toolbar);
        }

        this.actionBtnElement = document.createElement('button');
        this.actionBtnElement.className = 'cell-action-btn absolute z-30 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md transition-all opacity-0 hidden group-hover/cell:opacity-100';
        this.actionBtnElement.onclick = () => this.handleActionClick();
        this.contentArea.appendChild(this.actionBtnElement);

        this.mainBox.appendChild(this.contentArea);
        this.appendChild(this.mainBox);
        
        // We ALWAYS append the bottom inserter, even if this cell is locked, 
        // so students can insert an answer block below the locked question block.
        if (!this.isReadOnly) {
            const botInserter = document.createElement('div');
            botInserter.className = 'bot-inserter absolute left-0 right-0 h-3 flex items-center justify-center group/inserter cursor-pointer w-4/5 mx-auto z-10 transition-all duration-300 hover:h-6';
            botInserter.style.top = 'calc(100% + 6px)';
            botInserter.style.transform = 'translateY(-50%)';
            botInserter.title = `Add cell below`;
            botInserter.innerHTML = `
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center"><div class="h-px w-full bg-transparent group-hover/inserter:bg-blue-400 transition-colors duration-150"></div></div>
                <div class="relative z-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white shadow-md opacity-0 group-hover/inserter:opacity-100 transition-all duration-300 mx-auto w-6 h-6 rounded-full scale-50 group-hover/inserter:scale-100 delay-100">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                </div>
            `;
            botInserter.onclick = () => this.dispatchAction('cell-insert-below');
            this.botInserter = botInserter;
            this.appendChild(botInserter);
        }
    }

    mountContent(container) { /* abstract */ }
    handleActionClick() { /* abstract */ }
    refresh() { /* abstract */ }

    updateActionButton(config) {
        if (this.actionBtnElement && config && !this.isReadOnly) {
            this.actionBtnElement.classList.remove('hidden');
            this.actionBtnElement.title = config.title;
            this.actionBtnElement.innerHTML = config.icon;
        }
    }

    setButtonState(state) {
        if (!this.actionBtnElement) return;
        const config = this.getActionButtonConfig();
        if (state === 'running') {
            this.actionBtnElement.innerHTML = `<span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>`;
        } else if (state === 'success') {
            this.actionBtnElement.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
        } else {
            this.actionBtnElement.innerHTML = config.icon;
        }
    }

    toJSON() { 
        return { id: this.cellId, type: this.cellType, content: this.content, locked: this.isLocked }; 
    }
}
window.BaseNotebookCell = BaseNotebookCell;

class NotebookCore {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.isReadOnly = options.isReadOnly || false;
        this.kernel = new PyodideKernel();
        this.kernel.init((status) => this.updateKernelStatus(status));
        
        this.setupEventListeners();

        document.fonts.ready.then(() => {
            Array.from(this.container.children).forEach(cell => { if(cell.refresh) cell.refresh(); });
            if (typeof sendHeight === 'function') sendHeight();
        });
    }

    setupEventListeners() {
        this.container.addEventListener('cell-content-changed', () => this.syncToServer());
        this.container.addEventListener('cell-height-changed', () => {
            if (typeof sendHeight === 'function') requestAnimationFrame(sendHeight);
        });
        
        this.container.addEventListener('cell-deleted', (e) => {
            const el = e.target;
            if (!this.isReadOnly && el && !el.isLocked) {
                el.remove();
                this.syncToServer();
            }
        });

        this.container.addEventListener('cell-insert-below', (e) => {
            if (this.isReadOnly) return;
            const el = e.target;
            const newCell = this.createCellElement({ type: 'code', content: '' });
            el.insertAdjacentElement('afterend', newCell);
            this.syncToServer();
            setTimeout(() => newCell.focusCell(), 50);
        });

        this.container.addEventListener('cell-type-changed', (e) => {
            if (this.isReadOnly) return;
            const oldEl = e.target;
            if (oldEl.isLocked) return; // Ignore if locked
            
            const newType = e.detail.newType;
            const content = e.detail.content;
            
            const newCell = this.createCellElement({ type: newType, content: content, isEditing: newType === 'markdown' });
            this.container.insertBefore(newCell, oldEl);
            oldEl.remove();
            this.syncToServer();
            setTimeout(() => newCell.focusCell(), 50);
        });
    }

    updateKernelStatus(status) {
        const el = document.getElementById('kernel-status');
        const runBtn = document.getElementById('run-all-btn');
        const isReady = (status === 'ready');
        
        if (status === 'loading') el.innerHTML = `Loading Kernel... <span class="w-3 h-3 ml-1 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block"></span>`;
        else if (status === 'loading-packages') el.innerHTML = `Loading Packages...`;
        else if (status === 'ready') el.innerHTML = `<span class="h-2 w-2 rounded-full bg-green-500 inline-block mr-1"></span> Ready`;
        else el.innerHTML = `<span class="h-2 w-2 rounded-full bg-red-500 inline-block mr-1"></span> Error`;

        if (runBtn) runBtn.disabled = !isReady;
        
        window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady } }));
    }

    loadData(cellDataArray) {
        this.container.innerHTML = '';
        cellDataArray.forEach(data => {
            this.container.appendChild(this.createCellElement(data));
        });
        this.setupDragAndDrop();
    }

    createCellElement(data) {
        let tagName = 'notebook-text-cell';
        if (data.type === 'markdown') tagName = 'notebook-markdown-cell';
        if (data.type === 'code') tagName = 'notebook-code-cell';

        const cell = document.createElement(tagName);
        cell.setAttribute('cell-id', data.id || Math.random().toString(36).substring(2, 9));
        cell.setAttribute('cell-type', data.type || 'text');
        cell.setAttribute('content', data.content || '');
        if (data.output) cell.setAttribute('output', data.output);
        if (data.isEditing) cell.setAttribute('is-editing', '');
        if (this.isReadOnly) cell.setAttribute('is-readonly', '');
        if (data.locked) cell.setAttribute('is-locked', '');
        return cell;
    }

    addCell(type = 'code', index = 0) {
        if (this.isReadOnly) return;
        const newCell = this.createCellElement({ type: type, content: '', isEditing: type === 'markdown' });
        
        if (this.container.children.length === 0 || index >= this.container.children.length) {
            this.container.appendChild(newCell);
        } else {
            this.container.insertBefore(newCell, this.container.children[index]);
        }
        
        this.syncToServer();
        setTimeout(() => newCell.focusCell(), 100);
    }

    async runAll() {
        const cells = Array.from(this.container.children);
        for (const cell of cells) {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell') {
                cell.refresh();
                await cell.handleActionClick();
            }
        }
    }

    setupDragAndDrop() {
        if (this.isReadOnly || this.sortable) return;
        this.sortable = new Sortable(this.container, {
            handle: '.drag-handle',
            animation: 150,
            filter: '[is-locked]', // Prevent dragging OF locked items
            onEnd: () => {
                const cells = Array.from(this.container.children);
                cells.forEach(cell => { if(cell.refresh) cell.refresh(); }); 
                this.syncToServer();
            },
        });
    }

    toJSON() { 
        return Array.from(this.container.children).map(c => c.toJSON()); 
    }

    syncToServer() {
        if (typeof window.triggerHostSync === 'function') {
            const flatText = NotebookCore.serializeToFlat(this.toJSON());
            window.triggerHostSync(flatText);
        }
    }

    exportMD() {
        const flatText = NotebookCore.serializeToFlat(this.toJSON());
        const blob = new Blob([flatText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'notebook.py';
        a.click();
        URL.revokeObjectURL(url);
    }

    importMD(event) {
        if (this.isReadOnly) return;
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const cells = NotebookCore.deserializeFromFlat(e.target.result);
            if (cells.length > 0) {
                this.loadData(cells);
                this.syncToServer();
            }
            event.target.value = ''; 
        };
        reader.readAsText(file);
    }

    // --- STATIC FLAT PARSERS ---
    static serializeToFlat(cells) {
        return cells.map(cell => {
            const meta = {};
            if (cell.locked) meta.locked = true;
            if (cell.type === 'code') meta.lang = 'python';
            
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            const header = `# %% [${cell.type}]${metaStr}`;
            
            let content = cell.content;
            if (cell.type === 'markdown' || cell.type === 'text') {
                content = `"""\n${content}\n"""`;
            }
            return `${header}\n${content}`;
        }).join('\n\n');
    }

    static deserializeFromFlat(text) {
        if (!text || !text.includes('# %%')) {
            return [{ type: 'code', content: (text||'').trim(), isEditing: false, output: '' }];
        }

        const cells = [];
        const blocks = text.split(/(?=# %%\s*\[)/); // Split cleanly while preserving delimiter boundaries
        
        for (let block of blocks) {
            if (!block.trim()) continue;
            
            // Match: # %% [type] {optional metadata} \n content
            // Improved regex: Allows leading/trailing spaces and forgives blank lines before the marker
            const m = block.match(/^\s*# %%\s*\[([^\]]+)\](?:[ \t]*(\{.*?\}))?[ \t]*\r?\n([\s\S]*)$/);
            if (m) {
                let type = m[1].toLowerCase().trim();
                if (type === 'python') type = 'code';
                if (type === 'plain') type = 'text';

                let meta = {};
                if (m[2]) {
                    try { meta = JSON.parse(m[2].replace(/'/g, '"')); } catch(e) {}
                }

                let content = m[3].replace(/\r?\n$/, '');
                if (type === 'markdown' || type === 'text') {
                    // Extract gracefully from triple quotes if they exist
                    const tqMatch = content.match(/^\s*"""\r?\n?([\s\S]*?)\r?\n?"""\s*$/);
                    if (tqMatch) {
                        content = tqMatch[1];
                    }
                }

                cells.push({
                    type: type,
                    content: content,
                    locked: meta.locked || false,
                    isEditing: false,
                    output: ''
                });
            } else {
                // Failsafe: if regex misses, dump as code so no data is ever lost
                cells.push({
                    type: 'code',
                    content: block.trim(),
                    isEditing: false,
                    output: ''
                });
            }
        }
        return cells;
    }
}
window.NotebookCore = NotebookCore;