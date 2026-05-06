
(function() {
    const textareaSelector = 'textarea[name*="_answer"]';

    window.addEventListener('message', function(event) {
        // 1. Reply to Ping to establish connection
        if (event.data && event.data.type === 'moodle-ping') {
            if (event.source) {
                event.source.postMessage({ type: 'moodle-pong' }, event.origin || '*');
            }
            return;
        }

        // 2. Handle both manual submits and auto-syncs
        if (event.data && (event.data.type === 'moodle-submit-code' || event.data.type === 'moodle-sync-code')) {
            const targetTextArea = document.querySelector(textareaSelector);
            if (targetTextArea) {
                targetTextArea.value = event.data.content;
                targetTextArea.dispatchEvent(new Event('change', { bubbles: true }));
                targetTextArea.dispatchEvent(new Event('input', { bubbles: true }));

                // Acknowledge receipt by echoing the hash back
                if (event.source) {
                    event.source.postMessage({
                        type: 'moodle-sync-ack',
                        hash: event.data.hash
                    }, event.origin || '*');
                }
            }
        }
    });
})();
