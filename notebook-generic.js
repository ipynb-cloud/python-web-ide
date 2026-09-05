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
        this.content = this.getAttribute('content') || '';

        this.renderShell();
        this.mountContent(this.contentArea);

        // Native DOM sizing observer - fires when cells expand dynamically
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
        // Tightened vertical margin (my-1.5 matches the 12px inserter gap perfectly)
        this.className = 'cell-wrapper relative flex flex-col w-full my-1.5 group/wrapper block box-border';

        // Base height is 1.75rem (28px). Code cells will override internal wrap to min-h-[3.25rem]
        this.mainBox = document.createElement('div');
        this.mainBox.className = 'cell-container group/cell relative bg-white border border-slate-200 rounded-md shadow-sm flex items-stretch transition-all hover:border-slate-300 min-h-[1.75rem] box-border';
        if (this.isReadOnly) this.mainBox.classList.add('bg-slate-50');

        if (!this.isReadOnly) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-600 group-hover/cell:bg-blue-400 cursor-grab z-30 rounded-l-md opacity-0 group-hover/cell:opacity-100 transition-all';
            this.mainBox.appendChild(dragHandle);
        }

        this.contentArea = document.createElement('div');
        this.contentArea.className = 'flex-1 relative flex flex-col min-w-0 p-0 box-border min-h-0';
        
        if (!this.isReadOnly) {
            const toolbar = document.createElement('div');
            toolbar.className = 'cell-toolbar absolute z-40 flex items-center gap-1 bg-white/95 backdrop-blur-sm shadow-sm border border-slate-200 rounded-md px-1.5 py-0.5 opacity-0 group-hover/cell:opacity-100 transition-all text-xs';

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

            this.contentArea.appendChild(toolbar);
        }

        this.actionBtnElement = document.createElement('button');
        // Managed by global layout CSS overrides for placement
        this.actionBtnElement.className = 'cell-action-btn absolute z-30 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md transition-all opacity-0 hidden group-hover/cell:opacity-100';
        this.actionBtnElement.onclick = () => this.handleActionClick();
        this.contentArea.appendChild(this.actionBtnElement);

        this.mainBox.appendChild(this.contentArea);
        this.appendChild(this.mainBox);

        if (!this.isReadOnly) {
            // FIXED: Centered 100% + 6px transform guarantees perfect symmetry when expanding to h-6
            const botInserter = document.createElement('div');
            botInserter.className = 'bot-inserter absolute left-0 right-0 h-3 flex items-center justify-center group/inserter cursor-pointer w-4/5 mx-auto z-10 transition-all duration-300 hover:h-6';
            botInserter.style.top = 'calc(100% + 6px)';
            botInserter.style.transform = 'translateY(-50%)';
            botInserter.title = `Add cell below`;
            botInserter.innerHTML = `
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center"><div class="h-px w-full bg-transparent group-hover/inserter:bg-blue-400 transition-colors duration-150"></div></div>
                <div class="relative z-10 flex items-center justify-center bg-transparent opacity-0 group-hover/inserter:opacity-100 transition-all duration-300 text-slate-400 group-hover/inserter:text-blue-500 mx-auto w-5 h-5 rounded-full scale-50 group-hover/inserter:scale-100 delay-100">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
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
        return { id: this.cellId, type: this.cellType, content: this.content }; 
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
            if (!this.isReadOnly && el) {
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
        
        // Notify all cells globally that kernel state changed
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
            window.triggerHostSync(JSON.stringify(this.toJSON()));
        }
    }

    exportMD() {
        let mdContent = '';
        Array.from(this.container.children).forEach(cell => {
            const data = cell.toJSON();
            const cellType = data.type === 'code' ? 'python' : (data.type === 'text' ? 'plain' : 'markdown');
            mdContent += `# %% [${cellType}]\n${data.content}\n\n`;
        });
        const blob = new Blob([mdContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'notebook.md';
        a.click();
        URL.revokeObjectURL(url);
    }

    importMD(event) {
        if (this.isReadOnly) return;
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            let rawCells = [];
            
            if (content.includes('# %%')) {
                const chunks = content.split(/# %%\s*\[(?<type>.*?)\]/g);
                for(let i=1; i<chunks.length; i+=2) {
                    rawCells.push({ 
                        type: chunks[i] === 'python' ? 'code' : (chunks[i] === 'plain' ? 'text' : 'markdown'),
                        content: chunks[i+1].replace(/^\n/, '').trimEnd(), 
                        isEditing: false, output: '' 
                    });
                }
            } else {
                rawCells = [{ type: 'code', content: content.trimEnd(), isEditing: false, output: '' }];
            }

            if (rawCells.length > 0) {
                this.loadData(rawCells);
                this.syncToServer();
            }
            event.target.value = ''; 
        };
        reader.readAsText(file);
    }
}
window.NotebookCore = NotebookCore;