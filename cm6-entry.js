import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { indentMore, indentLess } from "@codemirror/commands";
import { search, openSearchPanel } from "@codemirror/search";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";

// Import your custom logic[cite: 11]
import { customVariableCompletions } from './cm6-autocomplete.js'; 

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
      ]),
      // Overrides basicSetup to fully suppress popups
      autocompletion({ override: [() => null] })
    ];
  }

  if (mode === "custom") {
    return [
      keymap.of(baseKeymap),
      autocompletion({
        override: [customVariableCompletions],
        activateOnTyping: true, 
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

// Optional: A unified PyNote Theme to keep CSS minimal
const pynoteTheme = EditorView.theme({
    "&": { backgroundColor: "transparent" },
    ".cm-scroller": { fontFamily: "'Fira Code', monospace", fontSize: "14px" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#3b82f6" },
    "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#bfdbfe" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-gutters": { backgroundColor: "transparent", borderRight: "none", color: "#94a3b8" }
});

window.cm6 = {
    EditorView, EditorState, basicSetup, python,
    language: { indentUnit }, state: { EditorState }, view: { EditorView },
    keymap, commands: { indentMore, indentLess }, search, openSearchPanel,
    
    // Expose the router and theme to your notebook!
    getAutocompleteExtensions,
    pynoteTheme,
    
    createEditorState: (doc, options = {}) => EditorState.create({ doc, ...options }),
    createEditorView: (state, parent) => new EditorView({ state, parent })
};