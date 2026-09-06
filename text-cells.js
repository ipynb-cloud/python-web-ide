class TextCellElement extends window.BaseNotebookCell {
    mountContent(container) { 
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'w-full min-h-[1.75rem] py-2.5 pl-4 pr-10 bg-transparent text-slate-700 text-[14px] font-mono focus:outline-none block border-0 leading-relaxed resize-none overflow-hidden';
        this.textarea.value = this.content;
        this.textarea.placeholder = "Type plain text here... (Shift+Enter for new cell)";
        this.textarea.readOnly = this.isLocked; // Locks completely if instructed by metadata
        
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
                this.dispatchAction('cell-insert-below');
            }
        });
        
        container.appendChild(this.textarea);
        setTimeout(() => { autosize(this.textarea); }, 0);
    }

    refresh() { if(this.textarea) autosize.update(this.textarea); }
    focusCell() { if(this.textarea && !this.isLocked) this.textarea.focus(); }
}
customElements.define('notebook-text-cell', TextCellElement);