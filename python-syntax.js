window.PythonSyntax = {
            unescapeHtml: (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
            
            highlight: function(code) {
                code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const tokenRegex = /((?:#).*?$)|((?:\b[fF])?(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))|\b(def|class|import|from|return|if|else|elif|while|for|in|print|try|except|raise|True|False|None|as|with|finally|yield|lambda|pass|break|continue|and|or|not|is|self)\b|(\b\d+\b)|(@\w+)/gm;
                
                return code.replace(tokenRegex, (match, comment, string, keyword, number, decorator) => {
                    if (comment) return `<span class="py-token-comment">${comment}</span>`;
                    if (string) {
                        if (string.startsWith('f') || string.startsWith('F')) {
                            const formatted = string.replace(/\{.*?\}/g, interp => {
                                return `<span class="py-token-fstring-inner">{${this.highlight(this.unescapeHtml(interp.slice(1, -1)))}}</span>`;
                            });
                            return `<span class="py-token-fstring">${formatted}</span>`;
                        }
                        return `<span class="py-token-string">${string}</span>`;
                    }
                    if (keyword) return `<span class="py-token-keyword">${keyword}</span>`;
                    if (number) return `<span class="py-token-number">${number}</span>`;
                    if (decorator) return `<span class="py-token-decorator">${decorator}</span>`;
                    return match;
                });
            },

            getLineIndent: (text, index) => {
                const lineStart = text.lastIndexOf('\n', index - 1) + 1;
                let i = lineStart;
                while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
                return text.substring(lineStart, i);
            },

            analyzeLineBrackets: (line) => {
                let stack = [];
                let inString = false;
                let stringChar = null;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (inString) {
                        if (char === stringChar && line[i-1] !== '\\') inString = false;
                        continue;
                    }
                    if (char === '"' || char === "'") {
                        inString = true; stringChar = char; continue;
                    }
                    if (char === '#') break; 
                    if (['(', '[', '{'].includes(char)) {
                        stack.push({ char, index: i });
                    } else if ([']', ')', '}'].includes(char)) {
                        if (stack.length > 0) {
                            const last = stack[stack.length - 1];
                            if ((char === ']' && last.char === '[') || (char === ')' && last.char === '(') || (char === '}' && last.char === '{')) {
                                stack.pop();
                            }
                        }
                    }
                }
                return stack;
            },

            findMatchingBracket: (text, closeIndex) => {
                const closeChar = text[closeIndex];
                const openChar = closeChar === ')' ? '(' : (closeChar === ']' ? '[' : '{');
                let depth = 1;
                for (let i = closeIndex - 1; i >= 0; i--) {
                    const c = text[i];
                    if (c === closeChar) depth++;
                    else if (c === openChar) depth--;
                    if (depth === 0) return i;
                }
                return null;
            }
        };