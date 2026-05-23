class PythonIdeElement extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
                this.layoutMode = 0; // 0=Vertical, 1=Horizontal, 2=Hidden Output
            }

            connectedCallback() {
                const initialCode = this.textContent.trim();
                this.textContent = '';
                this.render();
                
                // Cache Elements from Shadow DOM
                this.editorComponent = this.shadowRoot.querySelector('python-editor');
                this.outputDiv = this.shadowRoot.querySelector('.py-ide-output');
                this.splitPane = this.shadowRoot.querySelector('.py-ide-split');
                this.runBtn = this.shadowRoot.querySelector('.py-ide-btn-run');
                this.copyBtn = this.shadowRoot.querySelector('.py-ide-btn-copy');
                this.layoutBtn = this.shadowRoot.querySelector('.py-ide-btn-layout');
                this.clearBtn = this.shadowRoot.querySelector('.py-ide-clear');
                this.hideBtn = this.shadowRoot.querySelector('.py-ide-hide-output');
                this.showBtn = this.shadowRoot.querySelector('.py-ide-show-output');
                this.layoutIcon = this.shadowRoot.querySelector('.layout-icon');
                this.safeModeChk = this.shadowRoot.querySelector('.py-ide-safe-mode');
                
                this.leftPane = this.shadowRoot.querySelector('.py-ide-left');
                this.rightPane = this.shadowRoot.querySelector('.py-ide-right');
                this.resizer = this.shadowRoot.querySelector('.py-ide-resizer');

                if (initialCode) {
                    // Wait a tick for child component to finish its own connectedCallback
                    setTimeout(() => this.editorComponent.setCode(initialCode), 0);
                }

                this.bindEvents();
            }

            render() {
                this.shadowRoot.innerHTML = `
                    <style>
                        :host { display: block; background: #1e1e1e; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                        .py-ide-wrapper { display: flex; flex-direction: column; height: 100%; width: 100%; }
                        
                        /* Toolbar */
                        .py-ide-toolbar { height: 40px; background-color: #333333; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; border-bottom: 1px solid #1e1e1e; flex-shrink: 0;}
                        .py-ide-title { font-weight: 600; color: #9cdcfe; font-size: 14px; text-transform: uppercase;}
                        .py-ide-actions { display: flex; gap: 10px; align-items: center; }
                        
                        /* Buttons */
                        .py-ide-btn { background-color: #3c3c3c; color: #ccc; border: none; padding: 5px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold; transition: all 0.2s;}
                        .py-ide-btn:hover { background-color: #4c4c4c; }
                        .py-ide-btn-run { background-color: #0e639c; color: white; }
                        .py-ide-btn-run:hover { background-color: #1177bb; }
                        .py-ide-btn-copy { background-color: #28a745; color: white; }
                        .py-ide-btn-copy:hover { background-color: #2fb94e; }
                        .py-ide-btn-sm { font-size: 10px; padding: 3px 6px; }
                        
                        /* Split Layout */
                        .py-ide-split { display: flex; flex-grow: 1; overflow: hidden; position: relative; }
                        .py-ide-split.vertical-split { flex-direction: row; }
                        .py-ide-split.horizontal-split { flex-direction: column; }
                        
                        .py-ide-left, .py-ide-right { display: flex; flex-direction: column; flex-basis: 50%; min-width: 0; min-height: 0; flex-grow: 1; }
                        
                        .py-ide-right { background-color: #1e1e1e; }
                        .py-ide-panel-header { background-color: #252526; padding: 8px 15px; font-size: 11px; color: #ccc; text-transform: uppercase; border-bottom: 1px solid #333; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
                        
                        /* Resizer */
                        .py-ide-resizer { background-color: #444; flex-shrink: 0; transition: background 0.2s; z-index: 10;}
                        .py-ide-resizer:hover, .py-ide-resizer.active { background-color: #0e639c; }
                        .py-ide-split.vertical-split .py-ide-resizer { width: 8px; height: 100%; cursor: col-resize; border-left: 1px solid #111; border-right: 1px solid #111; }
                        .py-ide-split.horizontal-split .py-ide-resizer { width: 100%; height: 8px; cursor: row-resize; border-top: 1px solid #111; border-bottom: 1px solid #111; }
                        
                        /* Hidden Output Mode */
                        .py-ide-split.output-hidden .py-ide-right { display: none; }
                        .py-ide-split.output-hidden .py-ide-resizer { display: none; }
                        .py-ide-split.output-hidden .py-ide-left { flex-basis: 100%; max-width: 100%; height: 100%; }
                        
                        /* Output text area */
                        .py-ide-output { flex-grow: 1; padding: 15px; font-family: 'Consolas', monospace; font-size: 14px; color: #ccc; overflow-y: auto; white-space: pre-wrap; }
                        
                        /* Encapsulated editor styles */
                        python-editor { flex-grow: 1; display: block; border-radius: 0; }
                    </style>

                    <div class="py-ide-wrapper">
                        <div class="py-ide-toolbar">
                            <div class="py-ide-title">PYTHON IDE</div>
                            <div class="py-ide-actions">
                                <button class="py-ide-btn py-ide-btn-layout" title="Change Layout"><span class="layout-icon">◫</span> Layout</button>
                                <label style="color: #ccc; font-size: 11px; display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" class="py-ide-safe-mode" checked> Safe Mode
                                </label>
                                <button class="py-ide-btn py-ide-btn-run">► Run Code</button>
                                <button class="py-ide-btn py-ide-btn-copy">Copy Code</button>
                            </div>
                        </div>
                        <div class="py-ide-split vertical-split">
                            <div class="py-ide-left">
                                <div class="py-ide-panel-header">
                                    <span>CODE</span>
                                    <button class="py-ide-btn py-ide-btn-sm py-ide-show-output" style="display:none; background-color: #0e639c; color: white;">Show Output</button>
                                </div>
                                <python-editor></python-editor>
                            </div>
                            <div class="py-ide-resizer"></div>
                            <div class="py-ide-right">
                                <div class="py-ide-panel-header">
                                    <span>OUTPUT</span> 
                                    <div style="display:flex; gap: 5px;">
                                        <button class="py-ide-btn py-ide-btn-sm py-ide-clear">Clear</button>
                                        <button class="py-ide-btn py-ide-btn-sm py-ide-hide-output">Hide</button>
                                    </div>
                                </div>
                                <div class="py-ide-output"></div>
                            </div>
                        </div>
                    </div>
                `;
            }

            bindEvents() {
                this.layoutBtn.addEventListener('click', () => this.toggleLayout());
                this.hideBtn.addEventListener('click', () => this.toggleLayout(2));
                this.showBtn.addEventListener('click', () => this.toggleLayout(0));
                this.clearBtn.addEventListener('click', () => { this.outputDiv.innerHTML = ""; });

                // Copy Code
                this.copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(this.editorComponent.getCode())
                        .then(() => {
                            const old = this.copyBtn.innerText;
                            this.copyBtn.innerText = "✓ Copied";
                            setTimeout(() => { this.copyBtn.innerText = old; }, 1500);
                        });
                });

                // --- EVENT DRIVEN ARCHITECTURE: EMIT EVENT INSTEAD OF CALLING RUNNER ---
                this.runBtn.addEventListener('click', () => {
                    if (this.layoutMode === 2) this.toggleLayout(0);
                    // We don't call Skulpt here! We just announce that the user wants to run code.
                    const runEvent = new CustomEvent('run-requested', {
                        detail: { 
                            code: this.editorComponent.getCode(),
                            safeMode: this.safeModeChk.checked 
                        }
                    });
                    this.dispatchEvent(runEvent);
                });

                // Resizer
                let isResizing = false;
                this.resizer.addEventListener('mousedown', (e) => {
                    isResizing = true; this.resizer.classList.add('active');
                    document.body.style.cursor = this.layoutMode === 0 ? 'col-resize' : 'row-resize';
                    e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;
                    const splitRect = this.splitPane.getBoundingClientRect();
                    if (this.layoutMode === 0) { 
                        let percent = ((e.clientX - splitRect.left) / splitRect.width) * 100;
                        this.leftPane.style.flexBasis = Math.max(10, Math.min(90, percent)) + '%';
                        this.rightPane.style.flexBasis = (100 - Math.max(10, Math.min(90, percent))) + '%';
                    } else if (this.layoutMode === 1) { 
                        let percent = ((e.clientY - splitRect.top) / splitRect.height) * 100;
                        this.leftPane.style.flexBasis = Math.max(10, Math.min(90, percent)) + '%';
                        this.rightPane.style.flexBasis = (100 - Math.max(10, Math.min(90, percent))) + '%';
                    }
                });
                document.addEventListener('mouseup', () => {
                    if (isResizing) { isResizing = false; this.resizer.classList.remove('active'); document.body.style.cursor = 'default'; }
                });
            }

            // Expose the output div so external listeners know where to put text
            getOutputTarget() {
                return this.outputDiv;
            }

            toggleLayout(forceMode = -1) {
                this.layoutMode = forceMode !== -1 ? forceMode : (this.layoutMode + 1) % 3;
                this.splitPane.className = "py-ide-split";
                this.leftPane.style.flexBasis = ""; this.rightPane.style.flexBasis = ""; this.showBtn.style.display = "none";
                if (this.layoutMode === 0) { this.splitPane.classList.add("vertical-split"); this.layoutIcon.innerText = "◫"; }
                else if (this.layoutMode === 1) { this.splitPane.classList.add("horizontal-split"); this.layoutIcon.innerText = "☰"; }
                else { this.splitPane.classList.add("output-hidden"); this.layoutIcon.innerText = "□"; this.showBtn.style.display = "inline-flex"; }
            }
        }
        
        customElements.define('python-ide', PythonIdeElement);