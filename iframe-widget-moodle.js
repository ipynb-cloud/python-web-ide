
import { WidgetHostCore } from './iframe-widget-core.js';

(function bootstrapMoodleWidgets() {
    if (window.WidgetSystemInitialized) return;
    window.WidgetSystemInitialized = true;
    window.ActiveWidgetCores = [];

    // 1. HELPER: Visually hide a textarea safely
    function hideTextareaSafely(ta) {
        if (!ta || ta.hasAttribute('data-widget-hidden')) return;
        ta.style.cssText = 'position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; border: 0 !important;';
        ta.tabIndex = -1;
        ta.setAttribute('data-widget-hidden', 'true');
        ta.classList.add('widget-controlled-ta'); 
    }

    // 2. HELPER: Find textareas in questions that HAVE a widget mount point
    function scanAndHideTextareas(rootNode = document) {
        const mountPoints = rootNode.querySelectorAll('.widget-mount-point');
        mountPoints.forEach(mount => {
            const queContainer = mount.closest('.que');
            if (queContainer) {
                const ta = queContainer.querySelector('textarea'); 
                if (ta) hideTextareaSafely(ta);
            }
        });
    }

    // Immediately scan DOM in case script is loaded late
    scanAndHideTextareas();

    // 3. THE WATCHER: Catch dynamic question loads before they paint
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { 
                    if (node.classList && (node.classList.contains('que') || node.classList.contains('widget-mount-point')) || node.querySelector('.widget-mount-point')) {
                        scanAndHideTextareas(node.nodeType === 1 && !node.classList.contains('que') ? document : node);
                    }
                }
            });
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 4. INITIALIZER: Spin up the core logic for each mount point
    function initWidgets() {
        const mountPoints = document.querySelectorAll('.widget-mount-point');
        
        mountPoints.forEach(mount => {
            if (mount.hasAttribute('data-widget-initialized')) return;
            mount.setAttribute('data-widget-initialized', 'true');

            const queContainer = mount.closest('.que');
            if (!queContainer) return;

            const targetTextarea = queContainer.querySelector('textarea');
            if (!targetTextarea) return;

            const isReadOnly = targetTextarea.hasAttribute('readonly') || targetTextarea.hasAttribute('disabled');
            const logId = queContainer.id + '-log';
            const logger = document.getElementById(logId);
            const logFunc = logger ? (msg) => { logger.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`; } : console.log;

            const iframeSource = window.WIDGET_IFRAME_SOURCE || '';

            const core = new WidgetHostCore(mount, {
                srcdoc: iframeSource,
                isReadOnly: isReadOnly,
                initialLines: parseInt(mount.getAttribute('data-initial-lines') || '15'),
                getContent: () => targetTextarea.value, 
                onLog: logFunc,
                onChange: (content) => {
                    targetTextarea.value = content;
                    targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                    return targetTextarea.value; 
                }
            });

            window.ActiveWidgetCores.push(core);
            logFunc('Adapter attached. Widget booted.');
        });
    }

    // CRITICAL FIX: Run immediately if DOM is already ready, otherwise wait for event.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidgets);
    } else {
        initWidgets();
    }
})();
