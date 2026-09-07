/**
 * PyNote Plugin: Embedded CM6 Code Blocks & "Use" Button
 * Must be loaded AFTER markdown-cells.js
 */
if (customElements.get('notebook-markdown-cell')) {
    const MarkdownCell = customElements.get('notebook-markdown-cell');

    // Override the vanilla render method
    MarkdownCell.prototype.renderMarkdown = function() {
        
        // 1. Perform vanilla Markdown parsing
        try {
            this.viewDiv.innerHTML = (typeof marked !== 'undefined') 
                ? marked.parse(this.content || '*Empty Markdown cell*') 
                : (this.content || '');
        } catch (err) {
            console.warn("Markdown parse error:", err);
            this.viewDiv.innerText = this.content || '';
        }
        
        // 2. Upgrade all <pre> tags to CM6 instances
        const preTags = this.viewDiv.querySelectorAll('pre');
        preTags.forEach(pre => {
            const codeEl = pre.querySelector('code');
            if (!codeEl) return;
            
            const codeText = codeEl.innerText.trim();
            const languageMatch = codeEl.className.match(/language-(\w+)/);
            const lang = languageMatch ? languageMatch[1] : 'text';

            pre.innerHTML = '';
            pre.style.position = 'relative';
            pre.style.padding = '0';
            pre.style.overflow = 'hidden';
            pre.classList.add('group', 'border', 'border-slate-200', 'rounded-md', 'my-3');

            try {
                if (typeof cm6 !== 'undefined') {
                    const customExtensions = [];
                    if (cm6.basicSetup) customExtensions.push(cm6.basicSetup);

                    const EditorView = cm6.EditorView || (cm6.view ? cm6.view.EditorView : null);
                    const EditorState = cm6.EditorState || (cm6.state ? cm6.state.EditorState : null);

                    if (EditorView && EditorView.theme) {
                        customExtensions.push(EditorView.theme({
                            ".cm-gutters": { display: "none !important" },
                            "&": { backgroundColor: "#f8fafc" },
                            ".cm-scroller": { fontFamily: "'Fira Code', monospace", fontSize: "14px", padding: "1rem" }
                        }));
                    }

                    if (lang === 'python' && typeof cm6.python === 'function') {
                        customExtensions.push(cm6.python());
                    } else if (lang === 'python' && cm6.langPython && typeof cm6.langPython.python === 'function') {
                        customExtensions.push(cm6.langPython.python());
                    }

                    if (EditorView && EditorView.editable) customExtensions.push(EditorView.editable.of(false));
                    if (EditorState && EditorState.readOnly) customExtensions.push(EditorState.readOnly.of(true));

                    const editorView = cm6.createEditorView(undefined, pre);
                    const state = cm6.createEditorState(codeText, { extensions: customExtensions });
                    editorView.setState(state);
                } else {
                    throw new Error("cm6 unavailable");
                }
            } catch (err) {
                pre.innerHTML = '';
                const fallbackCode = document.createElement('code');
                fallbackCode.innerText = codeText;
                pre.style.padding = '1em';
                pre.appendChild(fallbackCode);
            }

            // 3. Inject the "Use" Button with focus-stealing prevention
            const btn = document.createElement('button');
            btn.className = 'absolute top-2 right-2 px-2 py-1 bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-sans font-medium transition-all shadow-sm flex items-center gap-1.5 backdrop-blur-sm opacity-0 group-hover:opacity-100 z-10 border border-slate-600';
            
            const defaultIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
            const insertIcon = `<svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
            const copyIcon = `<svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;

            btn.innerHTML = `${defaultIcon} <span>Use</span>`;

            // CRITICAL FIX: Stop the browser from moving focus away from the active editor
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
            
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation(); 
                
                const editor = window.notebookCore ? window.notebookCore.activeCodeEditor : null;
                const isReadOnly = window.notebookCore ? window.notebookCore.options.isReadOnly : false;

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
                        textArea.value = text; textArea.style.position = "fixed";
                        document.body.appendChild(textArea); textArea.focus(); textArea.select();
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

            btn.ondblclick = (e) => e.stopPropagation();
            pre.appendChild(btn);
        });

        // 4. Trigger MathJax
        if (window.MathJaxHelper) {
            window.MathJaxHelper.queue(this.viewDiv, () => this.dispatchAction('cell-height-changed'));
        }
    };
} else {
    console.warn("PyNote Plugin Error: markdown-cells-embedded-code.js must be loaded AFTER markdown-cells.js");
}