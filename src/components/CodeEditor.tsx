import { useEffect, useRef } from "react";
import { indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
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
  { tag: tags.comment, color: "#748398", fontStyle: "italic" },
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
}: {
  path: string;
  content: string;
  lineSeparator: string;
  wrap: boolean;
  onChange: (content: string) => void;
  onCursorChange: (position: { line: number; column: number }) => void;
  onToggleWrap: () => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialContent = useRef(content).current;
  const initialWrap = useRef(wrap).current;
  const wrapping = useRef(new Compartment()).current;
  const viewRef = useRef<EditorView | null>(null);
  const saveRef = useRef(onSave);
  const changeRef = useRef(onChange);
  const cursorRef = useRef(onCursorChange);
  saveRef.current = onSave;
  changeRef.current = onChange;
  cursorRef.current = onCursorChange;

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
          EditorView.contentAttributes.of({ "aria-label": `Code editor for ${path}` }),
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
            "&.cm-focused": { outline: "none" },
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
            ".cm-panels": {
              backgroundColor: "#19222d",
              color: "#d5deea",
              borderColor: "#2d3b4b",
            },
            ".cm-panels input, .cm-panels button": {
              borderColor: "#405068",
              borderRadius: "4px",
              backgroundColor: "#111821",
              color: "#d5deea",
            },
            ".cm-panels button:hover": {
              backgroundColor: "#263445",
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
          type="button"
          className="editor-wrap-toggle"
          aria-label="Toggle line wrapping"
          aria-pressed={wrap}
          title="Toggle line wrapping"
          onClick={onToggleWrap}
        >
          <WrapText size={15} />
          <span>Wrap lines</span>
        </button>
        <span className="editor-tab-setting">Indent: tabs</span>
      </div>
      <div className="code-editor" ref={host} />
    </section>
  );
}