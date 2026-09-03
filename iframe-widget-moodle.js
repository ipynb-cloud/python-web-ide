(function () {
    if (window.MoodleWidgetSystemInitialized) return;
    window.MoodleWidgetSystemInitialized = true;

    // Helper: Simple String Hash
    function hashCode(str) {
        let hash = 0;
        for (let i = 0, len = str.length; i < len; i++) {
            let chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr; hash |= 0;
        }
        return hash.toString();
    }

    function initWidget(mountPoint) {
        const questionContainer = mountPoint.closest('.que');
        if (!questionContainer) return;

        const targetTextarea = questionContainer.querySelector('textarea.qtype_essay_response, textarea.form-control, textarea.qtype_coderunner_answer');
        if (!targetTextarea) return;

        const isReadOnly = targetTextarea.hasAttribute('readonly') || targetTextarea.hasAttribute('disabled');

        // Clear placeholder and build iframe using standard SRC, not SRCDOC
        mountPoint.innerHTML = ''; 
        
        const initialLines = parseInt(mountPoint.getAttribute('data-initial-lines') || '15', 10);
        mountPoint.style.height = `${(initialLines * 24) + 20}px`;
        mountPoint.style.position = 'relative';

        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.display = 'block';
        iframe.style.border = '1px solid #ccc';
        iframe.style.borderRadius = '4px';
        // Point to the UI file you hosted on Cloudflare!
        iframe.src = 'https://python-web-ide.pages.dev/widget.html';

        mountPoint.appendChild(iframe);

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
                targetTextarea.value = event.data.payload;
                targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));

                iframe.contentWindow.postMessage({
                    type: 'ACK_CONTENT',
                    msgId: event.data.msgId,
                    hash: hashCode(targetTextarea.value)
                }, '*');
            }
            else if (event.data.type === 'SYNC_HEIGHT') {
                const newHeight = event.data.payload;
                if (!mountPoint.style.height || parseInt(mountPoint.style.height) < newHeight) {
                    mountPoint.style.height = `${newHeight}px`;
                }
            }
        });
    }

    // The Watcher: Hides native textareas immediately
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { 
                    const queContainer = node.classList.contains('que') ? node : node.closest('.que');
                    if (queContainer && queContainer.querySelector('.widget-mount-point')) {
                        const ta = queContainer.querySelector('textarea.qtype_essay_response, textarea.form-control, textarea.qtype_coderunner_answer');
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

    function bootWidgets() {
        document.querySelectorAll('.widget-mount-point:not([data-widget-initialized])').forEach(mount => {
            mount.setAttribute('data-widget-initialized', 'true');
            initWidget(mount);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootWidgets);
    } else {
        bootWidgets();
    }
})();