import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { indentMore, indentLess } from "@codemirror/commands";
import { search, openSearchPanel } from "@codemirror/search";

// Expose the necessary modules to the global window.cm6 object  
// This exact structure matches what code-cells.js is looking for.
window.cm6 = {
    // Core Classes
    EditorView,
    EditorState,
    
    // Extensions & Language
    basicSetup,
    python,
    
    // Formatting & Indentation
    language: { indentUnit },
    state: { EditorState },
    view: { EditorView },
    
    // Keyboard Bindings
    keymap,
    commands: { indentMore, indentLess },
    
    // Helper Functions
    createEditorState: (doc, options = {}) => EditorState.create({ doc, ...options }),
    createEditorView: (state, parent) => new EditorView({ state, parent }),
    
    // Legacy support for your original bundle
    openSearchPanel
};
