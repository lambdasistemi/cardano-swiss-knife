# purescript-rdf-editor

Generic CodeMirror-backed editor package for RDF-oriented text. The package
supports Turtle and JSON modes and exposes a small mount/handle API that can be
reused by browser applications.

## API

- `mount(element, opts) -> handle`
- `getValue(handle)`
- `setValue(handle, text)`
- `onChange(handle, callback) -> unsubscribe`
- `setMode(handle, Turtle | Json)`
- `validate(handle)`
- `dispose(handle)`

`opts.value` supplies the initial text. `opts.mode` selects `Turtle` or `Json`.
JSON validation parses the document and reports the parse error message when
invalid. Turtle validation currently reports editor state only; syntax
highlighting is provided by the CodeMirror legacy Turtle mode.
