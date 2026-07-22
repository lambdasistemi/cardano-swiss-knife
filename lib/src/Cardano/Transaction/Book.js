const PREFIXES = `@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix overlay: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#> .
`;

const VOCAB = `overlay:OverlayPart
  a rdfs:Class ;
  rdfs:label "Overlay part" .

overlay:Treasury
  a rdfs:Class ;
  rdfs:label "Budget treasury" .

overlay:Address
  a rdfs:Class ;
  rdfs:label "Cardano address" .

overlay:CardanoScript
  a rdfs:Class ;
  rdfs:label "Cardano script" .

overlay:Owner
  a rdfs:Class ;
  rdfs:label "Owner key" .

overlay:ScopeOwners
  a rdfs:Class ;
  rdfs:label "Scope owners reference" .

overlay:slug a rdf:Property ; rdfs:label "Slug" .
overlay:budgetAda a rdf:Property ; rdfs:label "Budget in ADA" .
overlay:address a rdf:Property ; rdfs:label "Treasury address" .
overlay:owner a rdf:Property ; rdfs:label "Treasury owner" .
overlay:scopeOwners a rdf:Property ; rdfs:label "Scope owners" .
overlay:treasuryScript a rdf:Property ; rdfs:label "Treasury script" .
overlay:permissionsScript a rdf:Property ; rdfs:label "Permissions script" .
overlay:registryScript a rdf:Property ; rdfs:label "Registry script" .
overlay:scriptRole a rdf:Property ; rdfs:label "Script role" .
`;

const CARDANO_SHACL_SHAPES = globalThis.cardanoShaclShapes || "";

export const bundledAmaruJournal = globalThis.amaruTreasuryJournalJson || "";
export const bundledCardanoShaclShapes = CARDANO_SHACL_SHAPES;
export const bundledSundaeSwapBlueprint = globalThis.sundaeSwapV3BlueprintJson || "";

const text = (value) =>
  value === null || value === undefined ? "" : String(value);

const txOutRef = (value) =>
  text(value).replace(/#0+([0-9]+)$/, "#$1");

const literal = (value) => JSON.stringify(text(value));

const localName = (value) => text(value).replace(/[^A-Za-z0-9_-]/g, "-");

const words = (slug) => text(slug).split(/[_\s-]+/).filter(Boolean);

const capitalize = (word) =>
  word.length === 0 ? "" : word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();

const sentenceLabel = (slug) => {
  const parts = words(slug).map((word) => word.toLowerCase());
  if (parts.length === 0) return "Overlay part";
  parts[0] = capitalize(parts[0]);
  return parts.join(" ");
};

const titleLabel = (slug) => words(slug).map(capitalize).join(" ");

const iri = (kind, value) => `<urn:cardano:id:${kind}:${text(value)}>`;

const turtleNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? String(value) : literal(value);
};

const block = (subject, predicates) => {
  const rows = predicates.map(([predicate, object], index) => {
    const terminator = index === predicates.length - 1 ? "." : ";";
    return `  ${predicate} ${object} ${terminator}`;
  });
  return `${subject}\n${rows.join("\n")}\n`;
};

const scriptBlock = (treasurySlug, role, script) => {
  const slug = localName(treasurySlug);
  const title = titleLabel(treasurySlug);
  const roleLabel = role.replace(/_/g, " ");
  return block(iri("script", script.hash), [
    ["a", "overlay:CardanoScript"],
    ["rdfs:label", literal(`Amaru ${title} ${roleLabel}`)],
    ["overlay:scriptRole", literal(role)],
    ["cardano:txOutRef", literal(txOutRef(script.deployed_at))],
    ["overlay:slug", literal(`${slug}-${role}`)],
  ]);
};

const buildAmaruPart = (slug, treasury, scopeOwners) => {
  const safeSlug = localName(slug);
  const label = sentenceLabel(slug);
  const title = titleLabel(slug);
  const subject = `overlay:amaruTreasury-${safeSlug}`;
  const address = `overlay:amaruAddress-${safeSlug}`;
  const scopeOwnersSubject = "overlay:amaruScopeOwners";
  const predicates = [
    ["a", "overlay:Treasury"],
    ["rdfs:label", literal(`Amaru ${title} treasury`)],
    ["overlay:slug", literal(slug)],
    ["overlay:budgetAda", turtleNumber(treasury.budget)],
    ["overlay:address", address],
    ["overlay:scopeOwners", scopeOwnersSubject],
    ["overlay:treasuryScript", iri("script", treasury.treasury_script.hash)],
    ["overlay:permissionsScript", iri("script", treasury.permissions_script.hash)],
    ["overlay:registryScript", iri("script", treasury.registry_script.hash)],
  ];

  if (treasury.owner) {
    predicates.splice(5, 0, ["overlay:owner", iri("key", treasury.owner)]);
  }

  const owner = treasury.owner
    ? `${block(iri("key", treasury.owner), [
        ["a", "overlay:Owner"],
        ["rdfs:label", literal(`Amaru ${title} owner key`)],
      ])}\n`
    : "";

  const turtle = `${PREFIXES}
${VOCAB}
${block(scopeOwnersSubject, [
    ["a", "overlay:ScopeOwners"],
    ["rdfs:label", literal("Amaru treasury scope owners")],
    ["cardano:txOutRef", literal(txOutRef(scopeOwners))],
  ])}
${block(address, [
    ["a", "overlay:Address"],
    ["rdfs:label", literal(`Amaru ${title} treasury address`)],
    ["cardano:bech32", literal(treasury.address)],
  ])}
${owner}${block(subject, predicates)}
${scriptBlock(slug, "treasury_script", treasury.treasury_script)}
${scriptBlock(slug, "permissions_script", treasury.permissions_script)}
${scriptBlock(slug, "registry_script", treasury.registry_script)}`;

  return {
    id: `amaru-treasury-${safeSlug}`,
    label,
    kind: "overlay",
    turtle: `${turtle.trim()}\n`,
    plutusJson: "",
  };
};

const buildAmaruBook = (journal) => {
  if (!journal || typeof journal !== "object") {
    throw new Error("journal is not an object");
  }
  if (!journal.treasuries || typeof journal.treasuries !== "object") {
    throw new Error("journal missing treasuries");
  }

  const scopeOwners = text(journal.scope_owners);
  const parts = Object.keys(journal.treasuries)
    .sort()
    .map((slug) => buildAmaruPart(slug, journal.treasuries[slug], scopeOwners));

  return {
    title: "Amaru treasury 2026 overlay",
    source: "docs/inspector/protocols/amaru-treasury/journal-2026.json",
    parts,
    turtle: parts.map((part) => part.turtle).join("\n"),
    notice: "",
  };
};

const hashText = (raw) => {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const isShaclTurtle = (raw) =>
  /(^|\s)sh:(NodeShape|targetClass|property|path|minCount|datatype)\b/.test(raw) ||
  raw.includes("http://www.w3.org/ns/shacl#");

const shaclTurtleBook = (raw) => {
  const turtle = `${raw.trim()}\n`;
  const isBundled = turtle.trim() === bundledCardanoShaclShapes.trim();
  const part = {
    id: isBundled ? "cardano-rdf-shacl-shapes" : `pasted-shacl-${hashText(turtle)}`,
    label: isBundled ? "Cardano transaction SHACL shapes" : "Pasted SHACL shapes",
    kind: "shacl",
    turtle,
    plutusJson: "",
  };
  return {
    title: isBundled ? "Cardano RDF SHACL shapes" : "Pasted SHACL shapes",
    source: isBundled ? "docs/inspector/protocols/cardano-rdf/shapes.ttl" : "paste",
    parts: [part],
    turtle,
    notice: "",
  };
};

const pastedTurtleBook = (raw) => {
  const turtle = `${raw.trim()}\n`;
  const part = {
    id: `pasted-turtle-${hashText(turtle)}`,
    label: "Pasted Turtle",
    kind: "overlay",
    turtle,
    plutusJson: "",
  };
  return {
    title: "Pasted overlay Turtle",
    source: "paste",
    parts: [part],
    turtle,
    notice: "",
  };
};

const isBlueprintJson = (value) =>
  value &&
  typeof value === "object" &&
  value.preamble &&
  typeof value.preamble === "object" &&
  Array.isArray(value.validators);

const isAmaruJournal = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.prototype.hasOwnProperty.call(value, "scope_owners") &&
  typeof value.scope_owners === "string" &&
  Object.prototype.hasOwnProperty.call(value, "treasuries") &&
  value.treasuries &&
  typeof value.treasuries === "object" &&
  !Array.isArray(value.treasuries);

const blueprintId = (blueprint, raw) => {
  const title = text(blueprint?.preamble?.title).toLowerCase();
  if (title.includes("sundae")) return "sundaeswap-v3";
  const slug = localName(text(blueprint?.preamble?.title || "blueprint"))
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  return slug === "" ? `blueprint-${hashText(raw)}` : `blueprint-${slug}`;
};

const blueprintLabel = (blueprint) => {
  const title = text(blueprint?.preamble?.title).toLowerCase();
  if (title.includes("sundae")) return "SundaeSwap V3 blueprint";
  const rawTitle = text(blueprint?.preamble?.title);
  return rawTitle === "" ? "CIP-57 blueprint" : `${titleLabel(rawTitle)} blueprint`;
};

const buildBlueprintBook = (blueprint, raw) => {
  const label = blueprintLabel(blueprint);
  const part = {
    id: blueprintId(blueprint, raw),
    label,
    kind: "blueprint",
    turtle: "",
    plutusJson: raw,
  };
  return {
    title: label,
    source: "CIP-57 plutus.json",
    parts: [part],
    turtle: "",
    notice: "",
  };
};

export const parseBook = (input) => {
  const raw = text(input).trim();
  if (raw === "") {
    throw new Error("overlay input is empty");
  }

  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    if (Object.prototype.hasOwnProperty.call(parsed, "kind")) {
      throw new Error(`unsupported JSON kind: ${text(parsed.kind)}.`);
    }
    if (isBlueprintJson(parsed)) {
      return buildBlueprintBook(parsed, raw);
    }
    if (isAmaruJournal(parsed)) {
      return buildAmaruBook(parsed);
    }
    throw new Error("unrecognized JSON shape.");
  }

  if (isShaclTurtle(raw)) {
    return shaclTurtleBook(raw);
  }

  return pastedTurtleBook(raw);
};

const errText = (err) =>
  err && err.message ? String(err.message) : String(err);

export const parseImpl = (left) => (right) => (input) => () => {
  try {
    return right(parseBook(input));
  } catch (err) {
    return left(errText(err));
  }
};

export const blueprintArgs = (parts) => {
  const blueprints = (Array.isArray(parts) ? parts : [])
    .filter((part) => part && part.kind === "blueprint" && text(part.plutusJson) !== "")
    .map((part) => ({
      id: text(part.id),
      plutus_json: text(part.plutusJson),
    }));

  return blueprints.length === 0 ? "{}" : JSON.stringify({ blueprints });
};

// Host-neutral ordered document adapter; parsing itself is the implementation above.
export const importBooks = (documents = []) => {
  if (!Array.isArray(documents)) throw new Error("books must be an array.");
  return documents.flatMap((document) => {
    if (document && typeof document === "object" && document.kind === "cardano-ledger-inspector.books.v1") {
      if (!Array.isArray(document.books)) throw new Error("book store books is not an array");
      return document.books.filter((book) => book.selected).map((book) => ({ source: "cardano-ledger-inspector.books.v1", turtle: text(book.turtle) }));
    }
    const raw = typeof document === "string" ? document : JSON.stringify(document);
    const book = parseBook(raw);
    return [{ source: typeof document === "string" ? "turtle" : book.source, turtle: book.turtle, parts: book.parts }];
  });
};
