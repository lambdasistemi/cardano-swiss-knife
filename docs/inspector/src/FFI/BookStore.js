const STORE_KIND = "cardano-ledger-inspector.books.v1";

const text = (value) =>
  value === null || value === undefined ? "" : String(value);

const literal = (value) => JSON.stringify(text(value));

const invalid = (message) => {
  throw new Error(message);
};

const requireString = (value, field) => {
  if (typeof value !== "string") invalid(`book store field ${field} is not a string`);
  return value;
};

const requireBoolean = (value, field) => {
  if (typeof value !== "boolean") invalid(`book store field ${field} is not a boolean`);
  return value;
};

const canonicalizeTurtle = (turtle) => {
  const seen = new Set();
  return turtle
    .split("\n")
    .filter((line) => {
      const match = line.match(/^\s*@prefix\s+([^\s:]+)\s*:\s*<([^>]*)>\s*\.\s*$/);
      if (!match) return true;
      const declaration = `${match[1]}\u0000${match[2]}`;
      if (seen.has(declaration)) return false;
      seen.add(declaration);
      return true;
    })
    .join("\n");
};

const normalizePart = (part, index) => {
  if (!part || typeof part !== "object" || Array.isArray(part)) {
    invalid(`book store part ${index} is not an object`);
  }

  return {
    id: requireString(part.id, `parts[${index}].id`),
    label: requireString(part.label, `parts[${index}].label`),
    kind: requireString(part.kind, `parts[${index}].kind`),
    turtle: canonicalizeTurtle(requireString(part.turtle, `parts[${index}].turtle`)),
    plutusJson: requireString(part.plutusJson, `parts[${index}].plutusJson`),
  };
};

const normalizeBook = (book, index) => {
  if (!book || typeof book !== "object" || Array.isArray(book)) {
    invalid(`book store entry ${index} is not an object`);
  }
  if (!Array.isArray(book.parts)) {
    invalid(`book store entry ${index} parts is not an array`);
  }

  const normalized = {
    id: requireString(book.id, `books[${index}].id`),
    name: requireString(book.name, `books[${index}].name`),
    source: requireString(book.source, `books[${index}].source`),
    upstreamSource: typeof book.upstreamSource === "string" ? book.upstreamSource : "",
    upstreamRef: typeof book.upstreamRef === "string" ? book.upstreamRef : "",
    raw: canonicalizeTurtle(requireString(book.raw, `books[${index}].raw`)),
    parts: book.parts.map(normalizePart),
    turtle: canonicalizeTurtle(requireString(book.turtle, `books[${index}].turtle`)),
    selected: requireBoolean(book.selected, `books[${index}].selected`),
    seed: requireBoolean(book.seed, `books[${index}].seed`),
  };

  if (normalized.id.trim() === "") invalid(`book store entry ${index} id is empty`);
  if (normalized.name.trim() === "") invalid(`book store entry ${index} name is empty`);
  return normalized;
};

const normalizeStore = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("book store is not an object");
  }
  if (value.kind !== STORE_KIND) {
    invalid("book store kind is unsupported");
  }
  if (!Array.isArray(value.books)) {
    invalid("book store books is not an array");
  }

  return {
    kind: STORE_KIND,
    books: value.books.map(normalizeBook),
  };
};

export const parseStoreImpl = (left) => (right) => (raw) => {
  try {
    return right(normalizeStore(JSON.parse(text(raw))));
  } catch (err) {
    return left(err && err.message ? String(err.message) : String(err));
  }
};

export const serializeImpl = (store) =>
  JSON.stringify(normalizeStore(store), null, 2);

export const inspectImpl = (store) => {
  const normalized = normalizeStore(store);
  return {
    kind: normalized.kind,
    count: normalized.books.length,
    selectedCount: normalized.books.filter((book) => book.selected).length,
    partCount: normalized.books.reduce((total, book) => total + book.parts.length, 0),
  };
};

const localToken = (value, fallback = "Annotation") => {
  const token = text(value)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (token === "") return fallback;
  return /^[A-Za-z_]/.test(token) ? token : `${fallback}-${token}`;
};

const turtleType = (value) => {
  const raw = text(value).trim();
  if (raw === "") return "";
  if (/^https?:\/\//.test(raw) || raw.startsWith("urn:")) return `<${raw}>`;
  if (/^(cardano|rdfs|local):[A-Za-z_][A-Za-z0-9_-]*$/.test(raw)) return raw;
  return `local:${localToken(raw, "Type")}`;
};

const turtleSubject = (value) => {
  const raw = text(value).trim();
  if (raw === "") return "";
  if (/[<>"{}|\\^`]/.test(raw)) return "";
  if (/^https?:\/\//.test(raw) || raw.startsWith("urn:")) return `<${raw}>`;
  if (/^(cardano|rdfs|local):[A-Za-z_][A-Za-z0-9_-]*$/.test(raw)) return raw;
  return "";
};

export const annotationTurtle = ({ label, typeName, entityIri, predicate, value }) => {
  const trimmedLabel = text(label).trim();
  const subject = turtleSubject(entityIri);
  const trimmedPredicate = text(predicate).trim();
  const trimmedValue = text(value).trim();
  if (trimmedLabel === "" || subject === "" || trimmedPredicate === "" || trimmedValue === "") return "";

  const typeObject = turtleType(typeName);
  const typeLine = typeObject === "" ? "" : `  a ${typeObject} ;\n`;

  return `@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix local: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/local#> .

${subject}
${typeLine}  rdfs:label ${literal(trimmedLabel)} ;
  ${trimmedPredicate} ${literal(trimmedValue)} .
`;
};
