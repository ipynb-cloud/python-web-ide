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

    function dedent(str) {
        const match = str.match(/^[ \t]*(?=\S)/gm);
        if (!match) return str;
        const indent = Math.min(...match.map(el => el.length));
        const re = new RegExp(`^[ \\t]{${indent}}`, 'gm');
        return str.replace(re, '');
    }

    function extractWidgetConfig(mountPoint, isReadOnly) {
        // Base defaults
        const config = {
            isReadOnly: isReadOnly,
            defaultCellType: 'code'
        };

        // Find the JSON block and merge it in
        const configScript = mountPoint.querySelector('script.widget-config');
        if (configScript) {
            try {
                const parsed = JSON.parse(configScript.textContent);
                Object.assign(config, parsed);
            } catch (e) {
                console.error("PyNote: Invalid JSON in widget-config", e);
            }
        }
        
        // Force disables if globally readonly
        if (isReadOnly) {
            config.disableInsertAll = true;
        }

        return config;
    }

    function initWidget(mountPoint) {
        const que = mountPoint.closest('.que');
        if (!que) return;

        const targetTextarea = que.querySelector('textarea.qtype_essay_response, textarea.form-control, textarea.qtype_coderunner_answer');
        if (!targetTextarea) return;

        Object.assign(targetTextarea.style, { 
            position: 'absolute', left: '-9999px', visibility: 'hidden', height: '1px' 
        });

        const isReadOnly = targetTextarea.hasAttribute('readonly') || targetTextarea.hasAttribute('disabled');
        const widgetConfig = extractWidgetConfig(mountPoint, isReadOnly);
        
        let initialPayload = targetTextarea.value;
        const templateEl = que.querySelector('.widget-initial-state');
        
        if ((!initialPayload || initialPayload.trim() === '') && templateEl) {
            let rawText = '';
            if (templateEl.tagName === 'TEMPLATE') {
                rawText = templateEl.innerHTML;
            } else if (templateEl.tagName === 'TEXTAREA') {
                rawText = templateEl.value; // Textareas safely preserve all newlines!
            } else {
                rawText = templateEl.innerText || templateEl.textContent;
            }
            
            initialPayload = dedent(rawText.replace(/^\s*\n/, '')).trimEnd();
            targetTextarea.value = initialPayload;
            targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (templateEl) templateEl.style.display = 'none';

        const placeholder = mountPoint.querySelector('.widget-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        mountPoint.style.border = 'none';
        mountPoint.style.background = 'transparent';

        const iframe = mountPoint.querySelector('iframe');
        if (!iframe) return;

        window.addEventListener('message', (event) => {
            if (event.source !== iframe.contentWindow) return;

            if (event.data.type === 'REQUEST_CONTENT') {
                iframe.contentWindow.postMessage({
                    type: 'LOAD_CONTENT',
                    payload: targetTextarea.value,
                    config: widgetConfig
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
                // Allow it to shrink to the content's height (min 150px)
                const targetHeight = Math.max(150, event.data.payload);
                
                if (parseInt(mountPoint.style.height) !== targetHeight) {
                    mountPoint.style.height = `${targetHeight}px`;
                }
                
                if (iframe.style.opacity === '0' || iframe.style.opacity === '') {
                    iframe.style.opacity = '1';
                }
            }
        });

        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'LOAD_CONTENT',
                payload: targetTextarea.value,
                config: widgetConfig
            }, '*');
        }
    }

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
