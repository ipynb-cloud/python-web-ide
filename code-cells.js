class CodeCellElement extends window.BaseNotebookCell {
    
    connectedCallback() {
        this.output = this.getAttribute('output') || '';
        super.connectedCallback();

        window.addEventListener('kernel-status-changed', this._kernelStatusHandler = (e) => {
            this.updateKernelUIState(e.detail.isReady);
        });
    }

    updateKernelUIState(isReady) {
        if (!this.actionBtnElement) return;
        if (!isReady) {
            this.actionBtnElement.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
            this.actionBtnElement.innerHTML = `<span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>`;
        } else {
            this.actionBtnElement.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
            this.setButtonState('default'); 
        }
    }

    mountContent(container) {
        this.editorWrap = document.createElement('div');
        this.editorWrap.className = `w-full flex-1 flex flex-col min-h-[3.25rem] bg-slate-50/50 rounded-md relative box-border cm-wrapper ${this.isLocked ? 'pointer-events-none opacity-90' : ''}`;
        container.appendChild(this.editorWrap);
        
        this.editorWrap.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.handleActionClick();
            }
        }, true);
        
        this.updateActionButton(this.getActionButtonConfig());

        setTimeout(() => {
            if (typeof cm6 === 'undefined') {
                this.editorWrap.innerHTML = "<div class='p-3 text-red-500 font-bold'>Error: CodeMirror 6 bundle not found.</div>";
                return;
            }

            const customExtensions = [];
            if (typeof cm6.python === 'function') {
                customExtensions.push(cm6.python());
            }

            // Lock the code editor entirely if this cell is locked
            if (this.isLocked) {
                const EditorView = cm6.EditorView || (cm6.view ? cm6.view.EditorView : null);
                if (EditorView && EditorView.editable) customExtensions.push(EditorView.editable.of(false));
                
                const EditorState = cm6.EditorState || (cm6.state ? cm6.state.EditorState : null);
                if (EditorState && EditorState.readOnly) customExtensions.push(EditorState.readOnly.of(true));
            }

            const EditorView = cm6.EditorView || (cm6.view ? cm6.view.EditorView : null);
            if (EditorView && EditorView.updateListener) {
                customExtensions.push(EditorView.updateListener.of((update) => {
                    if (update.focusChanged && update.view.hasFocus) {
                        if (window.notebookCore) window.notebookCore.activeCodeEditor = update.view;
                    }
                    
                    if (update.focusChanged && !update.view.hasFocus) {
                        const newContent = update.view.state.doc.toString();
                        if (this.content !== newContent) {
                            this.content = newContent;
                            this.dispatchAction('cell-content-changed');
                        }
                    }

                    if (update.docChanged || update.geometryChanged) {
                        if (update.docChanged) {
                            this.setButtonState('default');
                            const config = (window.notebookCore && window.notebookCore.options) || {};
                            if (config.autoClearOutputOnEdit && this.output) {
                                this.clearOutput();
                            }
                        }
                        this.dispatchAction('cell-height-changed');
                    }
                }));
            }

            this.editorView = cm6.createEditorView(undefined, this.editorWrap);
            const state = cm6.createEditorState(this.content, { extensions: customExtensions });
            this.editorView.setState(state);

            if (window.notebookCore && window.notebookCore.kernel) {
                this.updateKernelUIState(window.notebookCore.kernel.isReady);
            }

            setTimeout(() => { this.dispatchAction('cell-height-changed'); }, 50);

        }, 0);

        this.buildOutputUI();
        
        this.appendChild(this.outputWrapper); 
        if (this.botInserter) this.appendChild(this.botInserter);
    }

    buildOutputUI() {
        this.outputWrapper = document.createElement('div');
        this.outputWrapper.className = `w-full mt-1 px-3 ${this.output ? 'flex' : 'hidden'} flex-col relative group/output box-border`;

        const outputBox = document.createElement('div');
        outputBox.className = 'w-full bg-white border border-slate-200 border-l-4 border-l-slate-300 rounded-md shadow-sm relative';

        const outHeader = document.createElement('div');
        outHeader.className = 'cell-toolbar absolute -top-1.5 z-30 flex items-center gap-1 bg-white shadow-sm border border-slate-200 rounded-md px-1.5 py-0.5 opacity-0 group-hover/output:opacity-100 transition-opacity text-xs';
        
        outHeader.innerHTML = `
            <div class="relative flex items-center justify-center rounded text-slate-500 font-medium px-1 cursor-default pointer-events-none"><span>output</span></div>
            <button class="expand-btn hidden text-slate-400 hover:text-blue-500 p-0.5 rounded transition-colors ml-0.5 border-l border-slate-200 pl-1 flex items-center gap-1" title="Toggle Expansion">
                <svg class="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7-7"></path></svg>
                <span class="btn-text font-medium tracking-tight"></span>
            </button>
            <button class="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors ml-0.5 border-l border-slate-200 pl-1 clear-btn" title="clear output">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        `;
        
        outHeader.querySelector('.clear-btn').onclick = () => this.clearOutput();

        const outBodyWrap = document.createElement('div');
        outBodyWrap.className = 'relative w-full rounded-md overflow-hidden bg-transparent';
        
        this.topShadow = document.createElement('div');
        this.topShadow.className = 'absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white via-white/80 to-transparent opacity-0 transition-opacity z-10 pointer-events-none flex items-start justify-center';
        this.topShadow.innerHTML = `<div class="pointer-events-auto cursor-pointer group/topshadow px-4 py-1" title="Scroll to top"><svg class="w-4 h-4 text-slate-400 group-hover/topshadow:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"></path></svg></div>`;
        this.topShadow.querySelector('div').onclick = () => this.outputContent.scrollTo({ top: 0, behavior: 'smooth' });
        
        this.bottomShadow = document.createElement('div');
        this.bottomShadow.className = 'absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/80 to-transparent opacity-0 transition-opacity z-10 pointer-events-none flex items-end justify-center';
        this.bottomShadow.innerHTML = `<div class="pointer-events-auto cursor-pointer group/botshadow px-4 py-1" title="Scroll to bottom"><svg class="w-4 h-4 text-slate-400 group-hover/botshadow:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg></div>`;
        this.bottomShadow.querySelector('div').onclick = () => this.outputContent.scrollTo({ top: this.outputContent.scrollHeight, behavior: 'smooth' });

        this.outputContent = document.createElement('div');
        this.outputContent.className = 'w-full min-w-0 output-box px-4 py-3 font-mono text-sm whitespace-pre-wrap word-break box-border';
        this.outputContent.innerHTML = this.output;
        
        outBodyWrap.appendChild(this.topShadow);
        outBodyWrap.appendChild(this.outputContent);
        outBodyWrap.appendChild(this.bottomShadow);
        
        outputBox.appendChild(outHeader);
        outputBox.appendChild(outBodyWrap);
        this.outputWrapper.appendChild(outputBox);
        
        this.expandBtn = outHeader.querySelector('.expand-btn');
        this.expandBtnIcon = this.expandBtn.querySelector('svg');
        this.expandBtnText = this.expandBtn.querySelector('.btn-text');
        this.isOutputExpanded = false;

        this.expandBtn.onclick = () => {
            this.isOutputExpanded = !this.isOutputExpanded;
            this.applyHysteresis();
        };

        this.checkScroll = () => {
            if (this.outputContent.scrollTop > 0) this.topShadow.classList.remove('opacity-0');
            else this.topShadow.classList.add('opacity-0');

            if (this.outputContent.scrollHeight > this.outputContent.clientHeight && 
                Math.ceil(this.outputContent.scrollTop + this.outputContent.clientHeight) < this.outputContent.scrollHeight) {
                this.bottomShadow.classList.remove('opacity-0');
            } else {
                this.bottomShadow.classList.add('opacity-0');
            }
        };

        this.outputContent.addEventListener('scroll', this.checkScroll);
        
        const outObserver = new MutationObserver(() => {
            setTimeout(this.checkScroll, 10);
            this.dispatchAction('cell-height-changed');
        });
        outObserver.observe(this.outputContent, { childList: true, subtree: true, characterData: true });

        if (this.output) setTimeout(() => this.applyHysteresis(), 10);
    }

    clearOutput() {
        if (!this.outputContent) return;
        this.outputContent.innerHTML = '';
        this.output = '';
        this.outputWrapper.classList.remove('flex');
        this.outputWrapper.classList.add('hidden');
        this.setButtonState('default');
        this.dispatchAction('cell-content-changed');
        this.dispatchAction('cell-height-changed');
    }

    refresh() {
        if (this.editorView && this.editorView.requestMeasure) {
            this.editorView.requestMeasure();
        }
        if (this.checkScroll) this.checkScroll();
    }

    focusCell() { if(this.editorView && !this.isLocked) this.editorView.focus(); }

    applyHysteresis() {
        if (!this.outputContent) return;
        
        const config = (window.notebookCore && window.notebookCore.options) || { outputCurtailThresholdLines: 40, outputCurtailShowLines: 10, outputLineHeightPx: 21 };        const textLines = (this.outputContent.innerText.match(/\n/g) || []).length + 1;
        const shouldCurtail = textLines > config.outputCurtailThresholdLines;

        if (shouldCurtail) {
            this.expandBtn.classList.remove('hidden');
            if (this.isOutputExpanded) {
                this.outputContent.style.maxHeight = 'none'; 
                this.outputContent.style.overflowY = 'auto';
                this.expandBtnIcon.style.transform = 'rotate(-90deg)';
                this.expandBtnText.innerText = 'collapse';
            } else {
                this.outputContent.style.maxHeight = `${config.outputCurtailShowLines * config.outputLineHeightPx}px`;
                this.outputContent.style.overflowY = 'hidden';
                this.expandBtnIcon.style.transform = 'rotate(90deg)';
                this.expandBtnText.innerText = `show all`;
            }
        } else {
            this.expandBtn.classList.add('hidden');
            this.outputContent.style.maxHeight = 'none'; 
            this.outputContent.style.overflowY = 'auto';
        }
        
        setTimeout(() => { 
            if(this.checkScroll) this.checkScroll(); 
            this.dispatchAction('cell-height-changed');
        }, 10);
    }

    getActionButtonConfig() {
        return {
            icon: `<svg class="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
            title: 'Run Code (Shift+Enter)',
        };
    }

    async handleActionClick() {
        if (!window.notebookCore.kernel || !window.notebookCore.kernel.isReady) {
            this.outputContent.innerHTML = `<span class="text-orange-500 font-semibold">Kernel is still initializing... Please wait.</span>`;
            this.outputWrapper.classList.remove('hidden');
            this.outputWrapper.classList.add('flex');
            this.dispatchAction('cell-height-changed');
            return;
        }
        
        this.content = this.editorView ? this.editorView.state.doc.toString() : this.content;
        this.setButtonState('running');

        this.outputWrapper.classList.remove('hidden');
        this.outputWrapper.classList.add('flex');
        this.outputContent.innerHTML = '';
        this.dispatchAction('cell-height-changed');
        
        try {
            await window.notebookCore.kernel.execute(this.content, this.outputContent);
            this.output = this.outputContent.innerHTML;
            this.setButtonState('success');
            
            // Revert back to the play arrow after 2 seconds
            setTimeout(() => {
                this.setButtonState('default');
            }, 2000);
            
        } catch (err) {
            this.outputContent.innerHTML += `<span class="text-red-500 font-semibold mt-2 block">${err}</span>`;
            this.output = this.outputContent.innerHTML;
            this.setButtonState('default');
        } finally {
            this.applyHysteresis();
            this.dispatchAction('cell-content-changed'); 
        }
    }
    
    toJSON() {
        const base = super.toJSON();
        if (this.editorView) {
            base.content = this.editorView.state.doc.toString();
        }
        base.output = this.output;
        return base;
    }
}
customElements.define('notebook-code-cell', CodeCellElement);
