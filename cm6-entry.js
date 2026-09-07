// cm6-entry.js (Your bundler entry point)

import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { indentMore, indentLess } from "@codemirror/commands";
import { search, openSearchPanel } from "@codemirror/search";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { customVariableCompletions } from './cm6-autocomplete.js'; 

// 1. Unified PyNote Theme
const pynoteTheme = EditorView.theme({
    "&": { backgroundColor: "transparent" },
    ".cm-scroller": { fontFamily: "'Fira Code', monospace", fontSize: "14px" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#3b82f6" },
    "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#bfdbfe" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-gutters": { backgroundColor: "transparent", borderRight: "none", color: "#94a3b8" },
    ".cm-tooltip-autocomplete": { fontFamily: "'Fira Code', monospace", fontSize: "13px" }
});

// 2. The Autocomplete Router
function getAutocompleteExtensions(mode = "custom") {
  const baseKeymap = [
    { key: "Tab", run: (view) => acceptCompletion(view) || indentMore(view) },
    { key: "Shift-Tab", run: indentLess }
  ];

  if (mode === "off") {
    return [
      keymap.of([
        { key: "Tab", run: indentMore },
        { key: "Shift-Tab", run: indentLess }
      ])
    ];
  }

  if (mode === "custom") {
    return [
      keymap.of(baseKeymap),
      autocompletion({
        override: [customVariableCompletions],
        activateOnTyping: true, // Triggers only when custom function allows (>= 4 chars)
        maxRenderedOptions: 10
      })
    ];
  }

  if (mode === "full") {
    return [
      keymap.of(baseKeymap),
      autocompletion({ activateOnTyping: true })
    ];
  }

  return [keymap.of(baseKeymap)];
}

// 3. Expose to global window
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
    
    // Keyboard Bindings & Search
    keymap,
    commands: { indentMore, indentLess },
    search,
    openSearchPanel,
    autocompletion,
    
    // PyNote Custom Helpers
    getAutocompleteExtensions,
    pynoteTheme,
    
    createEditorState: (doc, options = {}) => EditorState.create({ doc, ...options }),
    createEditorView: (state, parent) => new EditorView({ state, parent })
};