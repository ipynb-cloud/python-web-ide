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

    // UPDATED: Now extracts data-show-top-bar
    function extractWidgetConfig(mountPoint, isReadOnly) {
        const config = {
            isReadOnly: isReadOnly,
            lockAllMarkdown: mountPoint.getAttribute('data-lock-markdown') === 'true',
            disableTypeChange: mountPoint.getAttribute('data-disable-type-change') === 'true',
            hideCellToolbar: mountPoint.getAttribute('data-hide-cell-toolbar') === 'true',
            showTopBar: mountPoint.getAttribute('data-show-top-bar') === 'true',
            defaultCellType: mountPoint.getAttribute('data-default-cell-type') || 'code'
        };

        if (mountPoint.dataset.config) {
            try { Object.assign(config, JSON.parse(mountPoint.dataset.config)); } 
            catch (e) { console.warn("Invalid data-config JSON", e); }
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
            let rawText = templateEl.tagName === 'TEMPLATE' ? templateEl.innerHTML : (templateEl.textContent || templateEl.innerText);
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
                // UPDATED: Remove initialHeight lock. Allow it to shrink to the content's height (min 150px)
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
