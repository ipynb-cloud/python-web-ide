(function () {
    if (window.MoodleWidgetSystemInitialized) return;
    window.MoodleWidgetSystemInitialized = true;

    function hashCode(str) {
        let hash = 0;
        for (let i = 0, len = str.length; i < len; i++) {
            let chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr; hash |= 0;
        }
        return hash.toString();
    }

    function initWidget(mountPoint) {
        const que = mountPoint.closest('.que');
        if (!que) return;

        const targetTextarea = que.querySelector('textarea.qtype_essay_response, textarea.form-control, textarea.qtype_coderunner_answer');
        if (!targetTextarea) return;

        const isReadOnly = targetTextarea.hasAttribute('readonly') || targetTextarea.hasAttribute('disabled');
        const initialHeight = parseInt(mountPoint.style.height) || 380;
        
        // Find the iframe you pasted into the Moodle HTML
        const iframe = mountPoint.querySelector('iframe');
        if (!iframe) return;

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
                const targetHeight = Math.max(initialHeight, event.data.payload);
                if (parseInt(mountPoint.style.height) !== targetHeight) {
                    mountPoint.style.height = `${targetHeight}px`;
                }
            }
        });

        // Race condition fix: Push data immediately in case iframe booted faster than this script
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'LOAD_CONTENT',
                payload: targetTextarea.value,
                config: { isReadOnly: isReadOnly }
            }, '*');
        }
    }

    // Fallback Watcher: Just in case the inline script was stripped or missed something
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType === 1) { 
                const que = node.classList.contains('que') ? node : node.closest('.que');
                if (que && que.querySelector('.widget-mount-point')) {
                    const ta = que.querySelector('textarea.qtype_essay_response, textarea.form-control, textarea.qtype_coderunner_answer');
                    if (ta) Object.assign(ta.style, { position: 'absolute', left: '-9999px', visibility: 'hidden' });
                }
            }
        }));
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
