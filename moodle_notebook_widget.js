/**
 * Moodle Vanilla Python Notebook Widget
 * 
 * Usage in Moodle HTML Editor:
 * <div id="moodle-notebook-mount"></div>
 * <script type="module">
 *   import { PythonNotebook } from 'https://your-domain.com/moodle_notebook.js';
 *   new PythonNotebook('moodle-notebook-mount');
 * </script>
 */

export class PythonNotebook {
    constructor(mountId) {
        this.mountPoint = document.getElementById(mountId);
        if (!this.mountPoint) {
            console.error(`Notebook mount point #${mountId} not found.`);
            return;
        }

        // State variables encapsulated within the class
        this.pyodideInstance = null;
        this.currentOutputTarget = null;
        this.cellCounter = 0;
        this.draggedCell = null;

        // Start the boot sequence
        this.init();
    }

    async init() {
        this.renderSkeleton();
        
        try {
            await this.loadDependencies();
            this.injectStyles();
            this.renderBaseUI();
            this.attachGlobalEvents();
            await this.initEngine();
        } catch (error) {
            this.updateStatus('Failed to load dependencies', 'red');
            console.error("Notebook initialization error:", error);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    loadStylesheet(href) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`link[href="${href}"]`)) return resolve();
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    async loadDependencies() {
        // 1. Configure Tailwind Isolation BEFORE loading it
        if (!window.tailwind) {
            window.tailwind = {
                config: {
                    corePlugins: { preflight: false },
                    important: '#python-notebook-app'
                }
            };
        }

        // 2. Configure MathJax BEFORE loading it
        if (!window.MathJax) {
            window.MathJax = {
                tex: {
                    inlineMath: [['$', '$'], ['\\(', '\\)']],
                    displayMath: [['$$', '$$'], ['\\[', '\\]']]
                },
                startup: { typeset: false } 
            };
        }

        // 3. Load all CSS
        await Promise.all([
            this.loadStylesheet('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.css'),
            this.loadStylesheet('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/monokai.min.css')
        ]);

        // 4. Load core JS sequentially where order matters, and parallel where it doesn't
        await this.loadScript('https://cdn.tailwindcss.com');
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.js');
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/python/python.min.js');
        
        await Promise.all([
            this.loadScript('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js'),
            this.loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
            this.loadScript('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js')
        ]);
    }

    injectStyles() {
        if (document.getElementById('python-notebook-custom-styles')) return;

        const css = `
            #python-notebook-app {
                background-color: transparent;
                font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                line-height: 1.5;
                box-sizing: border-box;
            }
            #python-notebook-app *, #python-notebook-app *::before, #python-notebook-app *::after {
                box-sizing: border-box;
            }
            
            #python-notebook-app .CodeMirror {
                height: auto;
                min-height: 50px;
                border-radius: 0.375rem;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
                font-size: 14px;
                text-align: left;
            }
            #python-notebook-app .CodeMirror-scroll { min-height: 50px; }
            
            #python-notebook-app .markdown-body { color: #1f2937; }
            #python-notebook-app .markdown-body h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; line-height: 1.25; }
            #python-notebook-app .markdown-body h2 { font-size: 1.25em; font-weight: bold; margin-bottom: 0.5em; line-height: 1.25; }
            #python-notebook-app .markdown-body p { margin-bottom: 0.75em; }
            #python-notebook-app .markdown-body code { background: #e5e7eb; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace;}
            #python-notebook-app .markdown-body pre code { background: none; padding: 0; }
            #python-notebook-app .markdown-body pre { background: #1f2937; color: white; padding: 1em; border-radius: 0.375rem; overflow-x: auto; margin-bottom: 0.75em;}
            
            #python-notebook-app .drop-target-above .cell-content-wrapper { border-top: 3px solid #3b82f6 !important; border-top-left-radius: 0; border-top-right-radius: 0; }
            #python-notebook-app .drop-target-below .cell-content-wrapper { border-bottom: 3px solid #3b82f6 !important; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
            #python-notebook-app .cell-dragging { opacity: 0.4; }
            
            #custom-context-menu { font-family: inherit; }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.id = 'python-notebook-custom-styles';
        styleSheet.type = "text/css";
        styleSheet.innerText = css;
        document.head.appendChild(styleSheet);
    }

    renderSkeleton() {
        this.mountPoint.innerHTML = `
            <div id="python-notebook-app" class="text-gray-800 antialiased p-4 md:p-8 rounded border border-gray-200 bg-gray-50">
                <div class="flex items-center justify-center p-8 text-gray-500">
                    <svg class="animate-spin mr-3 h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Loading Environment...
                </div>
            </div>
        `;
    }

    renderBaseUI() {
        // Build the isolated container with the exact structure expected by our CSS and Tailwind config
        this.mountPoint.innerHTML = `
            <div id="python-notebook-app" class="text-gray-800 antialiased p-4 md:p-8 border border-gray-200 rounded bg-white shadow-sm">
                <div class="max-w-4xl mx-auto">
                    
                    <!-- Header & Status -->
                    <div class="flex items-center justify-between mb-6">
                        <h1 class="text-2xl font-bold text-gray-800">Python Notebook</h1>
                        <div id="status-indicator" class="flex items-center text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Booting Pyodide...
                        </div>
                    </div>
                    
                    <!-- Action Toolbar -->
                    <div class="flex gap-2 mb-6">
                        <button id="btn-add-code" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium transition-colors">
                            + Add Code
                        </button>
                        <button id="btn-add-text" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded shadow-sm text-sm font-medium transition-colors">
                            + Add Text
                        </button>
                    </div>

                    <!-- Notebook Cells Container -->
                    <div id="notebook-container" class="flex flex-col gap-4">
                        <!-- Cells will be dynamically injected here -->
                    </div>
                </div>
            </div>
        `;

        // Bind main UI buttons
        this.mountPoint.querySelector('#btn-add-code').addEventListener('click', () => this.addCodeCell());
        this.mountPoint.querySelector('#btn-add-text').addEventListener('click', () => this.addMarkdownCell());
        
        this.initContextMenu();
    }

    async initEngine() {
        try {
            this.pyodideInstance = await loadPyodide({
                stdout: (text) => {
                    if (this.currentOutputTarget) {
                        this.currentOutputTarget.textContent += text + "\n";
                    }
                },
                stderr: (text) => {
                    if (this.currentOutputTarget) {
                        this.currentOutputTarget.textContent += text + "\n";
                    }
                }
            });

            this.updateStatus('Python Ready', 'emerald');
            
            // Note: Template loading removed as requested. Starts with an empty space.

        } catch (err) {
            this.updateStatus('Failed to load Python Engine', 'red');
            console.error("Pyodide init error:", err);
        }
    }

    updateStatus(message, color) {
        const indicator = this.mountPoint.querySelector('#status-indicator');
        if (!indicator) return;

        indicator.className = `flex items-center text-sm font-semibold text-${color}-700 bg-${color}-50 px-3 py-1.5 rounded-full border border-${color}-200`;
        
        if (color === 'emerald') {
            indicator.innerHTML = `<svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> ${message}`;
        } else if (color === 'red') {
            indicator.innerHTML = `<svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> ${message}`;
        }
    }

    createCellWrapper(cellId) {
        const wrapper = document.createElement('div');
        wrapper.id = `cell-wrapper-${cellId}`;
        wrapper.className = "flex items-stretch group transition-all duration-200 cell-wrapper";
        
        const handleContainer = document.createElement('div');
        handleContainer.className = "pt-4 pr-1 w-8 flex items-start justify-center cursor-grab text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity drag-handle";
        handleContainer.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`;
        
        handleContainer.onmousedown = () => wrapper.setAttribute('draggable', 'true');
        handleContainer.onmouseup = () => wrapper.setAttribute('draggable', 'false');
        handleContainer.onmouseleave = () => wrapper.setAttribute('draggable', 'false');

        wrapper.addEventListener('dragstart', (e) => {
            this.draggedCell = wrapper;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => wrapper.classList.add('cell-dragging'), 0);
        });

        wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const bounding = wrapper.getBoundingClientRect();
            const offset = bounding.y + (bounding.height / 2);
            if (e.clientY - offset > 0) {
                wrapper.classList.add('drop-target-below');
                wrapper.classList.remove('drop-target-above');
            } else {
                wrapper.classList.add('drop-target-above');
                wrapper.classList.remove('drop-target-below');
            }
            return false;
        });

        wrapper.addEventListener('dragleave', () => {
            wrapper.classList.remove('drop-target-above', 'drop-target-below');
        });

        wrapper.addEventListener('drop', (e) => {
            e.stopPropagation();
            wrapper.classList.remove('drop-target-above', 'drop-target-below');
            if (this.draggedCell && this.draggedCell !== wrapper) {
                const bounding = wrapper.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);
                if (e.clientY - offset > 0) {
                    wrapper.parentNode.insertBefore(this.draggedCell, wrapper.nextSibling);
                } else {
                    wrapper.parentNode.insertBefore(this.draggedCell, wrapper);
                }
            }
            return false;
        });

        wrapper.addEventListener('dragend', () => {
            wrapper.classList.remove('cell-dragging');
            wrapper.setAttribute('draggable', 'false');
            this.mountPoint.querySelectorAll('.cell-wrapper').forEach(c => c.classList.remove('drop-target-above', 'drop-target-below'));
        });

        const contentWrapper = document.createElement('div');
        contentWrapper.className = "flex-1 relative bg-white rounded-lg shadow-sm border border-gray-200 p-1 cell-content-wrapper transition-all duration-200";
        
        wrapper.appendChild(handleContainer);
        wrapper.appendChild(contentWrapper);
        
        return { wrapper, contentWrapper };
    }

    createToolbar(cellId, isMarkdown = false) {
        const toolbar = document.createElement('div');
        toolbar.className = "absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10";
        
        if (isMarkdown) {
            const editBtn = document.createElement('button');
            editBtn.innerHTML = "Edit";
            editBtn.className = "text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-300";
            editBtn.onclick = () => this.toggleMarkdownMode(cellId);
            toolbar.appendChild(editBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.innerHTML = "Delete";
        delBtn.className = "text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200";
        delBtn.onclick = () => this.mountPoint.querySelector(`#cell-wrapper-${cellId}`).remove();
        toolbar.appendChild(delBtn);

        return toolbar;
    }

    addCodeCell(initialCode = "", insertAfter = null) {
        const id = ++this.cellCounter;
        const { wrapper, contentWrapper } = this.createCellWrapper(id);
        contentWrapper.appendChild(this.createToolbar(id));

        const container = document.createElement('div');
        container.className = "p-3 pl-12 relative border-l-4 border-blue-400";
        
        const playBtn = document.createElement('button');
        playBtn.className = "absolute left-2 top-4 text-gray-400 hover:text-green-600 transition-colors bg-white rounded-full focus:outline-none";
        playBtn.innerHTML = `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>`;
        
        const editorDiv = document.createElement('div');
        editorDiv.className = "border border-gray-300 rounded overflow-hidden";
        
        const outputDiv = document.createElement('div');
        outputDiv.id = `output-${id}`;
        outputDiv.className = "hidden mt-2 p-3 bg-gray-50 rounded border border-gray-200 font-mono text-sm whitespace-pre-wrap text-gray-800";

        container.appendChild(playBtn);
        container.appendChild(editorDiv);
        container.appendChild(outputDiv);
        contentWrapper.appendChild(container); 

        const notebookContainer = this.mountPoint.querySelector('#notebook-container');
        if (insertAfter) {
            insertAfter.parentNode.insertBefore(wrapper, insertAfter.nextSibling);
        } else {
            notebookContainer.appendChild(wrapper);
        }

        const editor = CodeMirror(editorDiv, {
            value: initialCode,
            mode: "python",
            theme: "default", 
            lineNumbers: true,
            viewportMargin: Infinity,
            extraKeys: {
                "Shift-Enter": (cm) => playBtn.click()
            }
        });

        editor.on("contextmenu", (cm, e) => {
            e.preventDefault();
            this.showContextMenu(e, id, 'code', cm, wrapper);
        });

        playBtn.onclick = async () => {
            if (!this.pyodideInstance) {
                alert("Please wait for Python to load first.");
                return;
            }
            const code = editor.getValue();
            await this.runPythonCode(code, outputDiv);
        };
    }

    async runPythonCode(code, outputDiv) {
        outputDiv.innerHTML = '';
        outputDiv.className = "mt-2 p-3 bg-gray-50 rounded border border-gray-200 font-mono text-sm whitespace-pre-wrap text-gray-800";
        this.currentOutputTarget = outputDiv;
        
        try {
            let result = await this.pyodideInstance.runPythonAsync(code);
            if (result !== undefined && result !== null) {
                outputDiv.textContent += result + '\n';
            }
            if (outputDiv.textContent.trim() !== '') {
                outputDiv.classList.remove('hidden');
            } else {
                outputDiv.classList.add('hidden');
            }
        } catch (err) {
            outputDiv.classList.remove('hidden');
            outputDiv.className = "mt-2 p-3 bg-red-50 rounded border border-red-200 font-mono text-sm whitespace-pre-wrap text-red-700";
            
            let errStr = err.toString();
            const pyTracebackSplit = errStr.indexOf('Traceback (most recent call last)');
            if(pyTracebackSplit !== -1){
                 errStr = errStr.substring(pyTracebackSplit);
            }
            outputDiv.textContent = errStr;
        }
        
        this.currentOutputTarget = null;
    }

    addMarkdownCell(initialText = "Double-click to edit markdown...", forceEdit = false, insertAfter = null) {
        const id = ++this.cellCounter;
        const { wrapper, contentWrapper } = this.createCellWrapper(id);
        contentWrapper.appendChild(this.createToolbar(id, true));

        const container = document.createElement('div');
        container.className = "p-4 border-l-4 border-gray-200";

        const editorDiv = document.createElement('div');
        editorDiv.className = "hidden";
        
        const textarea = document.createElement('textarea');
        textarea.id = `md-input-${id}`;
        textarea.className = "w-full p-2 border border-gray-300 rounded font-mono text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-400";
        textarea.value = initialText;
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                this.toggleMarkdownMode(id, false);
            }
        });

        textarea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, id, 'markdown', textarea, wrapper);
        });
        
        const renderDiv = document.createElement('div');
        renderDiv.id = `md-render-${id}`;
        renderDiv.className = "markdown-body min-h-[2rem] cursor-text";
        renderDiv.innerHTML = marked.parse(initialText);
        this.renderMathJax(renderDiv);

        renderDiv.ondblclick = () => this.toggleMarkdownMode(id, true);
        textarea.onblur = () => this.toggleMarkdownMode(id, false);

        editorDiv.appendChild(textarea);
        container.appendChild(editorDiv);
        container.appendChild(renderDiv);
        contentWrapper.appendChild(container); 

        const notebookContainer = this.mountPoint.querySelector('#notebook-container');
        if (insertAfter) {
            insertAfter.parentNode.insertBefore(wrapper, insertAfter.nextSibling);
        } else {
            notebookContainer.appendChild(wrapper);
        }

        if (forceEdit) {
            this.toggleMarkdownMode(id, true);
        }
    }

    renderMathJax(element) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]).catch((err) => console.error('MathJax error:', err));
        }
    }

    toggleMarkdownMode(cellId, forceEdit = null) {
        const textarea = this.mountPoint.querySelector(`#md-input-${cellId}`);
        const renderDiv = this.mountPoint.querySelector(`#md-render-${cellId}`);
        const editorDiv = textarea.parentElement;

        const isEditing = !editorDiv.classList.contains('hidden');
        const shouldEdit = forceEdit !== null ? forceEdit : !isEditing;

        if (shouldEdit) {
            editorDiv.classList.remove('hidden');
            renderDiv.classList.add('hidden');
            textarea.focus();
        } else {
            editorDiv.classList.add('hidden');
            renderDiv.classList.remove('hidden');
            renderDiv.innerHTML = marked.parse(textarea.value);
            this.renderMathJax(renderDiv);
        }
    }

    initContextMenu() {
        if (document.getElementById('custom-context-menu')) return;

        const menu = document.createElement('div');
        menu.id = 'custom-context-menu';
        menu.className = 'hidden absolute z-50 bg-white border border-gray-200 shadow-lg rounded py-1 text-sm text-gray-700 w-48';
        menu.innerHTML = `<button id="split-cell-btn" class="w-full text-left px-4 py-2 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"></path><path d="M3 15v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"></path><line x1="2" y1="12" x2="22" y2="12"></line></svg>
            Split Cell
        </button>`;
        document.body.appendChild(menu);

        this.contextMenu = menu;
    }

    attachGlobalEvents() {
        document.addEventListener('click', () => {
            if (this.contextMenu) {
                this.contextMenu.classList.add('hidden');
            }
        });
    }

    showContextMenu(e, cellId, type, editorInstance, wrapper) {
        this.contextMenu.style.left = `${e.pageX}px`;
        this.contextMenu.style.top = `${e.pageY}px`;
        this.contextMenu.classList.remove('hidden');

        const splitBtn = document.getElementById('split-cell-btn');
        splitBtn.onclick = (event) => {
            event.stopPropagation();
            this.contextMenu.classList.add('hidden');
            if (type === 'code') {
                this.splitCodeCell(cellId, editorInstance, wrapper);
            } else if (type === 'markdown') {
                this.splitMarkdownCell(cellId, editorInstance, wrapper);
            }
        };
    }

    splitCodeCell(cellId, cm, wrapper) {
        const doc = cm.getDoc();
        const cursor = doc.getCursor();
        const valBefore = doc.getRange({line: 0, ch: 0}, cursor);
        const valAfter = doc.getRange(cursor, {line: doc.lineCount(), ch: 0});
        
        cm.setValue(valBefore);
        this.addCodeCell(valAfter, wrapper);
    }

    splitMarkdownCell(cellId, textarea, wrapper) {
        const val = textarea.value;
        const pos = textarea.selectionStart;
        
        const valBefore = val.substring(0, pos);
        const valAfter = val.substring(pos);
        
        textarea.value = valBefore;
        this.toggleMarkdownMode(cellId, false);
        this.addMarkdownCell(valAfter, true, wrapper);
    }
}