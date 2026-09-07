window.PyNoteAutocomplete = {
    
    customVariableCompletions: function(context) {
        let word = context.matchBefore(/[a-zA-Z_]\w*/);

        if (!context.explicit) {
            if (!word || word.text.length < 4) return null;
        } else {
            if (!word) return null;
        }

        let allCodeText = context.state.doc.toString();

        // Cross-cell discovery: Grab text from all other notebook code cells
        if (typeof window !== 'undefined' && window.notebookCore && window.notebookCore.container) {
            const codeCells = window.notebookCore.container.querySelectorAll('notebook-code-cell');
            let combined = [];
            codeCells.forEach(cell => {
                if (cell.editorView) combined.push(cell.editorView.state.doc.toString());
                else if (cell.content) combined.push(cell.content);
            });
            if (combined.length > 0) allCodeText = combined.join('\n');
        }

        let identifiers = allCodeText.match(/\b[a-zA-Z_]\w*\b/g) || [];

        const pythonKeywords = new Set([
            'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 
            'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 
            'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 
            'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 
            'with', 'yield', 'print', 'range', 'len', 'int', 'str', 'float', 'list', 'dict', 'set'
        ]);

        let variables = [...new Set(identifiers)].filter(v => 
            !pythonKeywords.has(v) && v !== word.text
        );

        if (variables.length === 0) return null;

        return {
            from: word.from,
            options: variables.map(v => ({ label: v, type: "variable", boost: 1 }))
        };
    },

    getExtensions: function(mode) {
        // If the bundle hasn't loaded or didn't expose autocomplete, fail gracefully
        if (typeof cm6 === 'undefined' || !cm6.autocomplete) return [];

        const baseKeymap = [
            { key: "Tab", run: (view) => cm6.autocomplete.acceptCompletion(view) || cm6.commands.indentMore(view) },
            { key: "Shift-Tab", run: cm6.commands.indentLess }
        ];

        if (mode === "off") {
            return [
                cm6.keymap.of([
                    { key: "Tab", run: cm6.commands.indentMore },
                    { key: "Shift-Tab", run: cm6.commands.indentLess }
                ])
            ];
        }

        if (mode === "custom") {
            return [
                cm6.keymap.of(baseKeymap),
                cm6.autocomplete.autocompletion({
                    override: [this.customVariableCompletions],
                    activateOnTyping: true,
                    maxRenderedOptions: 10
                })
            ];
        }

        if (mode === "full") {
            return [
                cm6.keymap.of(baseKeymap),
                cm6.autocomplete.autocompletion({ activateOnTyping: true })
            ];
        }

        return [cm6.keymap.of(baseKeymap)];
    }
};