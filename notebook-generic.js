window.MathJaxHelper = {
    queue: function(el, onComplete, retries = 0) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([el]).then(() => {
                if (onComplete) onComplete();
            }).catch(err => console.warn("MathJax error:", err));
        } else if (retries < 10) {
            setTimeout(() => this.queue(el, onComplete, retries + 1), 300);
        } else {
            console.warn("MathJax unavailable; skipping LaTeX typesetting.");
            if (onComplete) onComplete();
        }
    }
};

class PyodideWorkerKernel {
    constructor(options = {}) {
        this.isReady = false;
        this.worker = null;
        this.callbacks = {}; 
        this.targetDivs = {}; 
        this.currentOutputCounts = {};
        
        this.options = options;
        this.widgetId = options.widgetId || Math.random().toString(36).substring(2, 10);
        this.maxOutputChars = options.maxOutputChars || 50000;
        this.kernelMode = options.kernelMode || 'local'; 
    }

async init(statusCallback) {
        statusCallback('loading');
        
        try {
            // Wait for the Pyodide script to physically load in the DOM
            if (typeof loadPyodide === 'undefined') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
                    script.onload = resolve;
                    script.onerror = () => reject(new Error("Failed to load Pyodide CDN"));
                    document.head.appendChild(script);
                });
            }

            // Script is loaded, initialize the Pyodide environment
            this.pyodide = await loadPyodide({
                stdout: (text) => this.writeOutput(text, 'text-slate-700'),
                stderr: (text) => this.writeOutput(text, 'text-red-600')
            });
            
            statusCallback('packages');
            await this.pyodide.loadPackage(['micropip']);
            
            this.isReady = true;
            statusCallback('ready');
            
        } catch (err) {
            console.error("Pyodide Initialization Error:", err);
            statusCallback('error');
        }
    }

    generateId() { return Math.random().toString(36).substring(2, 10); }

    writeOutput(id, text, classes) {
        const targetDiv = this.targetDivs[id];
        if (!targetDiv) return;
        
        this.currentOutputCounts[id] = (this.currentOutputCounts[id] || 0) + text.length;
        if (this.currentOutputCounts[id] > this.maxOutputChars) {
            if (this.currentOutputCounts[id] - text.length <= this.maxOutputChars) {
                const span = document.createElement('span');
                span.className = 'text-red-500 font-bold block mt-2';
                span.innerText = `[Error: Output exceeded maximum limit of ${this.maxOutputChars} characters]`;
                targetDiv.appendChild(span);
            }
            return;
        }

        const span = document.createElement('span');
        span.className = classes;
        span.innerText = text + "\n";
        targetDiv.appendChild(span);
    }

    injectSvg(id, svgData) {
        const targetDiv = this.targetDivs[id];
        if (!targetDiv) return;
        
        const wrap = document.createElement('div');
        wrap.className = 'inline-block bg-white my-2 p-2 rounded shadow-sm border border-slate-200'; 
        wrap.innerHTML = svgData;
        const svgEl = wrap.querySelector('svg');
        if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
        targetDiv.appendChild(wrap);
    }

    handleMessage(msg) {
        const { id, type, status, text, error, data } = msg;

        if (type === 'status') {
            if (status === 'ready') this.isReady = true;
            if (status === 'error') this.isReady = false;
            
            if (this.statusCallback) this.statusCallback(status);
            
            if (status === 'ready' && this.callbacks[id]) {
                this.callbacks[id].resolve();
                delete this.callbacks[id];
            }
            return;
        }

        if (type === 'stdout') this.writeOutput(id, text, 'text-slate-700');
        if (type === 'stderr') this.writeOutput(id, text, 'text-red-500 font-semibold');
        if (type === 'svg') this.injectSvg(id, data);
        
        if (type === 'result') {
            const targetDiv = this.targetDivs[id];
            if (targetDiv) {
                const outWrap = document.createElement('div');
                outWrap.className = 'mt-1 font-mono text-sm text-slate-800';
                outWrap.innerText = text;
                targetDiv.appendChild(outWrap);
            }
        }

        if (type === 'success' || type === 'error') {
            if (this.callbacks[id]) {
                if (type === 'error') this.callbacks[id].reject(error);
                else this.callbacks[id].resolve();
                
                delete this.callbacks[id];
                delete this.targetDivs[id];
                delete this.currentOutputCounts[id];
            }
        }
    }

    execute(code, targetDiv) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) return reject("Kernel is not ready yet.");
            const execId = this.generateId();
            this.callbacks[execId] = { resolve, reject };
            this.targetDivs[execId] = targetDiv;
            this.currentOutputCounts[execId] = 0;
            this.worker.postMessage({ id: execId, widgetId: this.widgetId, action: 'EXECUTE', code: code, config: this.options });
        });
    }

    destroy() {
        if (this.worker && typeof this.worker.terminate === 'function') this.worker.terminate();
        this.isReady = false;
    }
}

// --- NEW: SKULPT KERNEL ADAPTER ---
class SkulptKernel {
    constructor(options = {}) {
        this.isReady = false;
        this.currentOutputDiv = null;
        this.maxOutputChars = options.maxOutputChars || 50000;
        this.currentOutputCount = 0;
        this.isKilled = false;
    }

    async init(statusCallback) {
        statusCallback('loading');
        
        if (typeof Sk === 'undefined') {
            statusCallback('packages');
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
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    writeOutput(text, classes) {
        if (!this.currentOutputDiv) return;
        this.currentOutputCount += text.length;
        if (this.currentOutputCount > this.maxOutputChars) {
            this.isKilled = true;
            throw new Error(`Output limit exceeded`);
        }
        const span = document.createElement('span');
        span.className = classes;
        span.innerText = text; 
        this.currentOutputDiv.appendChild(span);
    }

    async execute(code, targetDiv) {
        this.currentOutputDiv = targetDiv;
        this.currentOutputCount = 0;
        this.isKilled = false;

        Sk.configure({
            output: (text) => this.writeOutput(text, 'text-slate-700'),
            read: (x) => {
                if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
                return Sk.builtinFiles["files"][x];
            },
            __future__: Sk.python3,
            execLimit: 5000, 
            yieldLimit: 100,
            timeoutMsg: () => "Execution stopped: Time limit (5s) exceeded."
        });

        // --- NEW: Skulpt Expression Evaluator ---
        let executableCode = code;
        const lines = code.trimEnd().split('\n');
        
        if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            
            // Heuristic: Is it a top-level line? Does it lack assignments? Is it not a keyword?
            const sanitized = lastLine.replace(/(==|!=|<=|>=)/g, '  ');
            const hasAssignment = sanitized.includes('=');
            const isKeyword = /^(import|from|def|class|if|elif|else|for|while|try|except|finally|with|assert|pass|return|break|continue|yield|del|raise|global|nonlocal|print)\b/.test(lastLine.trim());

            if (lastLine && !/^\s/.test(lastLine) && !hasAssignment && !isKeyword) {
                // Wrap the expression safely. If eval() fails, it falls back to native execution.
                lines[lines.length - 1] = `
try:
    __skulpt_res = eval(${JSON.stringify(lastLine)})
    if __skulpt_res is not None:
        print(repr(__skulpt_res))
except BaseException:
    ${lastLine}
`.trim();
                executableCode = lines.join('\n');
            }
        }

        try {
            await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, executableCode, true));
        } catch (err) {
            if (this.isKilled) throw new Error(`Execution stopped: Output exceeded maximum limit.`);
            throw new Error(err.toString().replace(/<stdin>/g, "line"));
        } finally {
            this.currentOutputDiv = null;
        }
    }

    destroy() {
        this.isReady = false;
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
        // --- NEW: Grab the disableMove flag ---
        const disableMove = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableMove;

        if (this.isLocked || isReadOnlyGlobal) {
            this.mainBox.classList.add('bg-slate-50');
        }

        // --- UPDATED: Hide the drag handle if movement is disabled ---
        if (!this.isLocked && !isReadOnlyGlobal && !disableMove) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-600 group-hover/cell:bg-blue-400 cursor-grab z-30 rounded-l-md opacity-0 group-hover/cell:opacity-100 transition-all';
            this.mainBox.appendChild(dragHandle);
        }

        this.contentArea = document.createElement('div');
        this.contentArea.className = 'flex-1 relative flex flex-col min-w-0 p-0 box-border min-h-0';
        
        const disableTypeChange = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableTypeChange;
        const disableDelete = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableDelete;

        if (!this.isLocked && !isReadOnlyGlobal) {
            const toolbar = document.createElement('div');
            toolbar.className = 'cell-toolbar absolute z-40 flex items-center gap-1 bg-white/95 backdrop-blur-sm shadow-sm border border-slate-200 rounded-md px-1.5 py-0.5 opacity-0 group-hover/cell:opacity-100 transition-all text-xs';

            if (!disableTypeChange) {
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
            }

            if (!disableDelete) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors ml-0.5 pl-1';
                if (!disableTypeChange) deleteBtn.classList.add('border-l', 'border-slate-200');
                deleteBtn.title = 'delete cell';
                deleteBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
                deleteBtn.onclick = () => this.dispatchAction('cell-deleted');
                toolbar.appendChild(deleteBtn);
            }

            // Only append the toolbar container if it actually has tools inside it!
            if (!disableTypeChange || !disableDelete) {
                this.contentArea.appendChild(toolbar);
            }
        }

        this.actionBtnElement = document.createElement('button');
        this.actionBtnElement.className = 'cell-action-btn absolute z-30 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md transition-all opacity-0 hidden group-hover/cell:opacity-100';
        this.actionBtnElement.onclick = () => this.handleActionClick();
        this.contentArea.appendChild(this.actionBtnElement);

        this.mainBox.appendChild(this.contentArea);
        this.appendChild(this.mainBox);

        const disableInsert = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableInsertAll;
        if (!isReadOnlyGlobal && !disableInsert) {
            this.botInserter = document.createElement('div');
            this.botInserter.className = 'absolute left-0 right-0 h-3 group-hover/inserter:h-6 transition-all duration-300 delay-0 group-hover/inserter:delay-250 flex items-center justify-center group/inserter cursor-pointer z-10 w-4/5 mx-auto';
            this.botInserter.style.top = 'calc(100% + 6px)';
            this.botInserter.style.transform = 'translateY(-50%)';
            this.botInserter.title = `Add cell below`;
            this.botInserter.innerHTML = `
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center"><div class="h-px w-full bg-transparent group-hover/inserter:bg-blue-400 transition-colors"></div></div>
                <div class="relative z-10 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md opacity-0 group-hover/inserter:opacity-100 transition-all duration-300 delay-0 group-hover/inserter:delay-250 mx-auto">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg>
                </div>
            `;
            this.botInserter.onclick = () => this.dispatchAction('cell-insert-below');
            if (this.cellType !== 'code') this.appendChild(this.botInserter);
        }
    }

    mountContent(container) {}
    handleActionClick() {}
    refresh() {}

    updateActionButton(config) {
        if (!this.actionBtnElement) return;
        if (config) {
            this.actionBtnElement.classList.remove('hidden');
            this.actionBtnElement.title = config.title;
            this.actionBtnElement.innerHTML = config.icon;
        } else {
            this.actionBtnElement.classList.add('hidden');
        }
    }

    setButtonState(state) {
        if (!this.actionBtnElement) return;
        const config = this.getActionButtonConfig();
        if (state === 'running') {
            this.actionBtnElement.innerHTML = `<span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>`;
        } else if (state === 'success') {
            this.actionBtnElement.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
        } else if (config) {
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
        
        const defaultConfig = {
            widgetId: Math.random().toString(36).substring(2, 10),
            isReadOnly: false,
            questionMode: false, // <-- NEW Macro Flag
            defaultCellType: 'code',
            kernelType: 'pyodide', 
            kernelMode: 'local',   
            preloadMatplotlib: true,
            maxOutputChars: 50000, 
            enableTracing: true,       
            maxRuntime: 15.0,          
            disableInsertAll: false,
            disableInsertTop: false,
            disableDelete: false,
            disableMove: false,  // <-- NEW Flag
            outputCurtailThresholdLines: 40,
            outputCurtailShowLines: 10,
            outputLineHeightPx: 21,
            autoClearOutputOnEdit: true,
            showTopBar: false,
            lockAllMarkdown: false,
            disableTypeChange: false,
            layout: 'inline',
            autocompleteMode: 'custom'
        };

        // --- NEW: The Question Mode Macro ---
        // If questionMode is requested, we rewrite the defaults to be strict.
        if (options.questionMode) {
            defaultConfig.lockAllMarkdown = true;
            defaultConfig.disableMove = true;
            defaultConfig.disableDelete = true;
            defaultConfig.disableTypeChange = true;
            defaultConfig.disableInsertAll = true;
            defaultConfig.disableInsertTop = true;
        }
        
        // Merge the incoming options OVER the new defaults. 
        // This allows a user to specify {"questionMode": true, "disableInsertAll": false} 
        // and successfully override the strict default!
        this.options = { ...defaultConfig, ...options };
        
        this.isReadOnly = this.options.isReadOnly;
        this.defaultCellType = this.options.defaultCellType;
        this.activeCodeEditor = null;

        const topInserter = document.getElementById('top-inserter');
        if (topInserter) {
            if (this.isReadOnly || this.options.disableInsertAll || this.options.disableInsertTop) {
                topInserter.style.display = 'none';
            } else {
                topInserter.style.display = 'flex';
                topInserter.onclick = () => this.addCell(this.defaultCellType, 0);
            }
        }
        
        const selector = document.getElementById('kernel-selector');
        if (selector) selector.value = this.options.kernelType;

        this.initKernel();
        this.setupEventListeners();

        document.fonts.ready.then(() => {
            Array.from(this.container.children).forEach(cell => { if (cell.refresh) cell.refresh(); });
            if (typeof sendHeight === 'function') sendHeight();
        });
    }

    // --- NEW: Dynamic Kernel Initialization ---
    initKernel() {
        if (this.options.kernelType === 'skulpt') {
            this.kernel = new SkulptKernel(this.options);
        } else {
            this.kernel = new PyodideWorkerKernel(this.options);
        }
        this.kernel.init((status) => this.updateKernelStatus(status));
    }

    // --- NEW: Live Switcher Logic ---
    switchKernel(newType) {
        if (this.options.kernelType === newType) return;
        this.options.kernelType = newType;
        
        const selector = document.getElementById('kernel-selector');
        if (selector) selector.value = newType;

        this.restartKernel();
    }

    setupEventListeners() {
        this.container.addEventListener('cell-content-changed', () => this.syncToServer());
        this.container.addEventListener('cell-height-changed', () => {
            if (typeof sendHeight === 'function') requestAnimationFrame(sendHeight);
        });
        
        this.container.addEventListener('cell-deleted', (e) => {
            if (this.options.disableDelete) return; // <-- LOGIC SAFEGUARD
            
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
            setTimeout(() => { if (newCell.focusCell) newCell.focusCell(); }, 50);
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
            setTimeout(() => { if (newCell.focusCell) newCell.focusCell(); }, 50);
        });
    }

    updateKernelStatus(status) {
        // Target the internal indicator element inside our new wrapper
        const el = document.getElementById('kernel-status-indicator');
        if (!el) return;

        if (status === 'loading') el.innerHTML = `Loading... <span class="w-3 h-3 ml-1 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block"></span>`;
        else if (status === 'packages') el.innerHTML = `Packages... <span class="w-3 h-3 ml-1 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block"></span>`;
        else if (status === 'ready') el.innerHTML = `<span class="h-2 w-2 rounded-full bg-green-500 inline-block"></span> Ready`;
        else el.innerHTML = `<span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span> Error`;
        
        if (status === 'ready') {
            window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady: true } }));
        }
    }

    async restartKernel() {
        if (this.isReadOnly) return;
        this.updateKernelStatus('loading');
        
        Array.from(this.container.children).forEach(cell => {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell' && cell.clearOutput) {
                cell.clearOutput();
                cell.updateKernelUIState(false);
            }
        });

        if (this.kernel && typeof this.kernel.destroy === 'function') {
            this.kernel.destroy();
        }

        // Re-initialize using the currently selected type
        this.initKernel();
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
        setTimeout(() => { if (newCell.focusCell) newCell.focusCell(); }, 100);
    }

    async runAll() {
        const cells = Array.from(this.container.children);
        for (const cell of cells) {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell') {
                if (cell.refresh) cell.refresh();
                if (cell.handleActionClick) await cell.handleActionClick();
            }
        }
    }

    setupDragAndDrop() {
        // --- UPDATED: Prevent SortableJS from running if disableMove is active ---
        if (this.isReadOnly || this.options.disableMove || this.sortable || typeof Sortable === 'undefined') return;
        
        this.sortable = new Sortable(this.container, {
            handle: '.drag-handle',
            animation: 150,
            filter: '[is-locked]', 
            onEnd: () => {
                const cells = Array.from(this.container.children);
                cells.forEach(cell => { if (cell.refresh) cell.refresh(); }); 
                this.syncToServer();
            },
        });
    }

    serializeToFlat() {
        const cells = this.toJSON();
        return window.NotebookFormatConverter.serializeToFlat(cells);
    }

    deserializeFromFlat(payload) {
        return window.NotebookFormatConverter.deserializeFromFlat(payload, this.options);
    }

    toJSON() { return Array.from(this.container.children).map(c => c.toJSON()); }

    syncToServer() {
        if (typeof window.triggerHostSync === 'function') {
            window.triggerHostSync(this.serializeToFlat());
        }
    }
}
window.NotebookCore = NotebookCore;