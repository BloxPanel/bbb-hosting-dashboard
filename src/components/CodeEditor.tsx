import { useEffect, useRef } from "react";
import { indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { searchPanelOpen } from "@codemirror/search";
import {
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { WrapText } from "lucide-react";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";

const bbbHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c6a0d8" },
  { tag: [tags.name, tags.variableName], color: "#c8d2df" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#82b8c2" },
  { tag: [tags.propertyName, tags.attributeName], color: "#d2b37c" },
  { tag: [tags.string, tags.attributeValue], color: "#a9c49b" },
  { tag: [tags.number, tags.bool, tags.null], color: "#d5a77f" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#d7c18b" },
  { tag: [tags.tagName, tags.heading], color: "#d18d9c" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "#9baabd" },
  { tag: tags.comment, color: "#8997aa", fontStyle: "italic" },
  { tag: tags.meta, color: "#8292a6" },
  { tag: tags.invalid, color: "#f1e7e8", backgroundColor: "#633c47" },
]);

function languageFor(path: string) {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (["html", "htm"].includes(extension)) return html();
  if (extension === "css") return css();
  if (["js", "mjs"].includes(extension)) return javascript();
  if (["json", "webmanifest"].includes(extension)) return json();
  if (extension === "md") return markdown();
  if (extension === "xml") return xml();
  return [];
}

export function CodeEditor({
  path,
  content,
  lineSeparator,
  wrap,
  onChange,
  onCursorChange,
  onToggleWrap,
  onSave,
  onEditorExit,
}: {
  path: string;
  content: string;
  lineSeparator: string;
  wrap: boolean;
  onChange: (content: string) => void;
  onCursorChange: (position: { line: number; column: number }) => void;
  onToggleWrap: () => void;
  onSave: () => void;
  onEditorExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const wrapButton = useRef<HTMLButtonElement>(null);
  const initialContent = useRef(content).current;
  const initialWrap = useRef(wrap).current;
  const wrapping = useRef(new Compartment()).current;
  const viewRef = useRef<EditorView | null>(null);
  const saveRef = useRef(onSave);
  const changeRef = useRef(onChange);
  const cursorRef = useRef(onCursorChange);
  const exitRef = useRef(onEditorExit);
  saveRef.current = onSave;
  changeRef.current = onChange;
  cursorRef.current = onCursorChange;
  exitRef.current = onEditorExit;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          basicSetup,
          languageFor(path),
          EditorState.lineSeparator.of(lineSeparator),
          EditorState.tabSize.of(2),
          indentUnit.of("\t"),
          bracketMatching(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          syntaxHighlighting(bbbHighlightStyle),
          wrapping.of(initialWrap ? EditorView.lineWrapping : []),
          EditorView.contentAttributes.of({
            "aria-label": `Code editor for ${path}`,
            "aria-describedby": "editor-keyboard-help",
          }),
          Prec.highest(
            keymap.of([
              {
                key: "Escape",
                run: (view) => {
                  if (searchPanelOpen(view.state)) return false;
                  if (view.contentDOM === document.activeElement) {
                    wrapButton.current?.focus();
                    return true;
                  }
                  exitRef.current();
                  return true;
                },
              },
            ]),
          ),
          keymap.of([
            indentWithTab,
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                saveRef.current();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changeRef.current(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const position = update.state.selection.main.head;
              const line = update.state.doc.lineAt(position);
              cursorRef.current({ line: line.number, column: position - line.from + 1 });
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              color: "#d5deea",
              backgroundColor: "#111821",
              fontSize: "13px",
            },
            "&.cm-focused": { outline: "2px solid #4cbbd5", outlineOffset: "-2px" },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
              lineHeight: "1.65",
            },
            ".cm-gutters": {
              backgroundColor: "#111821",
              borderColor: "#283342",
              color: "#68788d",
              minWidth: "48px",
            },
            ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 8px" },
            ".cm-activeLineGutter": { backgroundColor: "#1c2734", color: "#bdc9d8" },
            ".cm-activeLine": { backgroundColor: "#19232f" },
            ".cm-cursor": { borderLeftColor: "#e6af45" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor: "#34485c !important",
            },
            ".cm-matchingBracket": {
              color: "#e5c785 !important",
              backgroundColor: "#344333",
              outline: "1px solid #536a4c",
            },
          }),
        ],
      }),
      parent: host.current,
    });
    viewRef.current = view;
    const position = view.state.selection.main.head;
    const line = view.state.doc.lineAt(position);
    cursorRef.current({ line: line.number, column: position - line.from + 1 });
    view.focus();
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [initialContent, initialWrap, lineSeparator, path, wrapping]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap, wrapping]);

  return (
    <section className="code-editor-panel" aria-label="Source editor">
      <div className="editor-toolbar">
        <button
          ref={wrapButton}
          type="button"
          className="editor-wrap-toggle"
          aria-label="Toggle line wrapping"
          aria-pressed={wrap}
          title="Toggle line wrapping"
          onClick={onToggleWrap}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              exitRef.current();
            }
          }}
        >
          <WrapText size={15} />
          <span>Wrap lines</span>
        </button>
        <span className="editor-tab-setting" id="editor-keyboard-help">
          Tab/Shift+Tab indent · Esc closes Find; editor Esc {"->"} Wrap lines {"->"} Esc {"->"} Close · Ctrl+S save · Ctrl+F find
        </span>
      </div>
      <div className="code-editor" ref={host} />
    </section>
  );
}