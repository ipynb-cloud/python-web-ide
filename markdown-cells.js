class MarkdownCellElement extends window.BaseNotebookCell {
    connectedCallback() {
        this.isEditing = this.hasAttribute('is-editing');
        super.connectedCallback();
    }

    mountContent(container) {
        // Locked markdown cells force themselves into view mode permanently
        if (this.isLocked) this.isEditing = false;

        this.viewDiv = document.createElement('div');
        this.viewDiv.className = `markdown-body cursor-pointer min-h-[1.75rem] flex-1 ${this.isEditing ? 'hidden' : ''}`;
        
        this.renderMarkdown();

        this.viewDiv.addEventListener('dblclick', () => {
            if (this.isLocked) return; // Prevent unlocking via double click
            this.isEditing = true;
            this.toggleMode();
        });
        
        this.editDiv = document.createElement('div');
        this.editDiv.className = `w-full flex-col ${this.isEditing ? 'flex' : 'hidden'}`;
        
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'w-full min-h-[3.25rem] py-2.5 pl-4 pr-10 bg-transparent text-[14px] text-slate-700 font-mono focus:outline-none block border-0 leading-relaxed resize-none overflow-hidden';
        this.textarea.value = this.content;
        this.textarea.placeholder = "Type Markdown here... ($math$ supported). Shift+Enter to render.";
        
        this.textarea.addEventListener('input', () => {
            this.content = this.textarea.value;
            autosize.update(this.textarea);
            this.dispatchAction('cell-content-changed');
        });

        this.textarea.addEventListener('focus', () => {
            if (window.notebookCore) window.notebookCore.activeCodeEditor = null;
        });

        this.textarea.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                this.handleActionClick();
            }
        });

        this.editDiv.appendChild(this.textarea);
        
        container.appendChild(this.viewDiv);
        container.appendChild(this.editDiv);

        this.updateActionButton(this.getActionButtonConfig());

        setTimeout(() => { 
            autosize(this.textarea);
            if (this.isEditing && !this.isLocked) this.textarea.focus(); 
        }, 0);
    }

    renderMarkdown() {
        this.viewDiv.innerHTML = marked.parse(this.content || '*Empty Markdown cell*');
        
        // Inject Smart Code Buttons
        const preTags = this.viewDiv.querySelectorAll('pre');
        preTags.forEach(pre => {
            pre.style.position = 'relative';
            pre.classList.add('group');
            
            const codeEl = pre.querySelector('code');
            if (!codeEl) return;
            
            const codeText = codeEl.innerText;
            const btn = document.createElement('button');
            btn.className = 'absolute top-2 right-2 px-2 py-1 bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-sans font-medium transition-all shadow-sm flex items-center gap-1.5 backdrop-blur-sm opacity-0 group-hover:opacity-100 z-10 border border-slate-600';
            
            const defaultIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
            const insertIcon = `<svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
            const copyIcon = `<svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;

            btn.innerHTML = `${defaultIcon} <span>Use</span>`;
            
            const actionHandler = (e) => {
                e.preventDefault();
                e.stopPropagation(); // prevent dblclick from triggering edit mode
                
                const editor = window.notebookCore ? window.notebookCore.activeCodeEditor : null;
                const isReadOnly = window.notebookCore ? window.notebookCore.isReadOnly : false;

                if (editor && !isReadOnly && !this.isLocked) {
                    const selection = editor.state.selection.main;
                    editor.dispatch({
                        changes: { from: selection.from, to: selection.to, insert: codeText },
                        selection: { anchor: selection.from + codeText.length }
                    });
                    editor.focus();
                    btn.innerHTML = `${insertIcon} <span class="text-green-400">Inserted</span>`;
                } else {
                    const copyFallback = (text) => {
                        const textArea = document.createElement("textarea");
                        textArea.value = text;
                        textArea.style.position = "fixed";
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        try { document.execCommand('copy'); } catch (err) {}
                        document.body.removeChild(textArea);
                    };
                    
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(codeText).catch(() => copyFallback(codeText));
                    } else {
                        copyFallback(codeText);
                    }
                    btn.innerHTML = `${copyIcon} <span class="text-blue-400">Copied</span>`;
                }
                
                setTimeout(() => { btn.innerHTML = `${defaultIcon} <span>Use</span>`; }, 2000);
            };

            btn.onclick = actionHandler;
            btn.ondblclick = (e) => e.stopPropagation();
            
            pre.appendChild(btn);
        });

        MathJaxHelper.queue(this.viewDiv, () => this.dispatchAction('cell-height-changed'));
    }

    getActionButtonConfig() {
        if (this.isLocked) return null; // No action button on locked markdown

        if (this.isEditing) {
            return { icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`, title: 'Render Markdown (Shift+Enter)' };
        } else {
            return { icon: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`, title: 'Edit Markdown' };
        }
    }

    handleActionClick() {
        if (this.isLocked) return;
        this.isEditing = !this.isEditing;
        if (!this.isEditing) {
            this.renderMarkdown();
        }
        this.toggleMode();
        this.dispatchAction('cell-content-changed');
    }

    toggleMode() {
        if (this.isEditing) {
            this.viewDiv.classList.add('hidden');
            this.editDiv.classList.remove('hidden');
            this.editDiv.classList.add('flex');
            setTimeout(() => { 
                autosize.update(this.textarea); 
                this.textarea.focus(); 
            }, 0);
        } else {
            this.editDiv.classList.add('hidden');
            this.editDiv.classList.remove('flex');
            this.viewDiv.classList.remove('hidden');
            this.dispatchAction('cell-height-changed');
        }
        this.updateActionButton(this.getActionButtonConfig());
    }

    refresh() { 
        if (this.textarea) autosize.update(this.textarea); 
        this.dispatchAction('cell-height-changed');
    }
    focusCell() { if(this.isEditing && this.textarea && !this.isLocked) this.textarea.focus(); }
}
customElements.define('notebook-markdown-cell', MarkdownCellElement);