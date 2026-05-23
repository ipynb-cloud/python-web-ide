window.PythonRunner = {
            run: function(code, outputDiv, options = {}) {
                const isSafeMode = options.safeMode !== false;
                outputDiv.innerHTML = ""; 
                
                let outputBuffer = [];
                let bufferedLineCount = 0;
                let bufferedCharCount = 0;
                let isExecutionTerminated = false;

                if (typeof Sk === 'undefined') {
                    outputDiv.innerHTML = "<span style='color: #f48771;'>Error: Skulpt is not loaded. Ensure skulpt.min.js is included.</span>";
                    return;
                }

                function flushBuffer() {
                    if (outputBuffer.length > 0) {
                        const span = document.createElement('span');
                        span.innerText = outputBuffer.join("");
                        outputDiv.appendChild(span);
                        outputBuffer = [];
                    }
                }

                function outf(text) {
                    if (isExecutionTerminated) return;
                    outputBuffer.push(text);
                    bufferedLineCount += (text.match(/\n/g) || []).length;
                    bufferedCharCount += text.length;

                    if (isSafeMode) {
                        if (bufferedLineCount > 100 || bufferedCharCount > 50000) {
                            isExecutionTerminated = true;
                            flushBuffer();
                            const s = document.createElement('span');
                            s.style.color = '#f48771';
                            s.innerText = bufferedLineCount > 100 ? "\n\n[Safe Mode Error]: Terminated. Generated output exceeded 100 lines." : "\n\n[Safe Mode Error]: Terminated. Output exceeded memory limits.";
                            outputDiv.appendChild(s);
                            outputDiv.scrollTop = outputDiv.scrollHeight;
                            throw new Error("Output limit exceeded");
                        }
                    }
                }

                function builtinRead(x) {
                    if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "Err";
                    return Sk.builtinFiles["files"][x];
                }

                setTimeout(() => {
                    Sk.configure({ 
                        output: outf, 
                        read: builtinRead, 
                        __future__: Sk.python3,
                        execLimit: isSafeMode ? 1500 : Number.POSITIVE_INFINITY
                    }); 
                    
                    Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, code, true))
                    .then(() => {
                        if (isExecutionTerminated) return;
                        flushBuffer();
                        const s = document.createElement('span');
                        s.style.color = '#4ec9b0'; s.style.fontStyle = 'italic'; s.style.fontSize = '12px'; s.style.marginTop = '10px'; s.style.display = 'block';
                        s.innerText = "\n>>> Finished successfully.";
                        outputDiv.appendChild(s);
                        outputDiv.scrollTop = outputDiv.scrollHeight;
                    })
                    .catch((err) => {
                        if (isExecutionTerminated) return;
                        flushBuffer();
                        const s = document.createElement('span');
                        s.style.color = '#f48771';
                        s.innerText = err.toString().includes("TimeLimitError") ? "\n\n[Safe Mode Error]: Time limit exceeded. Execution timed out." : "\n" + err.toString();
                        outputDiv.appendChild(s);
                        outputDiv.scrollTop = outputDiv.scrollHeight;
                    });
                }, 50);
            }
        };