(function () {
    // 1. Singleton Lock: Prevent multiple executions on the same page
    if (window.MoodleWidgetSystemInitialized) return;
    window.MoodleWidgetSystemInitialized = true;

    // 2. The Widget UI (This is the HTML that goes inside the iframe)
    const WIDGET_HTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { margin: 0; padding: 10px; font-family: monospace; background: #e5e7eb; min-height: 100vh; position: relative; box-sizing: border-box; }
                pre { margin: 0; outline: none; white-space: pre-wrap; word-wrap: break-word; min-height: 100vh; transition: opacity 0.3s; }
                .modal-overlay { display: flex; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.8); z-index: 50; align-items: center; justify-content: center; flex-direction: column; }
                .modal-content { background: white; padding: 1.5rem 2rem; border-radius: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); text-align: center; font-family: sans-serif; border: 1px solid #e5e7eb; }
                .modal-content p { margin: 0 0 1rem 0; font-weight: bold; color: #ef4444; }
                .modal-content button { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; font-weight: bold; cursor: pointer; }
                .spinner { border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; width: 14px; height: 14px; animation: spin 1s linear infinite; margin-left: 8px; display: none; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div id="error-modal" class="modal-overlay">
                <div class="modal-content">
                    <p>Widget disconnected</p>
                    <button id="reconnect-btn">
                        <span id="btn-text">Try to connect</span>
                        <span id="btn-spinner" class="spinner"></span>
                    </button>
                </div>
            </div>
            <pre id="editor" contenteditable="false" spellcheck="false">// Loading...</pre>
            
            <script>
                const editor = document.getElementById('editor');
                const errorModal = document.getElementById('error-modal');
                const reconnectBtn = document.getElementById('reconnect-btn');
                const btnSpinner = document.getElementById('btn-spinner');
                const btnText = document.getElementById('btn-text');

                let pendingSyncId = null;
                let syncTimeout = null;

                function hashCode(str) {
                    let hash = 0;
                    for (let i = 0, len = str.length; i < len; i++) {
                        let chr = str.charCodeAt(i);
                        hash = (hash << 5) - hash + chr; hash |= 0;
                    }
                    return hash.toString();
                }

                function lockWidget() {
                    editor.setAttribute('contenteditable', 'false');
                    editor.style.opacity = '0.5';
                    errorModal.style.display = 'flex';
                }

                function unlockWidget() {
                    editor.setAttribute('contenteditable', 'true');
                    editor.style.opacity = '1';
                    errorModal.style.display = 'none';
                    btnSpinner.style.display = 'none';
                    btnText.innerText = 'Try to connect';
                    reconnectBtn.disabled = false;
                }

                function syncToServer() {
                    const content = editor.innerText;
                    pendingSyncId = Date.now().toString() + Math.random().toString();
                    
                    window.parent.postMessage({ 
                        type: 'SYNC_CONTENT', 
                        payload: content, 
                        hash: hashCode(content), 
                        msgId: pendingSyncId 
                    }, '*');
                    
                    // Wait for receipt
                    clearTimeout(syncTimeout);
                    syncTimeout = setTimeout(lockWidget, 500);
                }

                editor.addEventListener('input', () => {
                    syncToServer();
                    window.parent.postMessage({ type: 'SYNC_HEIGHT', payload: document.body.scrollHeight }, '*');
                });

                reconnectBtn.addEventListener('click', () => {
                    btnSpinner.style.display = 'inline-block';
                    btnText.innerText = 'Connecting...';
                    reconnectBtn.disabled = true;
                    
                    if (editor.innerText === '// Loading...') {
                        window.parent.postMessage({ type: 'REQUEST_CONTENT' }, '*');
                    } else {
                        syncToServer(); // Force "Last Writer Wins" push
                    }
                    
                    syncTimeout = setTimeout(() => {
                        btnSpinner.style.display = 'none';
                        btnText.innerText = 'Try to connect';
                        reconnectBtn.disabled = false;
                    }, 1000);
                });

                window.addEventListener('message', (event) => {
                    if (event.data.type === 'LOAD_CONTENT') {
                        editor.innerText = event.data.payload;
                        if (event.data.config && event.data.config.isReadOnly) {
                            editor.setAttribute('contenteditable', 'false');
                            errorModal.style.display = 'none'; // Clear modal, but leave locked
                        } else {
                            unlockWidget();
                        }
                        clearTimeout(syncTimeout);
                        setTimeout(() => window.parent.postMessage({ type: 'SYNC_HEIGHT', payload: document.body.scrollHeight }, '*'), 50);
                    } else if (event.data.type === 'ACK_CONTENT' && event.data.msgId === pendingSyncId) {
                        if (event.data.hash === hashCode(editor.innerText)) {
                            clearTimeout(syncTimeout);
                            unlockWidget();
                        } else {
                            lockWidget();
                        }
                    }
                });

                // Request initial content on boot
                window.parent.postMessage({ type: 'REQUEST_CONTENT' }, '*');
                syncTimeout = setTimeout(lockWidget, 500);
                
                new ResizeObserver(() => window.parent.postMessage({ type: 'SYNC_HEIGHT', payload: document.body.scrollHeight }, '*')).observe(document.body);
            <\\/script>
        </body>
        </html>
    `.replace(/\\/g, ''); // Clean escape character for closing script tag

    // 3. Helper: Simple String Hash
    function hashCode(str) {
        let hash = 0;
        for (let i = 0, len = str.length; i < len; i++) {
            let chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr; hash |= 0;
        }
        return hash.toString();
    }

    // 4. Initialize a specific widget instance
    function initWidget(mountPoint) {
        // Find the Moodle question container
        const questionContainer = mountPoint.closest('.que');
        if (!questionContainer) return;

        // Find the specific essay textarea
        const targetTextarea = questionContainer.querySelector('textarea.qtype_essay_response, textarea.form-control');
        if (!targetTextarea) return;

        // Check if Moodle is in review mode (read-only)
        const isReadOnly = targetTextarea.hasAttribute('readonly') || targetTextarea.hasAttribute('disabled');

        // WIPE OUT any dead iframe Moodle might have saved, and build a fresh one
        mountPoint.innerHTML = ''; 
        
        const initialLines = parseInt(mountPoint.getAttribute('data-initial-lines') || '15', 10);
        mountPoint.style.height = \`\${(initialLines * 24) + 20}px\`;
        mountPoint.style.position = 'relative';

        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.display = 'block';
        iframe.style.border = '1px solid #ccc';
        iframe.style.borderRadius = '4px';
        iframe.srcdoc = WIDGET_HTML;

        mountPoint.appendChild(iframe);

        // Listen for messages ONLY from this specific iframe
        window.addEventListener('message', (event) => {
            if (event.source !== iframe.contentWindow) return;

            if (event.data.type === 'REQUEST_CONTENT') {
                iframe.contentWindow.postMessage({
                    type: 'LOAD_CONTENT',
                    payload: targetTextarea.value,
                    config: { isReadOnly: isReadOnly }
                }, '*');
            } 
            else if (event.data.type === 'SYNC_CONTENT') {
                // Update native Moodle textarea
                targetTextarea.value = event.data.payload;
                
                // Force Moodle Autosave to trigger
                targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));

                // Send Acknowledgement
                iframe.contentWindow.postMessage({
                    type: 'ACK_CONTENT',
                    msgId: event.data.msgId,
                    hash: hashCode(targetTextarea.value)
                }, '*');
            }
            else if (event.data.type === 'SYNC_HEIGHT') {
                const newHeight = event.data.payload;
                if (!mountPoint.style.height || parseInt(mountPoint.style.height) < newHeight) {
                    mountPoint.style.height = \`\${newHeight}px\`;
                }
            }
        });
    }

    // 5. The Watcher: Hides native textareas immediately before visual flash
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { 
                    const queContainer = node.classList.contains('que') ? node : node.closest('.que');
                    if (queContainer && queContainer.querySelector('.widget-mount-point')) {
                        const ta = queContainer.querySelector('textarea.qtype_essay_response, textarea.form-control');
                        if (ta) {
                            Object.assign(ta.style, {
                                position: 'absolute', width: '1px', height: '1px', padding: '0', 
                                margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: '0'
                            });
                            ta.tabIndex = -1;
                        }
                    }
                }
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 6. Boot up any widgets currently on the page
    function bootWidgets() {
        document.querySelectorAll('.widget-mount-point:not([data-widget-initialized])').forEach(mount => {
            mount.setAttribute('data-widget-initialized', 'true');
            initWidget(mount);
        });
    }

    // Run boot immediately in case DOM is already ready, and bind to DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootWidgets);
    } else {
        bootWidgets();
    }
})();
