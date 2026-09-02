export class PythonNotebook {
    constructor(mountId) {
        this.mountPoint = document.getElementById(mountId);
        if (!this.mountPoint) {
            console.error(`Notebook mount point #${mountId} not found.`);
            return;
        }

        // It looks for the closest question container, then finds the essay response box
        const questionContainer = this.mountPoint.closest('.que');
        this.moodleTextArea = questionContainer ? questionContainer.querySelector('textarea.qtype_essay_response') : null;

        if (this.moodleTextArea) {
            // Hide the raw textarea so the student only sees the notebook
            this.moodleTextArea.style.display = 'none';
        } else {
            console.warn("Moodle textarea not found. The notebook will run, but answers won't be saved to Moodle.");
        }

        this.init();
    }

    init() {
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.minHeight = '300px'; 
        iframe.style.border = '1px solid #e5e7eb';
        iframe.style.borderRadius = '0.375rem';
        iframe.style.display = 'block';
        iframe.style.transition = 'height 0.2s ease-out'; // Smooth resizing

        this.mountPoint.appendChild(iframe);

        window.addEventListener('message', (event) => {
            // Security check: ensure message is from our specific iframe
            if (event.source !== iframe.contentWindow) return;

            const data = event.data;

            if (data.type === 'resize') {
                // Adjust iframe height dynamically to match inner content
                iframe.style.height = (data.height + 20) + 'px'; 
            } 
            else if (data.type === 'sync') {
                // Save the notebook state back into Moodle's hidden textarea
                if (this.moodleTextArea) {
                    this.moodleTextArea.value = data.content;
                }
            } 
            else if (data.type === 'ready') {
                // The iframe has booted. Send it the student's saved code (if any).
                const savedState = this.moodleTextArea ? this.moodleTextArea.value : "";
                iframe.contentWindow.postMessage({ type: 'load', content: savedState }, '*');
            }
        });

        // We use raw string literals. Note that we have to escape backslashes for MathJax and regexes!
        const iframeContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <script src="https://cdn.tailwindcss.com"></script>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.css">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/monokai.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/python/python.min.js"></script>
                <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
                <script>
                    window.MathJax = {
                        tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] },
                        startup: { typeset: false } 
                    };
                </script>
                <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
                <style>
                    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: white; margin: 0; padding: 1rem; overflow-y: hidden; }
                    .CodeMirror { height: auto; min-height: 50px; border-radius: 0.375rem; border: 1px solid #d1d5db; font-size: 14px; }
                    .CodeMirror-scroll { min-height: 50px; }
                    .markdown-body { color: #1f2937; line-height: 1.5; }
                    .markdown-body pre { background: #1f2937; color: white; padding: 1em; border-radius: 0.375rem; overflow-x: auto; margin-bottom: 0.75em;}
                    .markdown-body code { background: #e5e7eb; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace;}
                    .markdown-body pre code { background: none; padding: 0; }
                    .drag-handle:hover { cursor: grab; color: #4b5563; }
                    .cell-dragging { opacity: 0.4; }
                    .drop-target-above { border-top: 3px solid #3b82f6 !important; border-top-left-radius: 0; border-top-right-radius: 0; }
                    .drop-target-below { border-bottom: 3px solid #3b82f6 !important; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
                </style>
            </head>
            <body>
                <div class="max-w-4xl mx-auto" id="app-wrapper">
                    <!-- Header -->
                    <div class="flex items-center justify-between mb-4">
                        <h1 class="text-2xl font-bold text-gray-800">Python Notebook</h1>
                        <div id="status" class="flex items-center text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                            Loading Python...
                        </div>
                    </div>
                    
                    <!-- Toolbar -->
                    <div class="flex gap-2 mb-6">
                        <button onclick="addCodeCell()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium transition-colors">+ Add Code</button>
                        <button onclick="addMarkdownCell('', null, true)" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded shadow-sm text-sm font-medium transition-colors">+ Add Text</button>
                    </div>

                    <!-- Cells -->
                    <div id="cells" class="flex flex-col gap-4 pb-12"></div>
                </div>

                <div id="context-menu" class="hidden absolute z-50 bg-white border border-gray-200 shadow-lg rounded py-1 text-sm text-gray-700 w-48">
                    <button onclick="handleSplit()" class="w-full text-left px-4 py-2 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2">Split Cell</button>
                </div>

                <script>
                    let pyodide = null;
                    let cellCount = 0;
                    let draggedCell = null;
                    let menuTarget = null;
                    let syncTimeout = null;

                    window.addEventListener('message', (event) => {
                        if (event.data.type === 'load') {
                            loadNotebookState(event.data.content);
                        }
                    });

                    const resizeObserver = new ResizeObserver(entries => {
                        window.parent.postMessage({ type: 'resize', height: document.body.scrollHeight }, '*');
                    });
                    
                    async function init() {
                        resizeObserver.observe(document.body);
                        // Tell Moodle we are ready to receive the saved code
                        window.parent.postMessage({ type: 'ready' }, '*');

                        try {
                            pyodide = await loadPyodide({
                                stdout: (text) => appendOutput(text),
                                stderr: (text) => appendOutput(text, true)
                            });
                            
                            // Initialize micropip for dynamic package loading
                            document.getElementById('status').innerText = "Loading package manager...";
                            await pyodide.loadPackage("micropip");

                            document.getElementById('status').className = "flex items-center text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200";
                            document.getElementById('status').innerText = "Python Ready";
                        } catch (e) {
                            document.getElementById('status').className = "flex items-center text-sm font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded-full border border-red-200";
                            document.getElementById('status').innerText = "Failed to load";
                            console.error(e);
                        }
                    }

                    function debounceSync() {
                        clearTimeout(syncTimeout);
                        syncTimeout = setTimeout(() => {
                            const state = getNotebookState();
                            window.parent.postMessage({ type: 'sync', content: state }, '*');
                        }, 500); // Wait 500ms after user stops typing to sync
                    }

                    // Scrape the DOM to build a string representation of the notebook
                    function getNotebookState() {
                        let blocks = [];
                        const cellContainers = document.getElementById('cells').children;
                        
                        for (let div of cellContainers) {
                            if (div.cmInstance) {
                                blocks.push('# %% [python]\\n' + div.cmInstance.getValue());
                            } else if (div.mdTextArea) {
                                blocks.push('# %% [markdown]\\n' + div.mdTextArea.value);
                            }
                        }
                        return blocks.join('\\n\\n');
                    }

                    // Parse the saved Moodle string back into UI blocks
                    function loadNotebookState(content) {
                        const container = document.getElementById('cells');
                        container.innerHTML = ''; 
                        cellCount = 0;

                        if (!content || content.trim() === '') {
                            // Default starting template if Moodle box is completely empty
                            addMarkdownCell("## Question 1\\n\\nWrite your answer below.");
                            addCodeCell("def test():\\n    pass");
                            return;
                        }

                        // Split by notebook delimiters
                        const blocks = content.split(/(?=# %% \\[[a-z]+\\])/);
                        
                        for (let block of blocks) {
                            const txt = block.trim();
                            if (!txt) continue;
                            
                            if (txt.startsWith('# %% [markdown]')) {
                                addMarkdownCell(txt.replace('# %% [markdown]', '').trim(), null, false);
                            } else if (txt.startsWith('# %% [python]')) {
                                addCodeCell(txt.replace('# %% [python]', '').trim());
                            } else {
                                // Fallback for raw code without tags
                                addCodeCell(txt);
                            }
                        }
                    }

                    function createCellContainer(id, isMarkdown) {
                        const div = document.createElement('div');
                        div.id = \`cell-\${id}\`;
                        div.className = "flex items-stretch group relative cell-wrapper bg-white p-1 rounded-lg border border-transparent hover:border-gray-200 transition-colors";
                        
                        const handle = document.createElement('div');
                        handle.className = "pt-2 pr-2 opacity-0 group-hover:opacity-100 drag-handle text-gray-300";
                        handle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>';
                        handle.onmousedown = () => div.setAttribute('draggable', 'true');
                        handle.onmouseup = () => div.setAttribute('draggable', 'false');
                        handle.onmouseleave = () => div.setAttribute('draggable', 'false');
                        
                        div.addEventListener('dragstart', (e) => {
                            draggedCell = div;
                            e.dataTransfer.effectAllowed = 'move';
                            setTimeout(() => div.classList.add('cell-dragging'), 0);
                        });
                        
                        div.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            const rect = div.getBoundingClientRect();
                            if (e.clientY - rect.top > rect.height / 2) {
                                div.classList.add('drop-target-below');
                                div.classList.remove('drop-target-above');
                            } else {
                                div.classList.add('drop-target-above');
                                div.classList.remove('drop-target-below');
                            }
                        });
                        
                        div.addEventListener('dragleave', () => div.classList.remove('drop-target-above', 'drop-target-below'));
                        
                        div.addEventListener('drop', (e) => {
                            e.stopPropagation();
                            div.classList.remove('drop-target-above', 'drop-target-below');
                            if (draggedCell && draggedCell !== div) {
                                const rect = div.getBoundingClientRect();
                                if (e.clientY - rect.top > rect.height / 2) {
                                    div.parentNode.insertBefore(draggedCell, div.nextSibling);
                                } else {
                                    div.parentNode.insertBefore(draggedCell, div);
                                }
                                debounceSync(); // Reordering changes state
                            }
                        });
                        
                        div.addEventListener('dragend', () => {
                            div.classList.remove('cell-dragging');
                            div.setAttribute('draggable', 'false');
                            document.querySelectorAll('.cell-wrapper').forEach(c => c.classList.remove('drop-target-above', 'drop-target-below'));
                        });

                        const content = document.createElement('div');
                        content.className = "flex-1 relative";
                        
                        const tb = document.createElement('div');
                        tb.className = "absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 z-10";
                        
                        if (isMarkdown) {
                            const editBtn = document.createElement('button');
                            editBtn.innerText = "Edit";
                            editBtn.className = "text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded border border-gray-300 transition-colors";
                            editBtn.onclick = () => toggleMd(id);
                            tb.appendChild(editBtn);
                        }
                        
                        const delBtn = document.createElement('button');
                        delBtn.innerText = "Delete";
                        delBtn.className = "text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 transition-colors";
                        delBtn.onclick = () => { div.remove(); debounceSync(); };
                        tb.appendChild(delBtn);

                        div.appendChild(handle);
                        div.appendChild(content);
                        content.appendChild(tb);
                        return { div, content };
                    }

                    function addCodeCell(code = "", insertAfter = null) {
                        const id = ++cellCount;
                        const { div, content } = createCellContainer(id, false);
                        
                        const inner = document.createElement('div');
                        inner.className = "pl-10 relative border-l-4 border-blue-400 py-1";
                        
                        const play = document.createElement('button');
                        play.className = "absolute left-2 top-3 text-gray-400 hover:text-green-600 transition-colors bg-white rounded-full focus:outline-none";
                        play.innerHTML = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>';
                        play.onclick = () => runCell(id);
                        
                        const editorDiv = document.createElement('div');
                        const outDiv = document.createElement('div');
                        outDiv.id = \`out-\${id}\`;
                        outDiv.className = "hidden mt-2 p-2 bg-gray-50 rounded font-mono text-sm whitespace-pre-wrap border border-gray-200";
                        
                        inner.appendChild(play);
                        inner.appendChild(editorDiv);
                        inner.appendChild(outDiv);
                        content.appendChild(inner);
                        
                        const container = document.getElementById('cells');
                        if (insertAfter) insertAfter.parentNode.insertBefore(div, insertAfter.nextSibling);
                        else container.appendChild(div);

                        const cm = CodeMirror(editorDiv, {
                            value: code,
                            mode: "python",
                            lineNumbers: true,
                            viewportMargin: Infinity,
                            extraKeys: { "Shift-Enter": () => runCell(id) }
                        });
                        
                        cm.on("change", () => debounceSync());
                        cm.on("contextmenu", (cm, e) => showMenu(e, id, 'code', cm, div));
                        div.cmInstance = cm;
                        debounceSync();
                    }

                    let currentOut = null;
                    
                    function appendOutput(text, isErr = false) {
                        if (currentOut) {
                            currentOut.textContent += text + "\\n";
                            currentOut.classList.remove('hidden');
                            if(isErr) currentOut.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
                        }
                    }

                    window.appendPlot = function(svgData) {
                        if (currentOut) {
                            const d = document.createElement('div');
                            d.innerHTML = svgData; 
                            d.style.margin = '10px 0';
                            d.style.backgroundColor = 'white';
                            d.style.padding = '10px';
                            d.style.borderRadius = '4px';
                            d.style.display = 'inline-block';
                            currentOut.appendChild(d);
                            currentOut.classList.remove('hidden');
                        }
                    };

                    async function runCell(id) {
                        if (!pyodide) return alert("Wait for Python to load");
                        const div = document.getElementById(\`cell-\${id}\`);
                        const out = document.getElementById(\`out-\${id}\`);
                        out.innerHTML = '';
                        out.className = "mt-2 p-2 bg-gray-50 rounded font-mono text-sm whitespace-pre-wrap border border-gray-200";
                        currentOut = out;
                        
                        try {
                            let rawCode = div.cmInstance.getValue();
                            const lines = rawCode.split('\\n');
                            const cleanCodeLines = [];
                            
                            // 1. Process Jupyter !pip install magic
                            for (let line of lines) {
                                if (line.trim().startsWith('!pip install')) {
                                    const pkg = line.replace('!pip install', '').trim();
                                    appendOutput(\`[System] Installing \${pkg} via micropip...\\n\`, false);
                                    const micropip = pyodide.pyimport("micropip");
                                    await micropip.install(pkg);
                                    appendOutput(\`[System] Successfully installed \${pkg}.\\n\\n\`, false);
                                } else {
                                    cleanCodeLines.push(line);
                                }
                            }
                            const code = cleanCodeLines.join('\\n');
                            
                            // 2. Fetch standard packages (numpy, pandas, etc.)
                            await pyodide.loadPackagesFromImports(code);

                            // 3. Matplotlib Hook: If they import it, we force SVG routing
                            if (code.includes('matplotlib') || code.includes('pyplot')) {
                                await pyodide.runPythonAsync(\`
import matplotlib
matplotlib.use('svg')
import matplotlib.pyplot as plt
import io, js
def _custom_show():
    buf = io.BytesIO()
    plt.savefig(buf, format='svg')
    buf.seek(0)
    js.appendPlot(buf.read().decode('utf-8'))
    plt.close('all')
plt.show = _custom_show
                                \`);
                            }

                            // 4. Run the code
                            if (code.trim() !== '') {
                                let res = await pyodide.runPythonAsync(code);
                                
                                // 5. Auto-echo the last expression (Jupyter style)
                                if (res !== undefined) {
                                    pyodide.globals.set('_last_res', res);
                                    const repr = pyodide.runPython('repr(_last_res)');
                                    if (repr !== 'None') {
                                        const outSpan = document.createElement('span');
                                        outSpan.style.color = '#b91c1c'; // Tailwind red-700
                                        outSpan.style.fontWeight = 'bold';
                                        outSpan.innerText = "Out: " + repr + "\\n";
                                        currentOut.appendChild(outSpan);
                                        currentOut.classList.remove('hidden');
                                    }
                                    if (typeof res.destroy === 'function') res.destroy();
                                }
                            }
                        } catch (e) {
                            let errStr = e.toString();
                            const pyTracebackSplit = errStr.indexOf('Traceback (most recent call last)');
                            if(pyTracebackSplit !== -1) errStr = errStr.substring(pyTracebackSplit);
                            appendOutput(errStr, true);
                        }
                        currentOut = null;
                        window.parent.postMessage({ type: 'resize', height: document.body.scrollHeight }, '*');
                    }

                    function addMarkdownCell(text = "", insertAfter = null, forceEdit = false) {
                        const id = ++cellCount;
                        const { div, content } = createCellContainer(id, true);
                        
                        const inner = document.createElement('div');
                        inner.className = "border-l-4 border-gray-200 py-1 px-4";
                        
                        const ta = document.createElement('textarea');
                        ta.id = \`ta-\${id}\`;
                        ta.className = "w-full p-2 border border-gray-300 rounded hidden focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono text-sm min-h-[100px]";
                        ta.value = text;
                        ta.placeholder = "Double click to edit markdown...";
                        
                        ta.addEventListener('input', () => debounceSync());
                        ta.onkeydown = (e) => { if(e.key === 'Enter' && e.shiftKey) { e.preventDefault(); toggleMd(id, false); } };
                        ta.oncontextmenu = (e) => showMenu(e, id, 'md', ta, div);
                        ta.onblur = () => toggleMd(id, false);
                        
                        const render = document.createElement('div');
                        render.id = \`render-\${id}\`;
                        render.className = "markdown-body min-h-[2rem] cursor-text";
                        render.ondblclick = () => toggleMd(id, true);
                        
                        inner.appendChild(ta);
                        inner.appendChild(render);
                        content.appendChild(inner);
                        
                        const container = document.getElementById('cells');
                        if (insertAfter) insertAfter.parentNode.insertBefore(div, insertAfter.nextSibling);
                        else container.appendChild(div);

                        div.mdTextArea = ta;
                        toggleMd(id, forceEdit);
                        debounceSync();
                    }

                    function toggleMd(id, forceEdit = null) {
                        const ta = document.getElementById(\`ta-\${id}\`);
                        const render = document.getElementById(\`render-\${id}\`);
                        const isEdit = !ta.classList.contains('hidden');
                        const show = forceEdit !== null ? forceEdit : !isEdit;
                        
                        if (show) {
                            ta.classList.remove('hidden');
                            render.classList.add('hidden');
                            ta.focus();
                        } else {
                            ta.classList.add('hidden');
                            render.classList.remove('hidden');
                            render.innerHTML = marked.parse(ta.value || '*Double-click to edit markdown*');
                            if(window.MathJax && window.MathJax.typesetPromise) {
                                MathJax.typesetPromise([render]);
                            }
                        }
                    }

                    function showMenu(e, id, type, editor, wrapper) {
                        e.preventDefault();
                        const menu = document.getElementById('context-menu');
                        menu.style.left = e.pageX + 'px';
                        menu.style.top = e.pageY + 'px';
                        menu.classList.remove('hidden');
                        menuTarget = { id, type, editor, wrapper };
                    }

                    function handleSplit() {
                        document.getElementById('context-menu').classList.add('hidden');
                        if(!menuTarget) return;
                        const { id, type, editor, wrapper } = menuTarget;
                        
                        if (type === 'code') {
                            const doc = editor.getDoc();
                            const cur = doc.getCursor();
                            const before = doc.getRange({line:0, ch:0}, cur);
                            const after = doc.getRange(cur, {line:doc.lineCount(), ch:0});
                            editor.setValue(before);
                            addCodeCell(after, wrapper);
                        } else {
                            const val = editor.value;
                            const pos = editor.selectionStart;
                            editor.value = val.substring(0, pos);
                            toggleMd(id, false);
                            addMarkdownCell(val.substring(pos), wrapper, true);
                        }
                    }

                    document.onclick = () => document.getElementById('context-menu').classList.add('hidden');
                    window.onload = init;
                </script>
            </body>
            </html>
        `;

        // Write the content into the iframe
        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write(iframeContent);
        iframe.contentWindow.document.close();
    }
}
