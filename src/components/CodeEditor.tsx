import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";

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
  onChange,
  onSave,
}: {
  path: string;
  content: string;
  lineSeparator: string;
  onChange: (content: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const saveRef = useRef(onSave);
  const changeRef = useRef(onChange);
  saveRef.current = onSave;
  changeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          languageFor(path),
          EditorState.lineSeparator.of(lineSeparator),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Editor contents" }),
          keymap.of([
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
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
            ".cm-gutters": { backgroundColor: "#151c28", borderColor: "#2b3546", color: "#738198" },
            ".cm-activeLineGutter": { backgroundColor: "#232d3c" },
            ".cm-activeLine": { backgroundColor: "#182333" },
          }),
        ],
      }),
      parent: host.current,
    });
    view.focus();
    return () => view.destroy();
  }, [content, lineSeparator, path]);

  return <div className="code-editor" ref={host} />;
}