class PythonEditorElement extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' }); // Encapsulate styles and DOM!
                this.currentLineCount = 0;
            }

            connectedCallback() {
                // Extract initial content wrapped between the tags
                const initialCode = this.textContent.trim();
                this.textContent = ''; 
                this.render();
                
                this.textarea = this.shadowRoot.querySelector('.py-editing');
                this.pre = this.shadowRoot.querySelector('.py-highlighting');
                this.codeElement = this.shadowRoot.querySelector('.py-highlighting-content');
                this.lineNumbers = this.shadowRoot.querySelector('.py-line-numbers');

                this.bindEvents();
                
                if (initialCode) {
                    this.textarea.value = initialCode;
                }
                this.updateCode();
            }

            render() {
                this.shadowRoot.innerHTML = `
                    <style>
                        :host {
                            display: block;
                            --py-bg: #1e1e1e;
                            --py-text: #d4d4d4;
                            --py-font: 'Consolas', 'Monaco', 'Courier New', monospace;
                            --py-font-size: 14px;
                            --py-line-num-bg: #1e1e1e;
                            --py-line-num-border: #333333;
                            --py-line-num-color: #606060;
                            --py-caret: #d4d4d4;
                            --py-placeholder: rgba(106, 153, 85, 0.6);
                            
                            --py-keyword: #569cd6;
                            --py-string: #ce9178;
                            --py-fstring: #f44747;
                            --py-comment: #6a9955;
                            --py-number: #b5cea8;
                            --py-decorator: #c586c0;
                        }
                        
                        .py-editor-container { display: flex; position: relative; width: 100%; height: 100%; overflow: hidden; background-color: var(--py-bg); border-radius: inherit; }
                        .py-line-numbers { width: 50px; height: 100%; background-color: var(--py-line-num-bg); border-right: 1px solid var(--py-line-num-border); text-align: right; padding: 15px 10px 15px 0; box-sizing: border-box; color: var(--py-line-num-color); font-family: var(--py-font); font-size: var(--py-font-size); line-height: 1.5; overflow: hidden; flex-shrink: 0; user-select: none; }
                        .py-code-overlay-wrapper { flex-grow: 1; position: relative; height: 100%; overflow: hidden; }
                        .py-highlighting, .py-editing { margin: 0; padding: 15px; border: 0; width: 100%; height: 100%; position: absolute; top: 0; left: 0; box-sizing: border-box; font-family: var(--py-font); font-size: var(--py-font-size); line-height: 1.5; tab-size: 4; white-space: pre; overflow: auto; }
                        .py-highlighting { z-index: 1; background-color: transparent; pointer-events: none; color: var(--py-text); }
                        .py-highlighting code { font-family: inherit; }
                        .py-editing { z-index: 2; color: transparent; background: transparent; caret-color: var(--py-caret); outline: none; resize: none; }
                        .py-editing::placeholder { color: var(--py-placeholder); font-style: italic; }
                        .py-editing::-webkit-scrollbar, .py-highlighting::-webkit-scrollbar { width: 10px; height: 10px; }
                        .py-editing::-webkit-scrollbar-track { background: var(--py-bg); }
                        .py-editing::-webkit-scrollbar-thumb { background: #424242; border-radius: 5px; }
                        
                        .py-token-keyword  { color: var(--py-keyword); } 
                        .py-token-string   { color: var(--py-string); } 
                        .py-token-fstring  { color: var(--py-fstring); } 
                        .py-token-fstring-inner { color: var(--py-text); }
                        .py-token-comment  { color: var(--py-comment); font-style: italic; } 
                        .py-token-number   { color: var(--py-number); } 
                        .py-token-decorator{ color: var(--py-decorator); }
                    </style>
                    <div class="py-editor-container">
                        <div class="py-line-numbers">1</div>
                        <div class="py-code-overlay-wrapper">
                            <pre class="py-highlighting" aria-hidden="true"><code class="py-highlighting-content"></code></pre>
                            <textarea class="py-editing" spellcheck="false" placeholder="# try and test code here"></textarea>
                        </div>
                    </div>
                `;
            }

            bindEvents() {
                this.textarea.addEventListener('input', () => {
                    this.updateCode();
                    this.syncScroll();
                    // Emit a custom event if parents want to listen to live typing
                    this.dispatchEvent(new CustomEvent('code-changed', { detail: { code: this.getCode() } }));
                });
                this.textarea.addEventListener('scroll', () => this.syncScroll());
                this.textarea.addEventListener('keydown', (e) => this.handleKeyDown(e));
                this.textarea.addEventListener('paste', (e) => this.handlePaste(e));
            }

            // In Shadow DOM, execCommand is flaky. Using setRangeText is the modern, robust way.
            insertText(text) {
                const start = this.textarea.selectionStart;
                this.textarea.setRangeText(text, start, start, 'end');
                this.textarea.dispatchEvent(new Event('input')); 
            }

            deleteFourSpaces() {
                const start = this.textarea.selectionStart;
                this.textarea.setRangeText('', start - 4, start, 'end');
                this.textarea.dispatchEvent(new Event('input')); 
            }

            updateCode() {
                let text = this.textarea.value;
                let result_text = text;
                if(text[text.length-1] === "\n") result_text += " "; 
                
                this.codeElement.innerHTML = window.PythonSyntax.highlight(result_text);
                
                const lines = text.split('\n').length;
                if (lines !== this.currentLineCount) {
                    this.lineNumbers.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
                    this.currentLineCount = lines;
                }
            }

            syncScroll() {
                this.pre.scrollTop = this.textarea.scrollTop;
                this.pre.scrollLeft = this.textarea.scrollLeft;
                this.lineNumbers.scrollTop = this.textarea.scrollTop;
            }

            handleKeyDown(e) {
                const val = this.textarea.value;
                const start = this.textarea.selectionStart;
                const end = this.textarea.selectionEnd;

                if (e.key === "Tab") {
                    e.preventDefault();
                    this.insertText("    ");
                } 
                else if (e.key === "Backspace") {
                    if (start === end && start > 0) {
                        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                        const textBeforeCursor = val.substring(lineStart, start);
                        if (/^\s+$/.test(textBeforeCursor) && textBeforeCursor.length >= 4) {
                            if (val.substring(start - 4, start) === "    ") {
                                e.preventDefault();
                                this.deleteFourSpaces();
                            }
                        }
                    }
                }
                else if (e.key === "Enter") {
                    if (e.ctrlKey || e.metaKey) return; 
                    
                    e.preventDefault();
                    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                    const currentLine = val.substring(lineStart, start);
                    const trimmed = currentLine.trimEnd();
                    
                    let nextIndent = "";
                    const bracketStack = window.PythonSyntax.analyzeLineBrackets(currentLine);
                    const lineWithoutComment = currentLine.split('#')[0].trimEnd();

                    if (bracketStack.length > 0) {
                        nextIndent = " ".repeat(bracketStack[bracketStack.length - 1].index + 1);
                    }
                    else if (lineWithoutComment.endsWith(":")) {
                        const beforeColon = lineWithoutComment.slice(0, -1).trimEnd();
                        const lastCharBeforeColon = beforeColon.charAt(beforeColon.length - 1);
                        if ([')', ']', '}'].includes(lastCharBeforeColon)) {
                            const closeIndex = lineStart + currentLine.lastIndexOf(lastCharBeforeColon);
                            const openIndex = window.PythonSyntax.findMatchingBracket(val, closeIndex);
                            nextIndent = (openIndex !== null ? window.PythonSyntax.getLineIndent(val, openIndex) : window.PythonSyntax.getLineIndent(val, start)) + "    ";
                        } else {
                            nextIndent = window.PythonSyntax.getLineIndent(val, start) + "    ";
                        }
                    }
                    else if ([')', ']', '}'].includes(trimmed.charAt(trimmed.length - 1))) {
                        const lastChar = trimmed.charAt(trimmed.length - 1);
                        const closeIndex = lineStart + currentLine.lastIndexOf(lastChar);
                        const openIndex = window.PythonSyntax.findMatchingBracket(val, closeIndex);
                        nextIndent = openIndex !== null ? window.PythonSyntax.getLineIndent(val, openIndex) : window.PythonSyntax.getLineIndent(val, start);
                    }
                    else {
                        nextIndent = window.PythonSyntax.getLineIndent(val, start);
                    }

                    this.insertText("\n" + nextIndent);
                    setTimeout(() => this.syncScroll(), 0);
                }
            }

            handlePaste(e) {
                const clipboardData = e.clipboardData || window.clipboardData;
                if (!clipboardData) return;
                e.preventDefault();
                let text = clipboardData.getData('text/plain');
                if (text) {
                    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                    this.insertText(text);
                    this.syncScroll();
                }
            }
            
            getCode() {
                return this.textarea.value;
            }
            
            setCode(newCode) {
                this.textarea.value = newCode;
                this.updateCode();
            }
        }
        
        customElements.define('python-editor', PythonEditorElement);