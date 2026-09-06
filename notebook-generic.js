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
    constructor(maxOutputChars = 200) {
        this.isReady = false;
        this.pyodide = null;
        this.currentOutputDiv = null;
        this.maxOutputChars = maxOutputChars;
        this.currentOutputCount = 0;
        this.outputLimitExceeded = false;
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
            
            window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady: true } }));
        } catch (err) {
            statusCallback('error');
            console.error("Kernel Boot Error:", err);
            window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady: false } }));
        }
    }

    writeOutput(text, classes) {
        if (!this.currentOutputDiv || this.outputLimitExceeded) return;
        
        this.currentOutputCount += text.length;
        if (this.currentOutputCount > this.maxOutputChars) {
            this.outputLimitExceeded = true;
            const span = document.createElement('span');
            span.className = 'text-red-500 font-bold block mt-2';
            span.innerText = `[Error: Output exceeded maximum limit of ${this.maxOutputChars} characters]`;
            this.currentOutputDiv.appendChild(span);
            return;
        }

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
        this.currentOutputCount = 0;
        this.outputLimitExceeded = false;

        await this.pyodide.loadPackagesFromImports(code);
        
        // --- TIMEOUT & OUTPUT LIMIT HACK ---
        await this.pyodide.runPythonAsync(`
import sys
import time
import js
_pynote_start_time = time.time()

def _pynote_tracer(frame, event, arg):
    if time.time() - _pynote_start_time > 0.5:  
        sys.settrace(None)
        raise TimeoutError("Execution stopped: Time limit (5s) exceeded. Do you have an infinite loop?")
    
    if getattr(js.window.notebookCore.kernel, 'outputLimitExceeded', False):
        sys.settrace(None)
        raise RuntimeError("Execution stopped: Output exceeded maximum limit. Do you have an infinite print loop?")
        
    return _pynote_tracer

sys.settrace(_pynote_tracer)
        `);

        let result;
        try {
            result = await this.pyodide.runPythonAsync(code);
        } finally {
            // Always clear the tracer when done, even if the code errors out normally
            await this.pyodide.runPythonAsync(`sys.settrace(None)`);
        }
        // --- END TIMEOUT HACK ---

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

class SkulptKernel {
    constructor(maxOutputChars = 50000) {
        this.isReady = false;
        this.currentOutputDiv = null;
        this.maxOutputChars = maxOutputChars;
        this.currentOutputCount = 0;
        this.isKilled = false;
    }

    async init(statusCallback) {
        statusCallback('loading');
        
        if (typeof Sk === 'undefined') {
            statusCallback('loading-packages');
            try {
                await this.loadScript("https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js");
                await this.loadScript("https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js");
            } catch(e) {
                statusCallback('error');
                console.error("Failed to load Skulpt scripts");
                return;
            }
        }
        
        this.isReady = true;
        statusCallback('ready');
        window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady: true } }));
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    writeOutput(text, classes) {
        if (!this.currentOutputDiv) return;
        
        this.currentOutputCount += text.length;
        if (this.currentOutputCount > this.maxOutputChars) {
            this.isKilled = true;
            throw new Error(`Output limit exceeded`); // Caught by Skulpt
        }
        
        const span = document.createElement('span');
        span.className = classes;
        span.innerText = text; // Skulpt provides precise string chunks without forced newlines
        this.currentOutputDiv.appendChild(span);
    }

    async execute(code, targetDiv) {
        this.currentOutputDiv = targetDiv;
        this.currentOutputCount = 0;
        this.isKilled = false;

        Sk.configure({
            output: (text) => this.writeOutput(text, 'text-slate-700'),
            read: (x) => {
                if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
                    throw "File not found: '" + x + "'";
                return Sk.builtinFiles["files"][x];
            },
            __future__: Sk.python3,
            execLimit: 5000, // Built-in 5 second timeout for infinite loops
            yieldLimit: 100,
            timeoutMsg: () => "Execution stopped: Time limit (5s) exceeded. Do you have an infinite loop?"
        });

        try {
            await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, code, true));
        } catch (err) {
            if (this.isKilled) {
                throw new Error(`Execution stopped: Output exceeded maximum limit of ${this.maxOutputChars} characters.`);
            }
            // Strip Skulpt's internal trace jargon for cleaner output
            throw new Error(err.toString().replace(/<stdin>/g, "line"));
        } finally {
            this.currentOutputDiv = null;
        }
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
        this.isLocked = this.hasAttribute('is-locked'); 
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
    }

    dispatchAction(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: { id: this.cellId, ...detail }, bubbles: true, composed: true }));
    }

    renderShell() {
        this.className = 'cell-wrapper relative flex flex-col w-full my-1.5 group/wrapper block box-border';

        this.mainBox = document.createElement('div');
        this.mainBox.className = 'cell-container group/cell relative bg-white border border-slate-200 rounded-md shadow-sm flex items-stretch transition-all hover:border-slate-300 min-h-[1.75rem] box-border';
        
        const isReadOnlyGlobal = window.notebookCore && window.notebookCore.options && window.notebookCore.options.isReadOnly;

        if (this.isLocked || isReadOnlyGlobal) {
            this.mainBox.classList.add('bg-slate-50');
        }

        if (!this.isLocked && !isReadOnlyGlobal) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-600 group-hover/cell:bg-blue-400 cursor-grab z-30 rounded-l-md opacity-0 group-hover/cell:opacity-100 transition-all';
            this.mainBox.appendChild(dragHandle);
        }

        this.contentArea = document.createElement('div');
        this.contentArea.className = 'flex-1 relative flex flex-col min-w-0 p-0 box-border min-h-0';
        
        if (!this.isLocked && !isReadOnlyGlobal) {
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
        this.actionBtnElement.className = 'cell-action-btn absolute z-30 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md transition-all opacity-0 hidden group-hover/cell:opacity-100';
        this.actionBtnElement.onclick = () => this.handleActionClick();
        this.contentArea.appendChild(this.actionBtnElement);

        this.mainBox.appendChild(this.contentArea);
        this.appendChild(this.mainBox);

        // Append Inserter LAST so it stays below any output appended later
        const disableInsert = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableInsertAll;
        if (!isReadOnlyGlobal && !disableInsert) {
            this.botInserter = document.createElement('div');
            this.botInserter.className = 'absolute left-0 right-0 h-3 group-hover/inserter:h-6 transition-all duration-300 delay-0 group-hover/inserter:delay-250 flex items-center justify-center group/inserter cursor-pointer z-10 w-4/5 mx-auto';
            this.botInserter.style.top = 'calc(100% + 6px)';
            this.botInserter.style.transform = 'translateY(-50%)';
            this.botInserter.title = `Add cell below`;
            this.botInserter.innerHTML = `
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center"><div class="h-px w-full bg-transparent group-hover/inserter:bg-blue-400 transition-colors"></div></div>
                <div class="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white shadow-sm opacity-0 group-hover/inserter:opacity-100 transition-opacity duration-300 delay-0 group-hover/inserter:delay-250 mx-auto border-2 border-white">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg>
                </div>
            `;
            this.botInserter.onclick = () => this.dispatchAction('cell-insert-below');
            if (this.cellType !== 'code') this.appendChild(this.botInserter);
        }
    }

    mountContent(container) { /* abstract */ }
    handleActionClick() { /* abstract */ }
    refresh() { /* abstract */ }

    updateActionButton(config) {
        if (this.actionBtnElement && config) {
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
        return { id: this.cellId, type: this.cellType, content: this.content, isLocked: this.isLocked }; 
    }
}
window.BaseNotebookCell = BaseNotebookCell;

class NotebookCore {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        
        // Centralize all default configurations here
        const defaultConfig = {
            isReadOnly: false,
            defaultCellType: 'code',
            kernelType: 'pyodide', // Choose 'pyodide' or 'skulpt'
            maxOutputChars: 50000, // Failsafe for infinite print loops
            disableInsertAll: false,
            disableInsertTop: false,
            outputCurtailThresholdLines: 40,
            outputCurtailShowLines: 10,
            outputLineHeightPx: 21,
            autoClearOutputOnEdit: true,
            showTopBar: false,
            layout: 'inline'
        };
        
        this.options = { ...defaultConfig, ...options };
        this.isReadOnly = this.options.isReadOnly;
        this.defaultCellType = this.options.defaultCellType;

        const topInserter = document.getElementById('top-inserter');
        if (topInserter) {
            if (this.isReadOnly || this.options.disableInsertAll || this.options.disableInsertTop) {
                topInserter.style.display = 'none';
            } else {
                topInserter.style.display = 'flex';
                topInserter.onclick = () => this.addCell(this.defaultCellType, 0);
            }
        }
        
        if (this.options.kernelType === 'skulpt') {
            this.kernel = new SkulptKernel(this.options.maxOutputChars);
        } else {
            this.kernel = new PyodideKernel(this.options.maxOutputChars);
        }
        
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
            if (this.isReadOnly || this.options.disableInsertAll) return;
            const el = e.target;
            const newCell = this.createCellElement({ type: 'code', content: '' });
            el.insertAdjacentElement('afterend', newCell);
            this.syncToServer();
            setTimeout(() => newCell.focusCell(), 50);
        });

        this.container.addEventListener('cell-type-changed', (e) => {
            if (this.isReadOnly) return;
            const oldEl = e.target;
            if (oldEl.isLocked) return;

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
        if (!el) return;
        if (status === 'loading') el.innerHTML = `Loading Kernel... <span class="w-3 h-3 ml-1 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block"></span>`;
        else if (status === 'loading-packages') el.innerHTML = `Loading Packages...`;
        else if (status === 'ready') el.innerHTML = `<span class="h-2 w-2 rounded-full bg-green-500 inline-block mr-1"></span> Ready <span class="ml-1 text-[9px] opacity-60">(${this.options.kernelType})</span>`;
        else el.innerHTML = `<span class="h-2 w-2 rounded-full bg-red-500 inline-block mr-1"></span> Error`;
    }

    async restartKernel() {
        if (this.isReadOnly) return;
        this.updateKernelStatus('loading');
        
        // Clear all cell outputs immediately
        Array.from(this.container.children).forEach(cell => {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell' && cell.clearOutput) {
                cell.clearOutput();
                cell.updateKernelUIState(false);
            }
        });

        if (this.options.kernelType === 'skulpt') {
            this.kernel = new SkulptKernel(this.options.maxOutputChars);
        } else {
            this.kernel = new PyodideKernel(this.options.maxOutputChars);
        }
        await this.kernel.init((status) => this.updateKernelStatus(status));
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
        if (data.isLocked) cell.setAttribute('is-locked', '');
        return cell;
    }

    addCell(type = 'code', index = 0) {
        if (this.isReadOnly || this.options.disableInsertAll) return;
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
            filter: '[is-locked]', 
            onEnd: () => {
                const cells = Array.from(this.container.children);
                cells.forEach(cell => { if(cell.refresh) cell.refresh(); }); 
                this.syncToServer();
            },
        });
    }

    serializeToFlat() {
        let out = '';
        Array.from(this.container.children).forEach(cell => {
            const data = cell.toJSON();
            const type = data.type;
            const meta = data.isLocked ? ` {"locked": true}` : '';
            
            if (type === 'code') {
                const langMeta = data.isLocked ? ` {"locked": true, "lang": "python"}` : ` {"lang": "python"}`;
                out += `# %% [code]${langMeta}\n${data.content}\n\n`;
            } else {
                out += `# %% [${type}]${meta}\n"""\n${data.content}\n"""\n\n`;
            }
        });
        return out.trim();
    }

    deserializeFromFlat(payload) {
        if (!payload || !payload.includes('# %%')) {
            return [{ type: 'code', content: payload || '' }];
        }
        
        const cells = [];
        const chunks = payload.split(/# %%\s*\[(?<type>[a-zA-Z]+)\]\s*(?<meta>{.*?})?\s*\n/g);
        
        for (let i = 1; i < chunks.length; i += 3) {
            const type = chunks[i];
            const metaStr = chunks[i+1];
            let content = chunks[i+2] || '';
            
            let isLocked = false;
            if (metaStr) {
                try {
                    const metaObj = JSON.parse(metaStr.replace(/'/g, '"'));
                    if (metaObj.locked) isLocked = true;
                } catch(e) { console.warn("Failed to parse metadata", metaStr); }
            }
            
            content = content.replace(/\r\n/g, '\n');
            if (type === 'markdown' || type === 'text') {
                content = content.replace(/^"""\n?/, '').replace(/\n?"""\s*$/, '');
            }
            content = content.replace(/\n+$/, ''); 
            
            cells.push({ type, content, isLocked, isEditing: false });
        }
        
        return cells.length ? cells : [{ type: 'code', content: payload }];
    }

    toJSON() { return Array.from(this.container.children).map(c => c.toJSON()); }

    syncToServer() {
        if (typeof window.triggerHostSync === 'function') {
            window.triggerHostSync(this.serializeToFlat());
        }
    }
}
window.NotebookCore = NotebookCore;
