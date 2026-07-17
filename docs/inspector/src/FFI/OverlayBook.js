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

const AMARU_JOURNAL = {
  scope_owners: "11ace24a7b0caad4a68a38ef2fff18185dc9ea604e84425dab487cae94e4cf54#0",
  treasuries: {
    core_development: {
      owner: "7095faf3d48d582fbae8b3f2e726670d7a35e2400c783d992bbdeffb",
      budget: 2575000,
      address: "addr1x90mk0jjjhppr36ethwj8kewpgyrxyc7q6qucl4gqru96dzlhvl999wzz8r4jhway0djuzsgxvf3up5pe3l2sq8ct56qtjz6ah",
      treasury_script: {
        hash: "5fbb3e5295c211c7595ddd23db2e0a0833131e0681cc7ea800f85d34",
        deployed_at: "87ee53271fb41021efa13c2dbe2998c18ead07d32a6ab6dda184853ed7e39aae#0",
      },
      permissions_script: {
        hash: "03ee9cf951e89fb82c47edbff562ee90be17de85b2c24b451c7e8e39",
        deployed_at: "25ba96f5deb14bb5c56e7542d6a9ba8450f52cc698ebd74574e1a0525d861095#0",
      },
      registry_script: {
        hash: "1e1ee91b8e2bddc9d583d92fd1ba5ea47b8a3e62c1eacb0ec799b99b",
        deployed_at: "e7b395a93d49a17994d66df0e4778a01dee05e7711e6612f28d97b63e4e6311c#0",
      },
    },
    ops_and_use_cases: {
      owner: "f3ab64b0f97dcf0f91232754603283df5d75a1201337432c04d23e2e",
      budget: 1160000,
      address: "addr1x9r8gmryz5wrwvlxm6g4s4u9ssdz656z95hwjnk9rgamedzxw3kxg9guxue7dh53tptctpq694f5ytfwa98v2x3mhj6qe3kxep",
      treasury_script: {
        hash: "46746c64151c3733e6de91585785841a2d53422d2ee94ec51a3bbcb4",
        deployed_at: "660c0729b68bce67f62d4f1f3ae38082217e55915bb3e0d9222a67b2f9fd821c#0",
      },
      permissions_script: {
        hash: "cf9a4136d781e65d6885ee574480d29f1d1a342fe15f215ee6bf0cbb",
        deployed_at: "25ba96f5deb14bb5c56e7542d6a9ba8450f52cc698ebd74574e1a0525d861095#1",
      },
      registry_script: {
        hash: "bd7d70eff456af39f86e708fb634b7b69edf5c2aafae7a422f905f5c",
        deployed_at: "e7b395a93d49a17994d66df0e4778a01dee05e7711e6612f28d97b63e4e6311c#1",
      },
    },
    network_compliance: {
      owner: "8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1",
      budget: 1450000,
      address: "addr1xyezq8wpaqnssdjvd3p220uf7e6nzjae44w6yu625y965rfjyqwur6p8pqmycmzz55lcnan4x99mnt2a5fe54ggt4gxs8thzgk",
      treasury_script: {
        hash: "32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d",
        deployed_at: "810bfcbde85ae72f27d7e8cd154c03c802de15d3fa0dd83a32a4b0fdba330b3c#0",
      },
      permissions_script: {
        hash: "a64d1b9e1aeffe54056034d84977061b45a92691efc282fbee3fc094",
        deployed_at: "25ba96f5deb14bb5c56e7542d6a9ba8450f52cc698ebd74574e1a0525d861095#2",
      },
      registry_script: {
        hash: "38c627d45835744a2d6c727124f2b5852e5564aeab3f608e0e84ea6d",
        deployed_at: "e7b395a93d49a17994d66df0e4778a01dee05e7711e6612f28d97b63e4e6311c#2",
      },
    },
    middleware: {
      owner: "97e0f6d6c86dbebf15cc8fdf0981f939b2f2b70928a46511edd49df2",
      budget: 900000,
      address: "addr1x8a5gxtm0ynzw80f80rsps3a5dwem43swsekpnctd0wuwxhmgsvhk7fxyuw7jw78qrprmg6anhtrqapnvr8sk67acudqhnwrjp",
      treasury_script: {
        hash: "fb44197b7926271de93bc700c23da35d9dd630743360cf0b6bddc71a",
        deployed_at: "ec31219173fd4eb3cc3c2123e53425654c1122354ceafc247e7c32d278dad223#0",
      },
      permissions_script: {
        hash: "212e6b9a723138a5b3fe0e55aa4badd9bbae54e3f6309000e30fae3c",
        deployed_at: "25ba96f5deb14bb5c56e7542d6a9ba8450f52cc698ebd74574e1a0525d861095#3",
      },
      registry_script: {
        hash: "def2913d56acc4c81de20b7b5039e10ceb261c79ed968dc526596638",
        deployed_at: "e7b395a93d49a17994d66df0e4778a01dee05e7711e6612f28d97b63e4e6311c#3",
      },
    },
    contingency: {
      owner: null,
      budget: 4057000,
      address: "addr1x8ndhlcfy30t38z0tql64fpg8ply93r37xrgvdagfpsz5nhxm0lsjfz7hzwy7kpl42jzswr7gtz8ruvxscm6sjrq9f8qruq0ae",
      treasury_script: {
        hash: "e6dbff09245eb89c4f583faaa428387e42c471f1868637a848602a4e",
        deployed_at: "b25328336bbba240d5906952534e84bb8edf1a690f86a4160c38703396853c90#0",
      },
      permissions_script: {
        hash: "2810b46b73cb27292cd8511274b6930188eee61b7d8635af6b1b626a",
        deployed_at: "25ba96f5deb14bb5c56e7542d6a9ba8450f52cc698ebd74574e1a0525d861095#4",
      },
      registry_script: {
        hash: "7d275cf8c09fd91e73879993ef13cb73915196478d5e3777992f988",
        deployed_at: "e7b395a93d49a17994d66df0e4778a01dee05e7711e6612f28d97b63e4e6311c#4",
      },
    },
  },
};

export const bundledAmaruJournal = JSON.stringify(AMARU_JOURNAL, null, 2);
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

const BUNDLE_KEYS = [
  ["wallets", "named:wallets", "wallet"],
  ["references", "named:references", "reference"],
  ["descriptions", "free:descriptions", "text"],
  ["justifications", "free:justifications", "text"],
  ["destination_labels", "free:destination_labels", "text"],
  ["validity_hours", "free:validity_hours", "text"],
  ["slippage_bps", "free:slippage_bps", "text"],
  ["split_counts", "free:split_counts", "text"],
];

const bundleKeyInfo = new Map(
  BUNDLE_KEYS.flatMap(([canonical, compatibility, kind]) => [
    [canonical, { canonical, compatibility, kind }],
    [compatibility, { canonical, compatibility, kind }],
  ]),
);

const nonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "";

const isCardanoBech32Address = (value) =>
  typeof value === "string" &&
  /^addr(?:_test)?1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(value);

const buildBundleWalletPart = (key, entry, index) => {
  const path = `bundle ${key}[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${path} is not an object.`);
  }
  if (!nonEmptyString(entry.name)) {
    throw new Error(`${path}.name must be a non-empty string.`);
  }
  if (typeof entry.address !== "string") {
    throw new Error(`${path}.address must be a string.`);
  }

  const keyHash = /^[0-9a-fA-F]{56}$/.test(entry.address)
    ? entry.address.toLowerCase()
    : null;
  let turtle;
  if (keyHash !== null) {
    turtle = `${PREFIXES}\n${block(iri("key", keyHash), [
      ["a", "overlay:Owner"],
      ["rdfs:label", literal(entry.name)],
    ])}`;
  } else if (isCardanoBech32Address(entry.address)) {
    turtle = `${PREFIXES}\n${block(iri("address", entry.address), [
      ["a", "overlay:Address"],
      ["rdfs:label", literal(entry.name)],
      ["cardano:bech32", literal(entry.address)],
    ])}`;
  } else {
    throw new Error(
      `${path}.address is neither a 28-byte key hash nor a Cardano Bech32 address.`,
    );
  }

  return {
    id: `amaru-book-${localName(key)}-${index + 1}`,
    label: entry.name,
    kind: "overlay",
    turtle: `${turtle.trim()}\n`,
    plutusJson: JSON.stringify(entry),
  };
};

const buildBundleReferencePart = (key, entry, index) => {
  const path = `bundle ${key}[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${path} is not an object.`);
  }
  if (!nonEmptyString(entry.name)) {
    throw new Error(`${path}.name must be a non-empty string.`);
  }

  const cidReference = typeof entry.cid === "string";
  const uriReference = ["label", "uri", "type"].every(
    (field) => typeof entry[field] === "string",
  );
  if (!cidReference && !uriReference) {
    throw new Error(
      `${path} must contain name and cid strings or name, label, uri, and type strings.`,
    );
  }

  return {
    id: `amaru-book-${localName(key)}-${index + 1}`,
    label: entry.name,
    kind: "reference",
    turtle: "",
    plutusJson: JSON.stringify(entry),
  };
};

const buildBundleTextPart = (key, entry, index) => {
  const path = `bundle ${key}[${index}]`;
  if (typeof entry !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return {
    id: `amaru-book-${localName(key)}-${index + 1}`,
    label: entry,
    kind: "text",
    turtle: "",
    plutusJson: JSON.stringify(entry),
  };
};

const buildBundleBook = (bundle) => {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("bundle is not an object.");
  }
  if (!bundle.books || typeof bundle.books !== "object" || Array.isArray(bundle.books)) {
    throw new Error("bundle books is not an object.");
  }

  for (const [canonical, compatibility] of BUNDLE_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(bundle.books, canonical) &&
      Object.prototype.hasOwnProperty.call(bundle.books, compatibility)
    ) {
      throw new Error(
        `bundle books has both ${canonical} and ${compatibility}; aliases are ambiguous.`,
      );
    }
  }

  const ignoredKeys = [];
  const parts = [];
  for (const key of Object.keys(bundle.books)) {
    const keyInfo = bundleKeyInfo.get(key);
    if (!keyInfo) {
      ignoredKeys.push(key);
      continue;
    }

    const entries = bundle.books[key];
    if (!Array.isArray(entries)) {
      throw new Error(`bundle ${key} must be an array.`);
    }
    entries.forEach((entry, index) => {
      if (keyInfo.kind === "wallet") {
        parts.push(buildBundleWalletPart(key, entry, index));
      } else if (keyInfo.kind === "reference") {
        parts.push(buildBundleReferencePart(key, entry, index));
      } else {
        parts.push(buildBundleTextPart(key, entry, index));
      }
    });
  }

  if (parts.length === 0) {
    throw new Error("bundle contains zero supported entries.");
  }

  return {
    title: "Amaru book bundle",
    source: "amaru.book.bundle.v1",
    parts,
    turtle: parts.map((part) => part.turtle).filter(Boolean).join("\n"),
    notice:
      ignoredKeys.length === 0
        ? ""
        : `Ignored book keys: ${ignoredKeys.join(", ")}.`,
  };
};

const parseBook = (input) => {
  const raw = text(input).trim();
  if (raw === "") {
    throw new Error("overlay input is empty");
  }

  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === "amaru.book.bundle.v1") {
      return buildBundleBook(parsed);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "kind")) {
      throw new Error(`unsupported JSON kind: ${text(parsed.kind)}.`);
    }
    if (isBlueprintJson(parsed)) {
      return buildBlueprintBook(parsed, raw);
    }
    return buildAmaruBook(parsed);
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
