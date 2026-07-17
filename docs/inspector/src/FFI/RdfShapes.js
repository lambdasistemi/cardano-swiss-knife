// Thin wrapper over globalThis.rdfShapes.query, seeded by src/bootstrap.js.
// The vendored engine returns a plain JS object on success and throws on
// Turtle/SPARQL errors; surface that as Either String Json for PureScript.

const errText = (err) =>
  err && err.message ? String(err.message) : String(err);

const transactionOutputsQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
SELECT ?transaction ?txId (COUNT(?output) AS ?outputs)
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasTxId ?txId .
  OPTIONAL { ?transaction cardano:hasOutput ?output . }
}
GROUP BY ?transaction ?txId
ORDER BY ?transaction
`;

const resolvedLabelsQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX overlay: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#>
SELECT ?label ?entity ?type ?scriptRole ?txOutRef ?fromTxOutRef ?bech32 ?slug
WHERE {
  ?entity rdfs:label ?label .
  FILTER(
    STRSTARTS(STR(?entity), "https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#")
    || STRSTARTS(STR(?entity), "urn:cardano:id:")
  )
  OPTIONAL { ?entity a ?type . }
  OPTIONAL { ?entity overlay:scriptRole ?scriptRole . }
  OPTIONAL { ?entity cardano:txOutRef ?txOutRef . }
  OPTIONAL { ?entity cardano:fromTxOutRef ?fromTxOutRef . }
  OPTIONAL { ?entity cardano:bech32 ?bech32 . }
  OPTIONAL { ?entity overlay:slug ?slug . }
}
ORDER BY ?label ?entity
`;

const resolvedLabelMatchesQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?entity ?matched
WHERE {
  ?entity rdfs:label ?label .
  FILTER(STRSTARTS(STR(?entity), "urn:cardano:id:"))
  ?matched cardano:bytesHex ?matchedBytesHex .
  FILTER(STRSTARTS(STR(?matched), "urn:cardano:id:"))
  # Equal hash bytes across credential types are intentionally ambiguous; type-aware disambiguation is out of scope.
  BIND(REPLACE(STR(?entity), "^.*:", "") AS ?entityHash)
  BIND(REPLACE(STR(?matched), "^.*:", "") AS ?matchedHash)
  FILTER(?entityHash = ?matchedHash)
}
ORDER BY ?entity ?matched
`;

const typedFieldsQuery = `
SELECT ?subject ?field ?value
WHERE {
  ?subject ?predicate ?value .
  FILTER(STRSTARTS(STR(?predicate), "https://lambdasistemi.github.io/cardano-rdf/fixtures/tx-rdf#"))
  BIND(STRAFTER(STR(?predicate), "https://lambdasistemi.github.io/cardano-rdf/fixtures/tx-rdf#") AS ?field)
  FILTER(CONTAINS(STR(?field), "_"))
  FILTER(!REGEX(STR(?field), "^_[0-9]+_"))
}
ORDER BY ?subject ?field ?value
`;

const decodedTreeRootQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?transaction ?txId ?txIdHex ?valid ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasTxId ?txId .
  OPTIONAL { ?txId cardano:bytesHex ?txIdHex . }
  OPTIONAL { ?transaction cardano:isValid ?valid . }
  OPTIONAL { ?transaction rdfs:label ?resolvedLabel . }
  OPTIONAL { ?transaction a ?resolvedType . }
}
ORDER BY ?transaction
LIMIT 1
`;

const decodedBodyFieldsQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?label ?kind ?entity ?value ?raw ?sort ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction .
  {
    ?transaction cardano:isValid ?value .
    BIND(cardano:isValid AS ?resolveEntity)
    BIND(cardano:isValid AS ?resolvedType)
    BIND("Validity" AS ?label)
    BIND("boolean" AS ?kind)
    BIND("10" AS ?sort)
  } UNION {
    ?transaction cardano:hasFee ?value .
    BIND(cardano:hasFee AS ?resolveEntity)
    BIND(cardano:hasFee AS ?resolvedType)
    BIND("Fee" AS ?label)
    BIND("lovelace" AS ?kind)
    BIND("20" AS ?sort)
  } UNION {
    ?transaction cardano:scriptDataHash ?entity .
    BIND(?entity AS ?resolveEntity)
    OPTIONAL { ?entity cardano:bytesHex ?raw . }
    BIND("Script data hash" AS ?label)
    BIND("hash" AS ?kind)
    BIND(STR(?entity) AS ?value)
    BIND("30" AS ?sort)
  } UNION {
    ?transaction cardano:auxiliaryDataHash ?entity .
    BIND(?entity AS ?resolveEntity)
    OPTIONAL { ?entity cardano:bytesHex ?raw . }
    BIND("Auxiliary data hash" AS ?label)
    BIND("hash" AS ?kind)
    BIND(STR(?entity) AS ?value)
    BIND("40" AS ?sort)
  } UNION {
    ?transaction cardano:totalCollateral ?value .
    BIND(cardano:totalCollateral AS ?resolveEntity)
    BIND(cardano:totalCollateral AS ?resolvedType)
    BIND("Total collateral" AS ?label)
    BIND("lovelace" AS ?kind)
    BIND("50" AS ?sort)
  } UNION {
    ?transaction cardano:hasMint ?entity .
    BIND(?entity AS ?resolveEntity)
    BIND("Mint" AS ?label)
    BIND("mint" AS ?kind)
    BIND(STR(?entity) AS ?value)
    BIND("60" AS ?sort)
  } UNION {
    ?transaction cardano:hasCollateralReturn ?entity .
    BIND(?entity AS ?resolveEntity)
    BIND("Collateral return" AS ?label)
    BIND("output" AS ?kind)
    BIND(STR(?entity) AS ?value)
    BIND("70" AS ?sort)
  } UNION {
    ?transaction cardano:networkId ?value .
    BIND(cardano:networkId AS ?resolveEntity)
    BIND(cardano:networkId AS ?resolvedType)
    BIND("Network id" AS ?label)
    BIND("network" AS ?kind)
    BIND("80" AS ?sort)
  } UNION {
    ?transaction cardano:hasValidityInterval ?interval .
    ?interval cardano:intervalEnd ?value .
    BIND("TTL" AS ?label)
    BIND("slot" AS ?kind)
    BIND("90" AS ?sort)
  }
  OPTIONAL {
    FILTER(BOUND(?resolveEntity))
    ?resolveEntity rdfs:label ?resolvedLabel .
  }
  OPTIONAL {
    FILTER(BOUND(?resolveEntity))
    ?resolveEntity a ?resolvedType .
  }
}
ORDER BY ?sort ?label ?value ?entity
`;

const decodedWithdrawalsQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
SELECT ?withdrawal ?account ?accountRaw ?lovelace
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasWithdrawal ?withdrawal .
  OPTIONAL {
    ?withdrawal cardano:withdrawalAccount ?account .
    OPTIONAL { ?account cardano:bytesHex ?accountRaw . }
  }
  OPTIONAL { ?withdrawal cardano:lovelace ?lovelace . }
}
ORDER BY ?accountRaw ?account ?withdrawal
`;

const decodedRequiredSignersQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?entity ?raw ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasRequiredSigner ?entity .
  OPTIONAL { ?entity cardano:bytesHex ?raw . }
  OPTIONAL { ?entity rdfs:label ?resolvedLabel . }
  OPTIONAL { ?entity a ?resolvedType . }
}
ORDER BY ?raw ?entity
`;

const decodedInputsQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?section ?entity ?txOutRef ?txIdHex ?index ?sort ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction .
  {
    ?transaction cardano:hasInput ?entity .
    BIND("Inputs" AS ?section)
    BIND("10" AS ?sort)
  } UNION {
    ?transaction cardano:hasReferenceInput ?entity .
    BIND("Reference inputs" AS ?section)
    BIND("20" AS ?sort)
  } UNION {
    ?transaction cardano:hasCollateralInput ?entity .
    BIND("Collateral inputs" AS ?section)
    BIND("30" AS ?sort)
  }
  OPTIONAL { ?entity cardano:txOutRef ?txOutRef . }
  OPTIONAL {
    ?entity cardano:fromTxOutRef ?ref .
    OPTIONAL { ?ref cardano:hasIndex ?index . }
    OPTIONAL {
      ?ref cardano:hasTxId ?txId .
      OPTIONAL { ?txId cardano:bytesHex ?txIdHex . }
    }
  }
  OPTIONAL { ?entity rdfs:label ?directResolvedLabel . }
  OPTIONAL { ?entity a ?directResolvedType . }
  OPTIONAL {
    FILTER(BOUND(?txOutRef))
    ?txOutRefEntity cardano:txOutRef ?txOutRef ;
      rdfs:label ?txOutRefResolvedLabel .
    OPTIONAL { ?txOutRefEntity a ?txOutRefResolvedType . }
  }
  BIND(COALESCE(?directResolvedLabel, ?txOutRefResolvedLabel) AS ?resolvedLabel)
  BIND(COALESCE(?directResolvedType, ?txOutRefResolvedType) AS ?resolvedType)
}
ORDER BY ?sort ?txIdHex ?index ?entity
`;

const decodedOutputsQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?output ?index ?address ?addressBech32 ?lovelace ?datum ?datumRaw ?datumHash ?datumHashHex ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasOutput ?output .
  OPTIONAL { ?output cardano:hasIndex ?index . }
  OPTIONAL {
    ?output cardano:atAddress ?address .
    OPTIONAL { ?address cardano:bech32 ?addressBech32 . }
  }
  OPTIONAL { ?output cardano:lovelace ?lovelace . }
  OPTIONAL {
    ?output cardano:hasDatum ?datum .
    OPTIONAL { ?datum cardano:hasRawBytes ?datumRaw . }
    OPTIONAL {
      ?datum cardano:hasHash ?datumHash .
      OPTIONAL { ?datumHash cardano:bytesHex ?datumHashHex . }
    }
  }
  OPTIONAL { ?output rdfs:label ?resolvedLabel . }
  OPTIONAL { ?output a ?resolvedType . }
}
ORDER BY ?index ?output
`;

const decodedWitnessesQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?witness ?verificationKey ?verificationKeyHex ?signature ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasKeyWitness ?witness .
  OPTIONAL {
    ?witness cardano:hasVerificationKey ?verificationKey .
    OPTIONAL { ?verificationKey cardano:bytesHex ?verificationKeyHex . }
  }
  OPTIONAL { ?witness cardano:hasSignature ?signature . }
  OPTIONAL { ?witness rdfs:label ?resolvedLabel . }
  OPTIONAL { ?witness a ?resolvedType . }
}
ORDER BY ?verificationKeyHex ?witness
`;

const decodedRedeemersQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?redeemer ?purpose ?index ?data ?dataRaw ?dataHash ?dataHashHex ?memory ?cpu ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasRedeemer ?redeemer .
  OPTIONAL { ?redeemer cardano:hasPurpose ?purpose . }
  OPTIONAL { ?redeemer cardano:hasIndex ?index . }
  OPTIONAL {
    ?redeemer cardano:hasData ?data .
    OPTIONAL { ?data cardano:hasRawBytes ?dataRaw . }
    OPTIONAL {
      ?data cardano:hasHash ?dataHash .
      OPTIONAL { ?dataHash cardano:bytesHex ?dataHashHex . }
    }
  }
  OPTIONAL {
    ?redeemer cardano:hasExUnits ?exUnits .
    OPTIONAL { ?exUnits cardano:memoryUnits ?memory . }
    OPTIONAL { ?exUnits cardano:cpuUnits ?cpu . }
  }
  OPTIONAL { ?redeemer rdfs:label ?resolvedLabel . }
  OPTIONAL { ?redeemer a ?resolvedType . }
}
ORDER BY ?purpose ?index ?redeemer
`;

const decodedMetadataQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?metadata ?label ?raw ?text ?resolvedLabel ?resolvedType
WHERE {
  ?transaction a cardano:Transaction ;
    cardano:hasAuxiliaryData ?auxiliaryData .
  OPTIONAL { ?auxiliaryData cardano:hasRawBytes ?raw . }
  ?auxiliaryData cardano:hasMetadatum ?metadata .
  OPTIONAL { ?metadata cardano:metadataLabel ?label . }
  OPTIONAL { ?metadata cardano:metadatumValue ?value . }
  OPTIONAL { ?value cardano:hasElement ?element . }
  OPTIONAL { ?element cardano:metadatumValue ?elementValue . }
  OPTIONAL { ?elementValue cardano:textValue ?text . }
  OPTIONAL { ?metadata rdfs:label ?resolvedLabel . }
  OPTIONAL { ?metadata a ?resolvedType . }
}
ORDER BY ?label ?metadata ?text
`;

const decodedLabelMatchesQuery = `
PREFIX cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?entity ?label ?type ?bech32 ?bytesHex ?txOutRef ?fromTxOutRef ?rawBytes ?datumHashHex
WHERE {
  ?entity rdfs:label ?label .
  OPTIONAL { ?entity a ?type . }
  OPTIONAL { ?entity cardano:bech32 ?bech32 . }
  OPTIONAL { ?entity cardano:bytesHex ?bytesHex . }
  OPTIONAL { ?entity cardano:txOutRef ?txOutRef . }
  OPTIONAL { ?entity cardano:fromTxOutRef ?fromTxOutRef . }
  OPTIONAL { ?entity cardano:hasRawBytes ?rawBytes . }
  OPTIONAL {
    ?entity cardano:hasHash ?datumHash .
    OPTIONAL { ?datumHash cardano:bytesHex ?datumHashHex . }
  }
}
ORDER BY ?label ?entity
`;

const bindingValue = (binding) =>
  binding && binding.value !== undefined && binding.value !== null
    ? String(binding.value)
    : "";

const firstBindingValue = (...bindings) => {
  for (const binding of bindings) {
    const value = bindingValue(binding);
    if (value !== "") return value;
  }
  return "";
};

const localName = (value) => {
  const raw = String(value || "");
  const hashIndex = raw.lastIndexOf("#");
  if (hashIndex >= 0) return raw.slice(hashIndex + 1);
  const slashIndex = raw.lastIndexOf("/");
  if (slashIndex >= 0) return raw.slice(slashIndex + 1);
  const colonIndex = raw.lastIndexOf(":");
  if (colonIndex >= 0) return raw.slice(colonIndex + 1);
  return raw;
};

const humanToken = (value) => {
  const token = localName(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (token === "") return "Label";
  return token
    .split(/\s+/)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const normalizeTransactionOutputRows = (result) => {
  if (!result || result.kind !== "solutions") {
    throw new Error("query did not return solution rows");
  }

  const bindings = result.json?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("query result missing bindings");
  }

  return bindings.map((binding) => ({
    transaction: bindingValue(binding.transaction),
    txId: bindingValue(binding.txId),
    outputs: bindingValue(binding.outputs),
  }));
};

const normalizeResolvedLabelRows = (result, matchesResult) => {
  if (!result || result.kind !== "solutions") {
    throw new Error("query did not return solution rows");
  }

  const bindings = result.json?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("query result missing bindings");
  }

  if (!matchesResult || matchesResult.kind !== "solutions") {
    throw new Error("match query did not return solution rows");
  }

  const matchBindings = matchesResult.json?.results?.bindings;
  if (!Array.isArray(matchBindings)) {
    throw new Error("match query result missing bindings");
  }

  const explicitMatches = new Map(
    matchBindings.map((binding) => [
      bindingValue(binding.entity),
      bindingValue(binding.matched),
    ]),
  );

  return bindings.map((binding) => {
    const entity = bindingValue(binding.entity);
    return {
      label: bindingValue(binding.label),
      role: humanToken(firstBindingValue(binding.scriptRole, binding.type)),
      entity,
      matched:
        explicitMatches.get(entity) ||
        firstBindingValue(
          binding.txOutRef,
          binding.fromTxOutRef,
          binding.bech32,
          binding.slug,
          binding.entity,
        ),
    };
  });
};

const normalizeTypedFieldRows = (result) => {
  if (!result || result.kind !== "solutions") {
    throw new Error("query did not return solution rows");
  }

  const bindings = result.json?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("query result missing bindings");
  }

  return bindings.map((binding) => ({
    subject: bindingValue(binding.subject),
    field: bindingValue(binding.field),
    value: bindingValue(binding.value),
  }));
};

const queryBindings = (graphTtl, sparql) => {
  const result = globalThis.rdfShapes.query(graphTtl, sparql);
  if (!result || result.kind !== "solutions") {
    throw new Error("query did not return solution rows");
  }

  const bindings = result.json?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("query result missing bindings");
  }
  return bindings;
};

const compact = (value, max = 72) => {
  const raw = String(value || "");
  return raw.length > max ? `${raw.slice(0, max - 1)}...` : raw;
};

const txOutRefFromUtxoUri = (value) => {
  const match = String(value || "").match(/^urn:cardano:utxo:([0-9a-f]{64}):([0-9]+)$/i);
  return match ? `${match[1]}#${match[2]}` : "";
};

const txOutRefParts = (value) => {
  const match = String(value || "").match(/^([0-9a-f]{64})#([0-9]+)$/i);
  return match ? { tx: match[1], index: match[2] } : { tx: "", index: "" };
};

const isIri = (value) => /^https?:\/\//.test(String(value || "")) || String(value || "").startsWith("urn:");

const annotationEntityIri = (entity, kind, value) => {
  const entityValue = String(entity || "");
  if (isIri(entityValue)) return entityValue;
  const rawValue = String(value || "");
  return rawValue === "" ? "" : `urn:cardano:id:${kind}:${rawValue}`;
};

const slug = (value) =>
  String(value || "row")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "row";

const treeRow = ({
  id,
  parentId = "",
  depth = 0,
  order = 0,
  label,
  kind = "",
  value = "",
  summary = "",
  raw = "",
  entityIri = "",
  resolvedLabel = "",
  resolvedType = "",
  annotationPredicate = "",
  annotationValue = "",
}) => ({
  id,
  parentId,
  depth,
  order,
  label,
  kind,
  value,
  summary,
  raw,
  entityIri,
  resolvedLabel,
  resolvedType,
  annotationPredicate,
  annotationValue,
});

const addSection = (rows, id, label, order, summary = "") => {
  rows.push(
    treeRow({
      id,
      parentId: "decoded-root",
      depth: 1,
      order,
      label,
      kind: "section",
      summary,
    }),
  );
};

const appendLeaf = (rows, parentId, depth, order, label, kind, value, extra = {}) => {
  const stringValue = String(value || "");
  if (stringValue === "") return;
  rows.push(
    treeRow({
      id: `${parentId}-${slug(label)}-${slug(stringValue)}-${order}`,
      parentId,
      depth,
      order,
      label,
      kind,
      value: stringValue,
      summary: compact(stringValue),
      raw: extra.raw || stringValue,
      entityIri: extra.entityIri || "",
      resolvedLabel: extra.resolvedLabel || "",
      resolvedType: extra.resolvedType || "",
      annotationPredicate: extra.annotationPredicate || "",
      annotationValue: extra.annotationValue || "",
    }),
  );
};

const addMatchValue = (matches, value, row) => {
  const key = String(value || "");
  if (key !== "" && !matches.has(key)) matches.set(key, row);
};

const decodedLabelMatches = (graphTtl) => {
  const matches = new Map();
  let rows = [];
  try {
    rows = queryBindings(graphTtl, decodedLabelMatchesQuery);
  } catch (_) {
    return matches;
  }

  for (const row of rows) {
    const match = {
      resolvedLabel: bindingValue(row.label),
      resolvedType: bindingValue(row.type),
    };
    addMatchValue(matches, bindingValue(row.entity), match);
    addMatchValue(matches, bindingValue(row.bech32), match);
    addMatchValue(matches, bindingValue(row.bytesHex), match);
    addMatchValue(matches, bindingValue(row.txOutRef), match);
    addMatchValue(matches, bindingValue(row.fromTxOutRef), match);
    addMatchValue(matches, bindingValue(row.rawBytes), match);
    addMatchValue(matches, bindingValue(row.datumHashHex), match);
  }

  return matches;
};

const resolvedFrom = (matches, directLabel, directType, ...values) => {
  const resolved = {
    resolvedLabel: directLabel || "",
    resolvedType: directType || "",
  };
  if (resolved.resolvedLabel !== "" || resolved.resolvedType !== "") {
    return resolved;
  }

  for (const value of values) {
    const match = matches.get(String(value || ""));
    if (match) return match;
  }

  return resolved;
};

const countText = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const normalizeDecodedTreeRows = (graphTtl) => {
  const roots = queryBindings(graphTtl, decodedTreeRootQuery);
  if (roots.length === 0) return [];

  const labelMatches = decodedLabelMatches(graphTtl);
  const root = roots[0];
  const txId = firstBindingValue(root.txIdHex, root.txId, root.transaction);
  const transactionId = bindingValue(root.transaction);
  const rootResolved = resolvedFrom(
    labelMatches,
    bindingValue(root.resolvedLabel),
    bindingValue(root.resolvedType),
    txId,
    transactionId,
  );
  const rows = [
    treeRow({
      id: "decoded-root",
      depth: 0,
      order: 0,
      label: "Transaction",
      kind: humanToken(firstBindingValue(root.resolvedType) || "Transaction"),
      value: transactionId,
      summary: compact(transactionId),
      raw: txId,
      entityIri: transactionId,
      resolvedLabel: rootResolved.resolvedLabel,
      resolvedType: rootResolved.resolvedType,
    }),
  ];

  const bodyFields = queryBindings(graphTtl, decodedBodyFieldsQuery);
  const withdrawals = queryBindings(graphTtl, decodedWithdrawalsQuery);
  const requiredSigners = queryBindings(graphTtl, decodedRequiredSignersQuery);
  const inputs = queryBindings(graphTtl, decodedInputsQuery);
  const outputs = queryBindings(graphTtl, decodedOutputsQuery);
  const witnesses = queryBindings(graphTtl, decodedWitnessesQuery);
  const redeemers = queryBindings(graphTtl, decodedRedeemersQuery);
  const metadata = queryBindings(graphTtl, decodedMetadataQuery);

  const bodyFieldByLabel = new Map();
  for (const field of bodyFields) {
    const label = bindingValue(field.label);
    if (label !== "" && !bodyFieldByLabel.has(label)) bodyFieldByLabel.set(label, field);
  }

  const metadataById = new Map();
  for (const row of metadata) {
    const id = bindingValue(row.metadata);
    if (id !== "" && !metadataById.has(id)) metadataById.set(id, row);
  }
  const metadataRows = Array.from(metadataById.values());

  const addNode = ({
    id,
    parentId,
    depth,
    order,
    label,
    kind,
    value = "",
    summary = "",
    raw = "",
    entityIri = "",
    resolvedLabel = "",
    resolvedType = "",
    annotationPredicate = "",
    annotationValue = "",
  }) => {
    rows.push(
      treeRow({
        id,
        parentId,
        depth,
        order,
        label,
        kind,
        value,
        summary,
        raw,
        entityIri,
        resolvedLabel,
        resolvedType,
        annotationPredicate,
        annotationValue,
      }),
    );
  };
  const addNullField = (parentId, depth, order, label) => {
    addNode({
      id: `${parentId}-${slug(label)}`,
      parentId,
      depth,
      order,
      label,
      kind: "null",
      value: "NULL",
      summary: "NULL",
      raw: "NULL",
    });
  };
  const addContainerField = (parentId, depth, order, label, summary, extra = {}) => {
    addNode({
      id: extra.id || `${parentId}-${slug(label)}`,
      parentId,
      depth,
      order,
      label,
      kind: extra.kind || "section",
      value: extra.value || "",
      summary,
      raw: extra.raw || "",
      entityIri: extra.entityIri || "",
      resolvedLabel: extra.resolvedLabel || "",
      resolvedType: extra.resolvedType || "",
    });
  };
  const addBodyScalar = (parentId, depth, order, label, sourceLabel) => {
    const field = bodyFieldByLabel.get(sourceLabel);
    if (!field) {
      addNullField(parentId, depth, order, label);
      return;
    }
    const raw = firstBindingValue(field.raw, field.value, field.entity);
    if (raw === "") {
      addNullField(parentId, depth, order, label);
      return;
    }
    const resolved = resolvedFrom(
      labelMatches,
      bindingValue(field.resolvedLabel),
      bindingValue(field.resolvedType),
      raw,
      bindingValue(field.value),
      bindingValue(field.entity),
    );
    addNode({
      id: `${parentId}-${slug(label)}`,
      parentId,
      depth,
      order,
      label,
      kind: bindingValue(field.kind),
      value: raw,
      summary: compact(raw),
      raw,
      entityIri: annotationEntityIri(bindingValue(field.entity), "hash", bindingValue(field.raw)),
      resolvedLabel: resolved.resolvedLabel,
      resolvedType: resolved.resolvedType,
      annotationPredicate: bindingValue(field.kind) === "hash" ? "cardano:bytesHex" : "",
      annotationValue: bindingValue(field.kind) === "hash" ? bindingValue(field.raw) : "",
    });
  };
  const groupedInputs = {
    inputs: inputs.filter((input) => bindingValue(input.section) === "Inputs"),
    collateral: inputs.filter((input) => bindingValue(input.section) === "Collateral inputs"),
    reference_inputs: inputs.filter((input) => bindingValue(input.section) === "Reference inputs"),
  };
  const addInputGroup = (label, order, rowsForSection, childLabel, options = {}) => {
    const parentId = `decoded-body-${slug(label)}`;
    if (rowsForSection.length === 0) {
      if (options.presentWhenEmpty) {
        addContainerField("decoded-body", 3, order, label, countText(0, "input"));
        return;
      }
      addNullField("decoded-body", 3, order, label);
      return;
    }
    addContainerField("decoded-body", 3, order, label, countText(rowsForSection.length, "input"));
    rowsForSection.forEach((input, index) => {
      const section = bindingValue(input.section);
      const flatTxOutRef = bindingValue(input.txOutRef);
      const flatParts = txOutRefParts(flatTxOutRef);
      const tx = bindingValue(input.txIdHex) || flatParts.tx;
      const inputIndex = bindingValue(input.index) || flatParts.index;
      const value =
        tx === "" && inputIndex === ""
          ? bindingValue(input.entity)
          : `${compact(tx, 28)}#${inputIndex}`;
      const raw =
        flatTxOutRef ||
        (tx === "" ? bindingValue(input.entity) : `${tx}#${inputIndex}`);
      const resolved = resolvedFrom(
        labelMatches,
        bindingValue(input.resolvedLabel),
        bindingValue(input.resolvedType),
        raw,
        bindingValue(input.entity),
      );
      appendLeaf(
        rows,
        parentId,
        4,
        index,
        `${childLabel} ${index}`,
        "tx-out-ref",
        value,
        {
          raw,
          entityIri: annotationEntityIri(bindingValue(input.entity), "tx-out-ref", raw),
          resolvedLabel: resolved.resolvedLabel,
          resolvedType: resolved.resolvedType,
          annotationPredicate: raw === "" ? "" : "cardano:txOutRef",
          annotationValue: raw,
        },
      );
    });
  };
  const addWithdrawals = () => {
    if (withdrawals.length === 0) {
      addNullField("decoded-body", 3, 60, "withdrawals");
      return;
    }
    addContainerField(
      "decoded-body",
      3,
      60,
      "withdrawals",
      countText(withdrawals.length, "withdrawal"),
    );
    withdrawals.forEach((withdrawal, index) => {
      const withdrawalId = `decoded-withdrawal-${index}`;
      addNode({
        id: withdrawalId,
        parentId: "decoded-body-withdrawals",
        depth: 4,
        order: index,
        label: `Withdrawal ${index}`,
        kind: "withdrawal",
        value: bindingValue(withdrawal.withdrawal),
        summary: compact(bindingValue(withdrawal.withdrawal)),
        raw: bindingValue(withdrawal.withdrawal),
      });
      const account = bindingValue(withdrawal.account);
      const accountRaw = bindingValue(withdrawal.accountRaw);
      appendLeaf(
        rows,
        withdrawalId,
        5,
        10,
        "Withdrawal account",
        "identifier",
        account,
        {
          raw: accountRaw || account,
          entityIri: account,
          annotationPredicate: accountRaw === "" ? "" : "cardano:bytesHex",
          annotationValue: accountRaw,
        },
      );
      appendLeaf(
        rows,
        withdrawalId,
        5,
        20,
        "Lovelace",
        "lovelace",
        bindingValue(withdrawal.lovelace),
      );
    });
  };
  const addRequiredSigners = () => {
    if (requiredSigners.length === 0) {
      addNullField("decoded-body", 3, 130, "required_signers");
      return;
    }
    if (requiredSigners.length > 1) {
      addContainerField(
        "decoded-body",
        3,
        130,
        "required_signers",
        countText(requiredSigners.length, "signer"),
      );
    }
    requiredSigners.forEach((signer, index) => {
      const entity = bindingValue(signer.entity);
      const raw = bindingValue(signer.raw);
      const value = raw || entity;
      const resolved = resolvedFrom(
        labelMatches,
        bindingValue(signer.resolvedLabel),
        bindingValue(signer.resolvedType),
        raw,
        entity,
      );
      addNode({
        id:
          requiredSigners.length === 1
            ? "decoded-body-required-signers"
            : `decoded-body-required-signers-${index}`,
        parentId:
          requiredSigners.length === 1
            ? "decoded-body"
            : "decoded-body-required-signers",
        depth: requiredSigners.length === 1 ? 3 : 4,
        order: requiredSigners.length === 1 ? 130 : index,
        label:
          requiredSigners.length === 1
            ? "required_signers"
            : `Required signer ${index}`,
        kind: "hash",
        value,
        summary: compact(value),
        raw: value,
        entityIri: entity,
        resolvedLabel: resolved.resolvedLabel,
        resolvedType: resolved.resolvedType,
        annotationPredicate: raw === "" ? "" : "cardano:bytesHex",
        annotationValue: raw,
      });
    });
  };

  addNode({
    id: "decoded-transaction-hash",
    parentId: "decoded-root",
    depth: 1,
    order: 10,
    label: "transaction_hash",
    kind: "hash",
    value: txId,
    summary: compact(txId),
    raw: txId,
    entityIri: annotationEntityIri(transactionId, "tx", txId),
    resolvedLabel: rootResolved.resolvedLabel,
    resolvedType: rootResolved.resolvedType,
    annotationPredicate: txId === "" ? "" : "cardano:bytesHex",
    annotationValue: txId,
  });
  addNode({
    id: "decoded-transaction",
    parentId: "decoded-root",
    depth: 1,
    order: 20,
    label: "transaction",
    kind: humanToken(firstBindingValue(root.resolvedType) || "Transaction"),
    value: transactionId,
    summary: compact(transactionId),
    raw: txId,
    entityIri: transactionId,
    resolvedLabel: rootResolved.resolvedLabel,
    resolvedType: rootResolved.resolvedType,
  });
  addContainerField(
    "decoded-transaction",
    2,
    10,
    "body",
    countText(21, "field"),
    { id: "decoded-body" },
  );
  addContainerField(
    "decoded-transaction",
    2,
    20,
    "witness_set",
    countText(6, "field"),
    { id: "decoded-witness_set" },
  );

  const bodyFieldOrder = [
    ["inputs", 10, () => addInputGroup("inputs", 10, groupedInputs.inputs, "Input", { presentWhenEmpty: true })],
    ["outputs", 20, () => {
      const outputParentId = "decoded-body-outputs";
      if (outputs.length === 0) {
        addNullField("decoded-body", 3, 20, "outputs");
        return;
      }
      addContainerField("decoded-body", 3, 20, "outputs", countText(outputs.length, "output"));
    outputs.forEach((output, index) => {
      const outputIndex = firstBindingValue(output.index, { value: String(index) });
      const outputId = `decoded-output-${slug(outputIndex)}-${index}`;
      const outputValue = bindingValue(output.output);
      const outputResolved = resolvedFrom(
        labelMatches,
        bindingValue(output.resolvedLabel),
        bindingValue(output.resolvedType),
        outputValue,
        txOutRefFromUtxoUri(outputValue),
      );
      const outputTxOutRef = txOutRefFromUtxoUri(outputValue);
      rows.push(
        treeRow({
          id: outputId,
          parentId: outputParentId,
          depth: 4,
          order: index,
          label: `Output ${outputIndex}`,
          kind: "output",
          value: outputValue,
          summary: compact(outputValue),
          raw: outputValue,
          entityIri: outputValue,
          resolvedLabel: outputResolved.resolvedLabel,
          resolvedType: outputResolved.resolvedType,
          annotationPredicate: outputTxOutRef === "" ? "" : "cardano:txOutRef",
          annotationValue: outputTxOutRef,
        }),
      );
      appendLeaf(rows, outputId, 5, 10, "Index", "integer", outputIndex);
      appendLeaf(rows, outputId, 5, 20, "Lovelace", "lovelace", bindingValue(output.lovelace));
      appendLeaf(rows, outputId, 5, 30, "Address", "address", bindingValue(output.address), {
        resolvedLabel: resolvedFrom(
          labelMatches,
          "",
          "",
          bindingValue(output.addressBech32),
          bindingValue(output.address),
        ).resolvedLabel,
        resolvedType: resolvedFrom(
          labelMatches,
          "",
          "",
          bindingValue(output.addressBech32),
          bindingValue(output.address),
        ).resolvedType,
        entityIri: annotationEntityIri(bindingValue(output.address), "address", bindingValue(output.addressBech32)),
        annotationPredicate: "cardano:bech32",
        annotationValue: bindingValue(output.addressBech32),
      });
      const datumHash = firstBindingValue(output.datumHashHex, output.datumHash);
      const datumHashResolved = resolvedFrom(
        labelMatches,
        "",
        "",
        bindingValue(output.datumHashHex),
        bindingValue(output.datumHash),
      );
      appendLeaf(rows, outputId, 5, 40, "Datum hash", "hash", datumHash, {
        resolvedLabel: datumHashResolved.resolvedLabel,
        resolvedType: datumHashResolved.resolvedType,
        entityIri: annotationEntityIri(bindingValue(output.datumHash), "hash", bindingValue(output.datumHashHex)),
        annotationPredicate: "cardano:bytesHex",
        annotationValue: bindingValue(output.datumHashHex),
      });
      const datumRawResolved = resolvedFrom(labelMatches, "", "", bindingValue(output.datumRaw));
      appendLeaf(rows, outputId, 5, 50, "Datum raw bytes", "raw-bytes", bindingValue(output.datumRaw), {
        resolvedLabel: datumRawResolved.resolvedLabel,
        resolvedType: datumRawResolved.resolvedType,
        entityIri: annotationEntityIri(bindingValue(output.datum), "raw-bytes", bindingValue(output.datumRaw)),
        annotationPredicate: "cardano:hasRawBytes",
        annotationValue: bindingValue(output.datumRaw),
      });
    });
    }],
    ["fee", 30, () => addBodyScalar("decoded-body", 3, 30, "fee", "Fee")],
    ["ttl", 40, () => addBodyScalar("decoded-body", 3, 40, "ttl", "TTL")],
    ["certs", 50, () => addNullField("decoded-body", 3, 50, "certs")],
    ["withdrawals", 60, addWithdrawals],
    ["update", 70, () => addNullField("decoded-body", 3, 70, "update")],
    ["auxiliary_data_hash", 80, () => addBodyScalar("decoded-body", 3, 80, "auxiliary_data_hash", "Auxiliary data hash")],
    ["validity_start_interval", 90, () => addNullField("decoded-body", 3, 90, "validity_start_interval")],
    ["mint", 100, () => addBodyScalar("decoded-body", 3, 100, "mint", "Mint")],
    ["script_data_hash", 110, () => addBodyScalar("decoded-body", 3, 110, "script_data_hash", "Script data hash")],
    ["collateral", 120, () => addInputGroup("collateral", 120, groupedInputs.collateral, "Collateral")],
    ["required_signers", 130, addRequiredSigners],
    ["network_id", 140, () => addBodyScalar("decoded-body", 3, 140, "network_id", "Network id")],
    ["collateral_return", 150, () => addBodyScalar("decoded-body", 3, 150, "collateral_return", "Collateral return")],
    ["total_collateral", 160, () => addBodyScalar("decoded-body", 3, 160, "total_collateral", "Total collateral")],
    ["reference_inputs", 170, () => addInputGroup("reference_inputs", 170, groupedInputs.reference_inputs, "Reference input")],
    ["voting_procedures", 180, () => addNullField("decoded-body", 3, 180, "voting_procedures")],
    ["voting_proposals", 190, () => addNullField("decoded-body", 3, 190, "voting_proposals")],
    ["donation", 200, () => addNullField("decoded-body", 3, 200, "donation")],
    ["current_treasury_value", 210, () => addNullField("decoded-body", 3, 210, "current_treasury_value")],
  ];
  bodyFieldOrder.forEach(([, , add]) => add());

  if (witnesses.length === 0) {
    addNullField("decoded-witness_set", 3, 10, "vkeys");
  } else {
    addContainerField("decoded-witness_set", 3, 10, "vkeys", "");
    witnesses.forEach((witness, index) => {
      const witnessId = `decoded-key-witness-${index}`;
      const witnessValue = firstBindingValue(witness.verificationKeyHex, witness.verificationKey, witness.witness);
      const witnessResolved = resolvedFrom(
        labelMatches,
        bindingValue(witness.resolvedLabel),
        bindingValue(witness.resolvedType),
        witnessValue,
        bindingValue(witness.witness),
      );
      rows.push(
        treeRow({
          id: witnessId,
          parentId: "decoded-witness_set-vkeys",
          depth: 4,
          order: index,
          label: `Key witness ${index}`,
          kind: "key-witness",
          value: witnessValue,
          summary: compact(witnessValue),
          raw: bindingValue(witness.witness),
          entityIri: bindingValue(witness.witness),
          resolvedLabel: witnessResolved.resolvedLabel,
          resolvedType: witnessResolved.resolvedType,
        }),
      );
      const keyValue = firstBindingValue(witness.verificationKeyHex, witness.verificationKey);
      const keyResolved = resolvedFrom(labelMatches, "", "", keyValue);
      appendLeaf(rows, witnessId, 5, 10, "Verification key", "key", keyValue, {
        resolvedLabel: keyResolved.resolvedLabel,
        resolvedType: keyResolved.resolvedType,
        entityIri: annotationEntityIri(bindingValue(witness.verificationKey), "key", bindingValue(witness.verificationKeyHex)),
        annotationPredicate: "cardano:bytesHex",
        annotationValue: bindingValue(witness.verificationKeyHex),
      });
      const signatureResolved = resolvedFrom(labelMatches, "", "", bindingValue(witness.signature));
      appendLeaf(rows, witnessId, 5, 20, "Signature", "signature", bindingValue(witness.signature), {
        resolvedLabel: signatureResolved.resolvedLabel,
        resolvedType: signatureResolved.resolvedType,
      });
    });
  }

  addNullField("decoded-witness_set", 3, 20, "native_scripts");
  addNullField("decoded-witness_set", 3, 30, "bootstraps");
  addNullField("decoded-witness_set", 3, 40, "plutus_scripts");
  addNullField("decoded-witness_set", 3, 50, "plutus_data");
  if (redeemers.length === 0) {
    addNullField("decoded-witness_set", 3, 60, "redeemers");
  } else {
    addContainerField("decoded-witness_set", 3, 60, "redeemers", countText(redeemers.length, "redeemer"));
    redeemers.forEach((redeemer, index) => {
      const redeemerId = `decoded-redeemer-${index}`;
      const purpose = bindingValue(redeemer.purpose);
      const redeemerIndex = bindingValue(redeemer.index);
      const redeemerResolved = resolvedFrom(
        labelMatches,
        bindingValue(redeemer.resolvedLabel),
        bindingValue(redeemer.resolvedType),
        bindingValue(redeemer.redeemer),
        bindingValue(redeemer.dataHashHex),
        bindingValue(redeemer.dataRaw),
      );
      rows.push(
        treeRow({
          id: redeemerId,
          parentId: "decoded-witness_set-redeemers",
          depth: 4,
          order: index,
          label: purpose === "" ? `Redeemer ${index}` : `${purpose} redeemer ${redeemerIndex}`,
          kind: "redeemer",
          value: bindingValue(redeemer.redeemer),
          summary: compact(firstBindingValue(redeemer.dataHashHex, redeemer.dataHash, redeemer.redeemer)),
          raw: bindingValue(redeemer.redeemer),
          entityIri: bindingValue(redeemer.redeemer),
          resolvedLabel: redeemerResolved.resolvedLabel,
          resolvedType: redeemerResolved.resolvedType,
        }),
      );
      appendLeaf(rows, redeemerId, 5, 10, "Purpose", "purpose", purpose);
      appendLeaf(rows, redeemerId, 5, 20, "Index", "integer", redeemerIndex);
      const dataHashValue = firstBindingValue(redeemer.dataHashHex, redeemer.dataHash);
      const dataHashResolved = resolvedFrom(
        labelMatches,
        "",
        "",
        bindingValue(redeemer.dataHashHex),
        bindingValue(redeemer.dataHash),
      );
      appendLeaf(rows, redeemerId, 5, 30, "Data hash", "hash", dataHashValue, {
        resolvedLabel: dataHashResolved.resolvedLabel,
        resolvedType: dataHashResolved.resolvedType,
        entityIri: annotationEntityIri(bindingValue(redeemer.dataHash), "hash", bindingValue(redeemer.dataHashHex)),
        annotationPredicate: "cardano:bytesHex",
        annotationValue: bindingValue(redeemer.dataHashHex),
      });
      const dataRawResolved = resolvedFrom(labelMatches, "", "", bindingValue(redeemer.dataRaw));
      appendLeaf(rows, redeemerId, 5, 40, "Data raw bytes", "raw-bytes", bindingValue(redeemer.dataRaw), {
        resolvedLabel: dataRawResolved.resolvedLabel,
        resolvedType: dataRawResolved.resolvedType,
        entityIri: annotationEntityIri(bindingValue(redeemer.data), "raw-bytes", bindingValue(redeemer.dataRaw)),
        annotationPredicate: "cardano:hasRawBytes",
        annotationValue: bindingValue(redeemer.dataRaw),
      });
      appendLeaf(rows, redeemerId, 5, 50, "Memory units", "ex-units", bindingValue(redeemer.memory));
      appendLeaf(rows, redeemerId, 5, 60, "CPU units", "ex-units", bindingValue(redeemer.cpu));
    });
  }

  const validityField = bodyFieldByLabel.get("Validity");
  const isValidValue = firstBindingValue(root.valid, validityField?.value);
  addNode({
    id: "decoded-is-valid",
    parentId: "decoded-transaction",
    depth: 2,
    order: 30,
    label: "is_valid",
    kind: "boolean",
    value: isValidValue === "" ? "NULL" : isValidValue,
    summary: isValidValue === "" ? "NULL" : isValidValue,
    raw: isValidValue,
    resolvedType: "https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#isValid",
  });
  addContainerField(
    "decoded-transaction",
    2,
    40,
    "auxiliary_data",
    metadataRows.length === 0 ? "NULL" : countText(metadataRows.length, "label"),
    { id: "decoded-auxiliary_data" },
  );
  if (metadataRows.length > 0) {
    addContainerField("decoded-auxiliary_data", 3, 10, "metadata", countText(metadataRows.length, "label"));
    metadataRows.forEach((meta, index) => {
      const metaId = `decoded-metadata-${slug(bindingValue(meta.label))}-${index}`;
      const metaResolved = resolvedFrom(
        labelMatches,
        bindingValue(meta.resolvedLabel),
        bindingValue(meta.resolvedType),
        bindingValue(meta.raw),
        bindingValue(meta.metadata),
      );
      rows.push(
        treeRow({
          id: metaId,
          parentId: "decoded-auxiliary_data-metadata",
          depth: 4,
          order: index,
          label: `Metadata label ${bindingValue(meta.label)}`,
          kind: "metadata",
          value: bindingValue(meta.metadata),
          summary: compact(firstBindingValue(meta.text, meta.raw, meta.metadata)),
          raw: firstBindingValue(meta.raw, meta.metadata),
          entityIri: bindingValue(meta.metadata),
          resolvedLabel: metaResolved.resolvedLabel,
          resolvedType: metaResolved.resolvedType,
        }),
      );
      appendLeaf(rows, metaId, 5, 10, "Metadata label", "integer", bindingValue(meta.label));
      appendLeaf(rows, metaId, 5, 20, "Text", "text", bindingValue(meta.text));
      appendLeaf(rows, metaId, 5, 30, "Raw bytes", "raw-bytes", bindingValue(meta.raw), {
        entityIri: annotationEntityIri(bindingValue(meta.metadata), "raw-bytes", bindingValue(meta.raw)),
        annotationPredicate: "cardano:hasRawBytes",
        annotationValue: bindingValue(meta.raw),
      });
    });
  } else {
    addNullField("decoded-auxiliary_data", 3, 10, "metadata");
  }
  addNullField("decoded-auxiliary_data", 3, 20, "native_scripts");
  addNullField("decoded-auxiliary_data", 3, 30, "plutus_scripts");
  addNullField("decoded-auxiliary_data", 3, 40, "prefer_alonzo_format");

  return rows.sort((a, b) => {
    if (a.parentId !== b.parentId) return a.parentId.localeCompare(b.parentId);
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label);
  });
};

const reportText = (value) =>
  value === null || value === undefined ? "" : String(value);

const upsertShapeMetadata = (metadata, key, fields) => {
  if (key === "") return;
  const existing = metadata.get(key) || {};
  metadata.set(key, {
    sourceShape: fields.sourceShape || existing.sourceShape || "",
    path: fields.path || existing.path || "",
    message: fields.message || existing.message || "",
    severity: fields.severity || existing.severity || "",
  });
};

const shapeMetadata = (shapesTtl) => {
  const queries = [
    `
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?sourceShape ?path ?message ?severity
WHERE {
  ?sourceShape sh:path ?path .
  OPTIONAL { ?sourceShape sh:message ?message . }
  OPTIONAL { ?sourceShape sh:severity ?severity . }
}
`,
    `
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?sourceShape ?path ?message ?severity
WHERE {
  ?sourceShape sh:message ?message .
  OPTIONAL { ?sourceShape sh:path ?path . }
  OPTIONAL { ?sourceShape sh:message ?message . }
  OPTIONAL { ?sourceShape sh:severity ?severity . }
}
`,
    `
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?sourceShape ?constraint ?message ?severity ?shapeSeverity
WHERE {
  ?sourceShape sh:sparql ?constraint .
  OPTIONAL { ?constraint sh:message ?message . }
  OPTIONAL { ?constraint sh:severity ?severity . }
  OPTIONAL { ?sourceShape sh:severity ?shapeSeverity . }
}
`,
  ];
  const metadata = new Map();

  for (const query of queries) {
    try {
      const result = globalThis.rdfShapes.query(shapesTtl, query);
      const bindings = result?.json?.results?.bindings;
      if (!Array.isArray(bindings)) continue;

      for (const binding of bindings) {
        const sourceShape = bindingValue(binding.sourceShape);
        const path = bindingValue(binding.path);
        const constraint = bindingValue(binding.constraint);
        const message = bindingValue(binding.message);
        const severity = firstBindingValue(binding.severity, binding.shapeSeverity);
        upsertShapeMetadata(metadata, sourceShape, {
          sourceShape,
          path,
          message: constraint === "" ? message : "",
          severity,
        });
        upsertShapeMetadata(metadata, constraint, {
          sourceShape: constraint,
          path,
          message,
          severity,
        });
        upsertShapeMetadata(metadata, path, {
          sourceShape,
          path,
          message,
          severity,
        });
      }
    } catch (_) {
      continue;
    }
  }

  return metadata;
};

const normalizedSeverity = (rawSeverity, metadata) => {
  const severity = String(rawSeverity || metadata.severity || "");
  if (severity.includes("Warning")) return "warning";
  if (severity.includes("Info")) return "info";
  return "error";
};

const metadataForViolation = (violation, metadata) => {
  const sourceShape = reportText(
    violation?.source_shape ??
      violation?.sourceShape ??
      violation?.source ??
      violation?.shape,
  );
  const path = reportText(violation?.path ?? violation?.result_path);
  return {
    sourceShape,
    path,
    metadata:
      metadata.get(sourceShape) ||
      metadata.get(path) ||
      {},
  };
};

const reportSeverity = (violation) =>
  reportText(
    violation?.result_severity ??
      violation?.resultSeverity ??
      violation?.severity,
  );

const sparqlConstraintsQuery = `
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?sourceShape ?constraint ?select ?message ?severity ?shapeSeverity
WHERE {
  ?sourceShape sh:sparql ?constraint .
  ?constraint sh:select ?select .
  OPTIONAL { ?constraint sh:message ?message . }
  OPTIONAL { ?constraint sh:severity ?severity . }
  OPTIONAL { ?sourceShape sh:severity ?shapeSeverity . }
}
`;

const normalizeViolation = (violation, metadata) => {
  const lookup = metadataForViolation(violation, metadata);
  const sourceShape = lookup.sourceShape || lookup.metadata.sourceShape || "";
  const path = lookup.path || lookup.metadata.path || "";
  const message = lookup.metadata.message || reportText(violation?.message);

  return {
    focusNode: reportText(
      violation?.focus_node ??
        violation?.focusNode ??
        violation?.focus,
    ),
    path,
    value: reportText(violation?.value ?? violation?.result_value),
    sourceShape,
    sourceConstraintComponent: reportText(
      violation?.source_constraint_component ??
        violation?.sourceConstraintComponent,
    ),
    message,
    severity: normalizedSeverity(reportSeverity(violation), lookup.metadata),
  };
};

const sparqlConstraintViolations = (dataTtl, shapesTtl) => {
  let constraints = [];
  try {
    constraints = queryBindings(shapesTtl, sparqlConstraintsQuery);
  } catch (_) {
    return [];
  }

  const violations = [];
  for (const constraint of constraints) {
    const select = bindingValue(constraint.select);
    if (select === "") continue;
    const sourceShape = firstBindingValue(constraint.constraint, constraint.sourceShape);
    const message = bindingValue(constraint.message);
    const severity = normalizedSeverity(
      firstBindingValue(constraint.severity, constraint.shapeSeverity),
      {},
    );
    const query = select.replaceAll("$this", "?this");

    let rows = [];
    try {
      rows = queryBindings(dataTtl, query);
    } catch (_) {
      continue;
    }

    for (const row of rows) {
      violations.push({
        focusNode: firstBindingValue(row.this, row.focusNode, row.focus_node),
        path: "",
        value: bindingValue(row.value),
        sourceShape,
        sourceConstraintComponent: "http://www.w3.org/ns/shacl#SPARQLConstraint",
        message,
        severity,
      });
    }
  }

  return violations;
};

const violationKey = (violation) =>
  [
    violation.focusNode,
    violation.path,
    violation.value,
    violation.sourceShape,
    violation.message,
  ].join("\u0000");

const mergeViolations = (left, right) => {
  const seen = new Set();
  const merged = [];
  for (const violation of [...left, ...right]) {
    const key = violationKey(violation);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(violation);
  }
  return merged;
};

const normalizeValidationReport = (dataTtl, result, shapesTtl) => {
  if (!result || typeof result !== "object") {
    throw new Error("validate did not return an object");
  }
  if (typeof result.conforms !== "boolean") {
    throw new Error("validate result missing conforms boolean");
  }

  const metadata = shapeMetadata(shapesTtl);
  const rudofViolations = Array.isArray(result.violations)
    ? result.violations.map((violation) =>
        normalizeViolation(violation, metadata),
      )
    : [];
  const sparqlViolations = sparqlConstraintViolations(dataTtl, shapesTtl);
  const violations = mergeViolations(rudofViolations, sparqlViolations);

  return {
    conforms: result.conforms && violations.length === 0,
    violations,
  };
};

globalThis.txInspectorValidateShacl = (dataTtl, shapesTtl) =>
  normalizeValidationReport(
    dataTtl,
    globalThis.rdfShapes.validate(dataTtl, shapesTtl),
    shapesTtl,
  );

export const queryImpl = (left) => (right) => (graphTtl) => (sparql) => () => {
  try {
    return right(globalThis.rdfShapes.query(graphTtl, sparql));
  } catch (err) {
    return left(errText(err));
  }
};

export const queryResolvedLabelsImpl = (left) => (right) => (graphTtl) => () => {
  try {
    const result = globalThis.rdfShapes.query(graphTtl, resolvedLabelsQuery);
    const matchesResult = globalThis.rdfShapes.query(graphTtl, resolvedLabelMatchesQuery);
    return right(normalizeResolvedLabelRows(result, matchesResult));
  } catch (err) {
    return left(errText(err));
  }
};

export const queryTransactionOutputsImpl = (left) => (right) => (graphTtl) => () => {
  try {
    const result = globalThis.rdfShapes.query(graphTtl, transactionOutputsQuery);
    return right(normalizeTransactionOutputRows(result));
  } catch (err) {
    return left(errText(err));
  }
};

export const queryTypedFieldsImpl = (left) => (right) => (graphTtl) => () => {
  try {
    const result = globalThis.rdfShapes.query(graphTtl, typedFieldsQuery);
    return right(normalizeTypedFieldRows(result));
  } catch (err) {
    return left(errText(err));
  }
};

export const queryDecodedTreeImpl = (left) => (right) => (graphTtl) => () => {
  try {
    return right(normalizeDecodedTreeRows(graphTtl));
  } catch (err) {
    return left(errText(err));
  }
};

export const validateImpl = (left) => (right) => (dataTtl) => (shapesTtl) => () => {
  try {
    return right(
      globalThis.txInspectorValidateShacl(dataTtl, shapesTtl),
    );
  } catch (err) {
    return left(errText(err));
  }
};
