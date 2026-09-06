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

    // Python-style dedent to fix global indentation added by Moodle editors
    function stripGlobalIndent(text) {
        const lines = text.split('\n');
        
        // Strip leading/trailing purely empty lines
        while(lines.length > 0 && lines[0].trim() === '') lines.shift();
        while(lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

        let minIndent = Infinity;
        for (const line of lines) {
            if (line.trim().length > 0) {
                const indent = line.match(/^\s*/)[0].length;
                if (indent < minIndent) minIndent = indent;
            }
        }

        if (minIndent !== Infinity && minIndent > 0) {
            return lines.map(line => line.length >= minIndent ? line.substring(minIndent) : line).join('\n');
        }
        return lines.join('\n');
    }

    function initWidget(mountPoint) {
        const que = mountPoint.closest('.que');
        if (!que) return;

        const targetTextarea = que.querySelector('textarea.qtype_essay_response, textarea.form-control, textarea.qtype_coderunner_answer');
        if (!targetTextarea) return;

        // Belt & Suspenders: Ensure the textarea is hidden directly via JS styles
        Object.assign(targetTextarea.style, { 
            position: 'absolute', left: '-9999px', visibility: 'hidden', height: '1px' 
        });

        const isReadOnly = targetTextarea.hasAttribute('readonly') || targetTextarea.hasAttribute('disabled');
        const initialHeight = parseInt(mountPoint.style.height) || 380;
        
        // --- TEMPLATE SEEDING & DEDENT LOGIC ---
        let initialPayload = targetTextarea.value;
        if (!initialPayload || initialPayload.trim() === '') {
            // Support both <template> and <pre> as source containers
            const sourceNode = que.querySelector('template.widget-initial-state, pre.widget-initial-state');
            
            if (sourceNode) {
                let rawText = sourceNode.tagName.toLowerCase() === 'template' ? sourceNode.innerHTML : sourceNode.textContent;
                
                // Decode HTML entities
                const txt = document.createElement("textarea");
                txt.innerHTML = rawText;
                
                initialPayload = stripGlobalIndent(txt.value);
                
                // Seed the textarea
                targetTextarea.value = initialPayload;
                targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        const iframe = mountPoint.querySelector('iframe');
        if (!iframe) return;

        // --- TRANSFORM PLACEHOLDER TO LIVE WIDGET ---
        const placeholder = mountPoint.querySelector('.widget-placeholder');
        if (placeholder) placeholder.style.display = 'none'; // Hide <<notebook IDE widget>>
        
        // Strip the dashed border and background used for the editor placeholder
        Object.assign(mountPoint.style, {
            display: 'block', background: 'transparent', border: 'none', padding: '0'
        });
        iframe.style.display = 'block';

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
                
                // Fade the iframe in now that the size is perfectly calculated
                if (iframe.style.opacity === '0' || iframe.style.opacity === '') {
                    iframe.style.opacity = '1';
                }
            }
        });

        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'LOAD_CONTENT',
                payload: targetTextarea.value,
                config: { isReadOnly: isReadOnly }
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
