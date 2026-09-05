class MarkdownCellElement extends window.BaseNotebookCell {
    connectedCallback() {
        this.isEditing = this.hasAttribute('is-editing');
        super.connectedCallback();
    }

    mountContent(container) {
        // View Mode Shrinks to 1 line naturally (1.75rem)
        this.viewDiv = document.createElement('div');
        this.viewDiv.className = `markdown-body cursor-pointer min-h-[1.75rem] flex-1 ${this.isEditing ? 'hidden' : ''}`;
        this.viewDiv.innerHTML = marked.parse(this.content || '*Empty Markdown. Double click to edit.*');
        
        MathJaxHelper.queue(this.viewDiv, () => this.dispatchAction('cell-height-changed'));

        this.viewDiv.addEventListener('dblclick', () => {
            if (this.isReadOnly) return;
            this.isEditing = true;
            this.toggleMode();
        });
        
        // Edit Mode needs geometric minimum (3.25rem = 52px) to elegantly stack Toolbar and Action Btn
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
            if (this.isEditing) this.textarea.focus(); 
        }, 0);
    }

    getActionButtonConfig() {
        if (this.isEditing) {
            return { icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`, title: 'Render Markdown (Shift+Enter)' };
        } else {
            return { icon: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`, title: 'Edit Markdown' };
        }
    }

    handleActionClick() {
        this.isEditing = !this.isEditing;
        if (!this.isEditing) {
            this.viewDiv.innerHTML = marked.parse(this.content || '*Empty Markdown cell*');
            MathJaxHelper.queue(this.viewDiv, () => this.dispatchAction('cell-height-changed'));
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
    focusCell() { if(this.isEditing && this.textarea) this.textarea.focus(); }
}
customElements.define('notebook-markdown-cell', MarkdownCellElement);