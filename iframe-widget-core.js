
export class WidgetHostCore {
    constructor(containerElement, options = {}) {
        this.container = containerElement;
        this.options = {
            initialLines: options.initialLines || 15,
            lineHeightPx: options.lineHeightPx || 24,
            srcdoc: options.srcdoc || '',
            getContent: options.getContent || (() => ''),
            isReadOnly: options.isReadOnly || false,
            onChange: options.onChange || (() => {}),
            onLog: options.onLog || console.log
        };
        
        this.iframe = null;
        this.resizeObserver = null;
        this.messageListener = this.handleMessage.bind(this);
        
        this.isPaused = false;
        this.init();
    }

    hashCode(str) {
        let hash = 0;
        if (typeof str !== 'string') return "0";
        for (let i = 0, len = str.length; i < len; i++) {
            let chr = str.charCodeAt(i);
            hash = (hash << 5) - hash + chr; hash |= 0;
        }
        return hash.toString();
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        return this.isPaused;
    }

    init() {
        const initialHeight = (this.options.initialLines * this.options.lineHeightPx) + 20; 
        this.container.style.height = `${initialHeight}px`;
        this.container.innerHTML = ''; // Clear placeholder text

        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.display = 'block';
        this.iframe.style.border = 'none';
        this.iframe.srcdoc = this.options.srcdoc;

        window.addEventListener('message', this.messageListener);
        this.container.appendChild(this.iframe);

        this.resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                if (this.iframe && this.iframe.contentWindow) {
                    this.iframe.contentWindow.postMessage({ type: 'SYNC_WIDTH', payload: entry.contentRect.width }, '*');
                }
            }
        });
        this.resizeObserver.observe(this.container);
    }

    handleMessage(event) {
        if (!this.iframe || event.source !== this.iframe.contentWindow) return;
        if (this.isPaused) return; 

        if (event.data.type === 'REQUEST_CONTENT') {
            this.options.onLog('Widget requested content. Sending...');
            const content = this.options.getContent();
            this.sendContent(content, this.options.isReadOnly);
        }
        else if (event.data.type === 'SYNC_CONTENT') {
            // "Last Writer Wins"
            const savedContent = this.options.onChange(event.data.payload);
            const serverHash = this.hashCode(savedContent);
            
            this.iframe.contentWindow.postMessage({
                type: 'ACK_CONTENT',
                msgId: event.data.msgId,
                hash: serverHash
            }, '*');
            
            this.options.onLog('Synced changes and sent receipt.');
        }
        else if (event.data.type === 'SYNC_HEIGHT') {
            const newHeight = event.data.payload;
            if (!this.container.style.height || parseInt(this.container.style.height) < newHeight) {
                this.container.style.height = `${newHeight}px`;
            }
        }
    }

    sendContent(content, isReadOnly = false) {
        if (this.iframe && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage({ 
                type: 'LOAD_CONTENT', 
                payload: content,
                config: { isReadOnly: isReadOnly }
            }, '*');
        }
    }
}
