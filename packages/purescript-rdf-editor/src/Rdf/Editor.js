import { basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { StreamLanguage } from "@codemirror/language";
import { turtle } from "@codemirror/legacy-modes/mode/turtle";

const Json = "Json";
const Turtle = "Turtle";

const editorTheme = EditorView.theme({
  "&": {
    minHeight: "100%",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", monospace",
  },
});

const text = (value) => (value === null || value === undefined ? "" : String(value));

const normalizeMode = (mode) => {
  const raw = text(mode).toLowerCase();
  return raw === "json" ? Json : Turtle;
};

const modeExtension = (mode) =>
  normalizeMode(mode) === Json ? json() : StreamLanguage.define(turtle);

const assertHandle = (handle) => {
  if (!handle || !handle.view || handle.disposed) {
    throw new Error("RDF editor handle is disposed or invalid");
  }
};

export const mountImpl = (element) => (opts) => () => {
  if (!element || typeof element.appendChild !== "function") {
    throw new Error("RDF editor mount target must be a DOM element");
  }

  const callbacks = new Set();
  const modeCompartment = new Compartment();
  const initialMode = normalizeMode(opts.mode);
  const handle = {
    callbacks,
    disposed: false,
    mode: initialMode,
    modeCompartment,
    view: null,
  };

  handle.view = new EditorView({
    parent: element,
    state: EditorState.create({
      doc: text(opts.value),
      extensions: [
        basicSetup,
        editorTheme,
        EditorView.lineWrapping,
        modeCompartment.of(modeExtension(initialMode)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const value = update.state.doc.toString();
          for (const callback of callbacks) {
            callback(value);
          }
        }),
      ],
    }),
  });

  return handle;
};

export const getValue = (handle) => () => {
  assertHandle(handle);
  return handle.view.state.doc.toString();
};

export const setValue = (handle) => (value) => () => {
  assertHandle(handle);
  handle.view.dispatch({
    changes: {
      from: 0,
      to: handle.view.state.doc.length,
      insert: text(value),
    },
  });
};

export const onChange = (handle) => (callback) => () => {
  assertHandle(handle);
  if (typeof callback !== "function") {
    throw new Error("RDF editor change callback must be a function");
  }
  const listener = (value) => callback(value)();
  handle.callbacks.add(listener);
  return () => {
    handle.callbacks.delete(listener);
  };
};

export const setModeImpl = (handle) => (mode) => () => {
  assertHandle(handle);
  const nextMode = normalizeMode(mode);
  handle.mode = nextMode;
  handle.view.dispatch({
    effects: handle.modeCompartment.reconfigure(modeExtension(nextMode)),
  });
};

export const validate = (handle) => () => {
  assertHandle(handle);
  if (handle.mode !== Json) {
    return { ok: true, message: "" };
  }

  try {
    JSON.parse(handle.view.state.doc.toString());
    return { ok: true, message: "" };
  } catch (err) {
    return {
      ok: false,
      message: err && err.message ? String(err.message) : "Invalid JSON",
    };
  }
};

export const dispose = (handle) => () => {
  if (!handle || handle.disposed) return;
  handle.callbacks.clear();
  handle.view.destroy();
  handle.disposed = true;
};
