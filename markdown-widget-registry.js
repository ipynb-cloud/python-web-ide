window.MarkdownWidgetRegistry = {
    widgets: {},
    
    // Plugins call this to register themselves (e.g., lang: 'csv')
    register: function(lang, renderCallback) {
        this.widgets[lang] = renderCallback;
    },
    
    // The cell calls this to see if a plugin exists for the language
    process: function(lang, preElement, codeText, cellInstance) {
        if (this.widgets[lang]) {
            return this.widgets[lang](preElement, codeText, cellInstance);
        }
        return false; // No plugin found, use default fallback
    }
};