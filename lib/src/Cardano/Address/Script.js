import { bech32 } from "bech32";
import { blake2b } from "@noble/hashes/blake2b";

const fail = (message) => {
  throw new Error(message);
};

const KNOWN_28_BYTE_HRPS = new Set([
  "addr_shared_vkh",
  "stake_shared_vkh",
  "addr_vkh",
  "stake_vkh",
  "policy_vkh",
  "drep_vkh",
  "cc_cold_vkh",
  "cc_hot_vkh",
]);

const KNOWN_29_BYTE_HRPS = new Map([
  ["drep", 0b00100010],
  ["cc_cold", 0b00010010],
  ["cc_hot", 0b00000010],
]);

const KNOWN_32_BYTE_HRPS = new Set([
  "addr_shared_vk",
  "addr_vk",
  "stake_shared_vk",
  "stake_vk",
  "policy_vk",
  "drep_vk",
  "cc_cold_vk",
  "cc_hot_vk",
]);

const KNOWN_64_BYTE_HRPS = new Set([
  "addr_shared_xvk",
  "addr_xvk",
  "stake_shared_xvk",
  "stake_xvk",
  "policy_xvk",
  "drep_xvk",
  "cc_cold_xvk",
  "cc_hot_xvk",
]);

const SHARED_KEY_HASH_HRP = "addr_shared_vkh";

const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const concatBytes = (...chunks) => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const hashCredential = (bytes) => Uint8Array.from(blake2b(bytes, { dkLen: 28 }));

const parseHexBytes = (value) => {
  const normalized = value.trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    return null;
  }

  return Uint8Array.from(
    normalized.match(/.{2}/g).map((hex) => parseInt(hex, 16)),
  );
};

const decodeXPubHex = (value) => {
  const bytes = parseHexBytes(value);
  if (bytes === null || bytes.length !== 64) {
    fail("Cosigner xpub must be a 64-byte extended public key encoded as hex.");
  }
  return bytes;
};

const parseCosignerText = (value) => {
  const match = /^cosigner#(\d+)$/.exec(value);
  if (!match) {
    fail("Cosigners must use the form cosigner#N.");
  }
  const index = Number.parseInt(match[1], 10);
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    fail("Cosigner number should be between 0 and 255.");
  }
  return index;
};

const decodeKeyHashText = (value) => {
  const hexBytes = parseHexBytes(value);
  if (hexBytes !== null) {
    if (hexBytes.length === 28) {
      return hexBytes;
    }
    if (hexBytes.length === 32) {
      return hashCredential(hexBytes);
    }
    if (hexBytes.length === 64) {
      return hashCredential(hexBytes.slice(0, 32));
    }

    fail(
      "Hex key material must be 28-byte hash, 32-byte public key, or 64-byte extended public key.",
    );
  }

  let decoded;
  try {
    decoded = bech32.decode(value, 1023);
  } catch (error) {
    fail("Script signature must be a valid key hash or public key text value.");
  }

  const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
  const { prefix } = decoded;

  if (KNOWN_28_BYTE_HRPS.has(prefix) && bytes.length === 28) {
    return bytes;
  }

  if (KNOWN_29_BYTE_HRPS.has(prefix) && bytes.length === 29) {
    const expectedTag = KNOWN_29_BYTE_HRPS.get(prefix);
    if (bytes[0] !== expectedTag) {
      fail("Governance key hash payload uses the wrong CIP-0129 tag byte.");
    }
    return bytes.slice(1);
  }

  if (KNOWN_29_BYTE_HRPS.has(prefix) && bytes.length === 28) {
    return bytes;
  }

  if (KNOWN_32_BYTE_HRPS.has(prefix) && bytes.length === 32) {
    return hashCredential(bytes);
  }

  if (KNOWN_64_BYTE_HRPS.has(prefix) && bytes.length === 64) {
    return hashCredential(bytes.slice(0, 32));
  }

  fail("Unsupported key hash or public key human-readable prefix.");
};

const encodeUnsigned = (major, value) => {
  if (!Number.isInteger(value) || value < 0) {
    fail("CBOR encoder received a non-negative integer outside its supported range.");
  }

  if (value < 24) {
    return Uint8Array.of((major << 5) | value);
  }

  if (value < 0x100) {
    return Uint8Array.of((major << 5) | 24, value);
  }

  if (value < 0x10000) {
    return Uint8Array.of((major << 5) | 25, value >> 8, value & 0xff);
  }

  if (value < 0x100000000) {
    return Uint8Array.of(
      (major << 5) | 26,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }

  fail("CBOR encoder does not support integers above 32 bits.");
};

const encodeBytes = (bytes) => concatBytes(encodeUnsigned(2, bytes.length), bytes);

const encodeArray = (items) =>
  concatBytes(encodeUnsigned(4, items.length), ...items);

const readLength = (bytes, state, additional) => {
  if (additional < 24) {
    return additional;
  }

  const readByte = () => {
    if (state.offset >= bytes.length) {
      fail("Unexpected end of CBOR input.");
    }

    return bytes[state.offset++];
  };

  if (additional === 24) {
    return readByte();
  }

  if (additional === 25) {
    return (readByte() << 8) | readByte();
  }

  if (additional === 26) {
    return (
      readByte() * 0x1000000 +
      (readByte() << 16) +
      (readByte() << 8) +
      readByte()
    );
  }

  fail(`Unsupported CBOR additional info: ${additional}`);
};

const decodeItem = (bytes, state) => {
  if (state.offset >= bytes.length) {
    fail("Unexpected end of CBOR input.");
  }

  const initial = bytes[state.offset++];
  const major = initial >> 5;
  const additional = initial & 0x1f;

  switch (major) {
    case 0:
      return readLength(bytes, state, additional);
    case 2: {
      const length = readLength(bytes, state, additional);
      const start = state.offset;
      const end = start + length;

      if (end > bytes.length) {
        fail("Unexpected end of CBOR byte string.");
      }

      state.offset = end;
      return bytes.slice(start, end);
    }
    case 4: {
      const length = readLength(bytes, state, additional);
      const items = [];

      for (let index = 0; index < length; index += 1) {
        items.push(decodeItem(bytes, state));
      }

      return items;
    }
    default:
      fail(`Unsupported CBOR major type: ${major}`);
  }
};

const decodeSingle = (bytes) => {
  const state = { offset: 0 };
  const value = decodeItem(bytes, state);

  if (state.offset !== bytes.length) {
    fail("Unconsumed bytes remaining after CBOR decode.");
  }

  return value;
};

const expectArray = (value, message) => {
  if (!Array.isArray(value)) {
    fail(message);
  }

  return value;
};

const expectBytes = (value, message) => {
  if (!(value instanceof Uint8Array)) {
    fail(message);
  }

  return value;
};

const expectNumber = (value, message) => {
  if (!Number.isInteger(value) || value < 0) {
    fail(message);
  }

  return value;
};

const issue = (level, code, message) => ({ level, code, message });

const parseScript = (value) => {
  const script = expectArray(value, "Native script must decode to a CBOR array.");
  const tag = expectNumber(script[0], "Native script tag must be a non-negative integer.");

  switch (tag) {
    case 0: {
      if (script.length !== 2) {
        fail("Signature script must be a 2-element array.");
      }

      const keyHash = expectBytes(script[1], "Signature script key hash must be bytes.");

      if (keyHash.length !== 28) {
        fail("Signature script key hash must be 28 bytes.");
      }

      return { kind: "Signature", keyHashHex: bytesToHex(keyHash) };
    }
    case 1:
    case 2: {
      if (script.length !== 2) {
        fail(`${tag === 1 ? "All" : "Any"} script must be a 2-element array.`);
      }

      return {
        kind: tag === 1 ? "All" : "Any",
        scripts: expectArray(script[1], "Script list must be an array.").map(parseScript),
      };
    }
    case 3: {
      if (script.length !== 3) {
        fail("At least script must be a 3-element array.");
      }

      return {
        kind: "AtLeast",
        required: expectNumber(script[1], "At least script threshold must be a non-negative integer."),
        scripts: expectArray(script[2], "At least script list must be an array.").map(parseScript),
      };
    }
    case 4:
    case 5: {
      if (script.length !== 2) {
        fail(`${tag === 4 ? "Active from" : "Active until"} script must be a 2-element array.`);
      }

      return {
        kind: tag === 4 ? "ActiveFrom" : "ActiveUntil",
        slot: expectNumber(script[1], "Timelock slot must be a non-negative integer."),
      };
    }
    default:
      fail(`Unsupported native script tag: ${tag}`);
  }
};

const parseScriptJson = (value) => {
  if (typeof value === "string") {
    return {
      kind: "Signature",
      keyHashHex: bytesToHex(decodeKeyHashText(value)),
    };
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("Native script JSON must be a string or an object.");
  }

  const keys = Object.keys(value);
  if (keys.length !== 1) {
    fail("Native script JSON objects must contain exactly one constructor key.");
  }

  const [key] = keys;
  switch (key) {
    case "all":
      if (!Array.isArray(value.all)) {
        fail("The 'all' constructor must contain an array.");
      }
      return { kind: "All", scripts: value.all.map(parseScriptJson) };
    case "any":
      if (!Array.isArray(value.any)) {
        fail("The 'any' constructor must contain an array.");
      }
      return { kind: "Any", scripts: value.any.map(parseScriptJson) };
    case "some": {
      const descriptor = value.some;
      if (
        descriptor === null ||
        typeof descriptor !== "object" ||
        Array.isArray(descriptor)
      ) {
        fail("The 'some' constructor must contain an object.");
      }
      if (!Array.isArray(descriptor.from)) {
        fail("The 'some.from' field must contain an array.");
      }
      return {
        kind: "AtLeast",
        required: expectNumber(
          descriptor.at_least,
          "The 'some.at_least' field must be a non-negative integer.",
        ),
        scripts: descriptor.from.map(parseScriptJson),
      };
    }
    case "active_from":
      return {
        kind: "ActiveFrom",
        slot: expectNumber(
          value.active_from,
          "The 'active_from' field must be a non-negative integer.",
        ),
      };
    case "active_until":
      return {
        kind: "ActiveUntil",
        slot: expectNumber(
          value.active_until,
          "The 'active_until' field must be a non-negative integer.",
        ),
      };
    default:
      fail("Unknown native script JSON constructor.");
  }
};

const parseTemplateScriptJson = (value) => {
  if (typeof value === "string") {
    return {
      kind: "Cosigner",
      cosigner: parseCosignerText(value),
    };
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("ScriptTemplate JSON must use strings or objects in the template field.");
  }

  const keys = Object.keys(value);
  if (keys.length !== 1) {
    fail("ScriptTemplate objects must contain exactly one constructor key.");
  }

  const [key] = keys;
  switch (key) {
    case "all":
      if (!Array.isArray(value.all)) {
        fail("The 'all' constructor must contain an array.");
      }
      return { kind: "All", scripts: value.all.map(parseTemplateScriptJson) };
    case "any":
      if (!Array.isArray(value.any)) {
        fail("The 'any' constructor must contain an array.");
      }
      return { kind: "Any", scripts: value.any.map(parseTemplateScriptJson) };
    case "some": {
      const descriptor = value.some;
      if (
        descriptor === null ||
        typeof descriptor !== "object" ||
        Array.isArray(descriptor)
      ) {
        fail("The 'some' constructor must contain an object.");
      }
      if (!Array.isArray(descriptor.from)) {
        fail("The 'some.from' field must contain an array.");
      }
      return {
        kind: "AtLeast",
        required: expectNumber(
          descriptor.at_least,
          "The 'some.at_least' field must be a non-negative integer.",
        ),
        scripts: descriptor.from.map(parseTemplateScriptJson),
      };
    }
    case "active_from":
      return {
        kind: "ActiveFrom",
        slot: expectNumber(
          value.active_from,
          "The 'active_from' field must be a non-negative integer.",
        ),
      };
    case "active_until":
      return {
        kind: "ActiveUntil",
        slot: expectNumber(
          value.active_until,
          "The 'active_until' field must be a non-negative integer.",
        ),
      };
    default:
      fail("Unknown ScriptTemplate constructor.");
  }
};

const scriptToJson = (script, keyHashHrp = "addr_vkh") => {
  switch (script.kind) {
    case "Signature":
      return bech32.encode(
        keyHashHrp,
        bech32.toWords(
          Uint8Array.from(
            script.keyHashHex.match(/.{2}/g).map((hex) => parseInt(hex, 16)),
          ),
        ),
        1000,
      );
    case "All":
      return { all: script.scripts.map((child) => scriptToJson(child, keyHashHrp)) };
    case "Any":
      return { any: script.scripts.map((child) => scriptToJson(child, keyHashHrp)) };
    case "AtLeast":
      return {
        some: {
          at_least: script.required,
          from: script.scripts.map((child) => scriptToJson(child, keyHashHrp)),
        },
      };
    case "ActiveFrom":
      return { active_from: script.slot };
    case "ActiveUntil":
      return { active_until: script.slot };
    default:
      fail("Unknown script kind during JSON rendering.");
  }
};

const templateScriptToJson = (script) => {
  switch (script.kind) {
    case "Cosigner":
      return `cosigner#${script.cosigner}`;
    case "All":
      return { all: script.scripts.map(templateScriptToJson) };
    case "Any":
      return { any: script.scripts.map(templateScriptToJson) };
    case "AtLeast":
      return {
        some: {
          at_least: script.required,
          from: script.scripts.map(templateScriptToJson),
        },
      };
    case "ActiveFrom":
      return { active_from: script.slot };
    case "ActiveUntil":
      return { active_until: script.slot };
    default:
      fail("Unknown template script kind during JSON rendering.");
  }
};

const serializeScript = (script) => {
  switch (script.kind) {
    case "Signature": {
      const keyHash = Uint8Array.from(
        script.keyHashHex.match(/.{2}/g).map((hex) => parseInt(hex, 16)),
      );
      return encodeArray([encodeUnsigned(0, 0), encodeBytes(keyHash)]);
    }
    case "All":
      return encodeArray([
        encodeUnsigned(0, 1),
        encodeArray(script.scripts.map(serializeScript)),
      ]);
    case "Any":
      return encodeArray([
        encodeUnsigned(0, 2),
        encodeArray(script.scripts.map(serializeScript)),
      ]);
    case "AtLeast":
      return encodeArray([
        encodeUnsigned(0, 3),
        encodeUnsigned(0, script.required),
        encodeArray(script.scripts.map(serializeScript)),
      ]);
    case "ActiveFrom":
      return encodeArray([encodeUnsigned(0, 4), encodeUnsigned(0, script.slot)]);
    case "ActiveUntil":
      return encodeArray([encodeUnsigned(0, 5), encodeUnsigned(0, script.slot)]);
    default:
      fail("Unknown script kind during CBOR serialization.");
  }
};

const collectSignatureHexes = (script, into = []) => {
  switch (script.kind) {
    case "Signature":
      into.push(script.keyHashHex);
      break;
    case "All":
    case "Any":
      script.scripts.forEach((child) => collectSignatureHexes(child, into));
      break;
    case "AtLeast":
      script.scripts.forEach((child) => collectSignatureHexes(child, into));
      break;
    default:
      break;
  }

  return into;
};

const collectTemplateCosigners = (script, into = []) => {
  switch (script.kind) {
    case "Cosigner":
      into.push(script.cosigner);
      break;
    case "All":
    case "Any":
      script.scripts.forEach((child) => collectTemplateCosigners(child, into));
      break;
    case "AtLeast":
      script.scripts.forEach((child) => collectTemplateCosigners(child, into));
      break;
    default:
      break;
  }

  return into;
};

const summarizeTimelocks = (script) => {
  if (script.kind !== "All") {
    return { activeFrom: [], activeUntil: [] };
  }

  const activeFrom = [];
  const activeUntil = [];

  for (const child of script.scripts) {
    if (child.kind === "ActiveFrom") {
      activeFrom.push(child.slot);
    } else if (child.kind === "ActiveUntil") {
      activeUntil.push(child.slot);
    }
  }

  return { activeFrom, activeUntil };
};

const validateScript = (script) => {
  const issues = [];
  const isTimelock = (node) =>
    node.kind === "ActiveFrom" || node.kind === "ActiveUntil";

  const visit = (node) => {
    switch (node.kind) {
      case "All":
      case "Any": {
        if (node.scripts.length === 0) {
          issues.push(issue("recommended", "empty-list", "Script list should not be empty."));
        }

        node.scripts.forEach(visit);

        const signatureHexes = collectSignatureHexes(node);
        if (new Set(signatureHexes).size !== signatureHexes.length) {
          issues.push(issue("recommended", "duplicate-signatures", "Script repeats the same signature requirement."));
        }

        const timelockCount = node.scripts.filter(isTimelock).length;
        if (node.kind === "Any" && timelockCount > 1) {
          issues.push(issue("recommended", "redundant-timelocks", "Script contains redundant timelock constraints."));
          break;
        }

        if (node.kind === "All" && node.scripts.length > 0 && node.scripts.every(isTimelock)) {
          issues.push(issue("recommended", "empty-list", "Script list should not be empty."));
          break;
        }

        const { activeFrom, activeUntil } = summarizeTimelocks(node);
        if (activeFrom.length > 1 || activeUntil.length > 1) {
          issues.push(issue("recommended", "redundant-timelocks", "Script contains redundant timelock constraints."));
        }
        if (
          activeFrom.length > 0 &&
          activeUntil.length > 0 &&
          Math.max(...activeFrom) >= Math.min(...activeUntil)
        ) {
          issues.push(issue("recommended", "timelock-trap", "Timelock constraints cannot be satisfied together."));
        }
        break;
      }
      case "AtLeast": {
        if (node.scripts.length === 0) {
          issues.push(issue("recommended", "empty-list", "Script list should not be empty."));
        }
        if (node.required === 0) {
          issues.push(issue("recommended", "m-zero", "At least scripts should require at least one branch."));
        }
        if (node.required > node.scripts.length) {
          issues.push(issue("recommended", "list-too-small", "At least threshold exceeds the number of child scripts."));
        }

        node.scripts.forEach(visit);

        const signatureHexes = collectSignatureHexes(node);
        if (new Set(signatureHexes).size !== signatureHexes.length) {
          issues.push(issue("recommended", "duplicate-signatures", "Script repeats the same signature requirement."));
        }
        break;
      }
      default:
        break;
    }
  };

  visit(script);
  return issues;
};

const deriveScriptFromTemplate = (script, cosigners) => {
  switch (script.kind) {
    case "Cosigner": {
      const keyHashHex = cosigners.get(script.cosigner);
      if (!keyHashHex) {
        fail("Each cosigner referenced in the template must have an xpub.");
      }
      return { kind: "Signature", keyHashHex };
    }
    case "All":
      return { kind: "All", scripts: script.scripts.map((child) => deriveScriptFromTemplate(child, cosigners)) };
    case "Any":
      return { kind: "Any", scripts: script.scripts.map((child) => deriveScriptFromTemplate(child, cosigners)) };
    case "AtLeast":
      return {
        kind: "AtLeast",
        required: script.required,
        scripts: script.scripts.map((child) => deriveScriptFromTemplate(child, cosigners)),
      };
    case "ActiveFrom":
      return { kind: "ActiveFrom", slot: script.slot };
    case "ActiveUntil":
      return { kind: "ActiveUntil", slot: script.slot };
    default:
      fail("Unknown template script kind during derivation.");
  }
};

const renderTemplateJson = (cosigners, template) => {
  const cosignerEntries = [...cosigners.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, xpubHex]) => [`cosigner#${index}`, xpubHex]);

  return JSON.stringify({
    cosigners: Object.fromEntries(cosignerEntries),
    template: templateScriptToJson(template),
  });
};

const emptyAnalysis = () => ({
  canonicalCborHex: "",
  canonicalJson: "",
  scriptType: "",
  validationStatus: "error",
  issues: [],
  hashHex: "",
  hashBech32: "",
});

const analyzeTemplate = (templateJson) => {
  if (
    templateJson === null ||
    typeof templateJson !== "object" ||
    Array.isArray(templateJson)
  ) {
    fail("ScriptTemplate JSON must be an object.");
  }

  const rawCosigners =
    templateJson.cosigners &&
    typeof templateJson.cosigners === "object" &&
    !Array.isArray(templateJson.cosigners)
      ? templateJson.cosigners
      : fail("ScriptTemplate JSON must contain a cosigners object.");

  const cosigners = new Map();
  for (const [label, xpubHex] of Object.entries(rawCosigners)) {
    const cosigner = parseCosignerText(label);
    const xpubBytes = decodeXPubHex(xpubHex);
    cosigners.set(cosigner, bytesToHex(hashCredential(xpubBytes.slice(0, 32))));
  }

  const template = parseTemplateScriptJson(templateJson.template);
  const templateIssues = [];
  const referencedCosigners = new Set(collectTemplateCosigners(template));
  const definedCosigners = new Set(cosigners.keys());
  const uniqueXpubs = new Set(Object.values(rawCosigners));
  if (referencedCosigners.size === 0) {
    templateIssues.push(issue("required", "no-cosigner-in-script", "The script of a template must have at least one cosigner defined."));
  } else if (definedCosigners.size === 0) {
    templateIssues.push(issue("required", "no-cosigner-xpub", "The script template must have at least one cosigner with an extended public key."));
  } else if (uniqueXpubs.size !== Object.keys(rawCosigners).length) {
    templateIssues.push(issue("required", "duplicate-xpubs", "The cosigners in a script template must stand behind an unique extended public key."));
  } else if (![...definedCosigners].every((cosigner) => referencedCosigners.has(cosigner))) {
    templateIssues.push(issue("required", "unknown-cosigner", "The specified cosigner must be present in the script of the template."));
  } else if (![...referencedCosigners].every((cosigner) => definedCosigners.has(cosigner))) {
    templateIssues.push(issue("required", "missing-cosigner-xpub", "Each cosigner in a script template must have an extended public key."));
  }
  const canonicalTemplateJson = renderTemplateJson(rawCosigners ? new Map(Object.entries(rawCosigners).map(([label, xpubHex]) => [parseCosignerText(label), xpubHex])) : new Map(), template);

  if (templateIssues.length > 0) {
    return {
      canonicalTemplateJson,
      templateValidationStatus: "error",
      templateIssues,
      hasDerivedScript: false,
      derivedScript: emptyAnalysis(),
    };
  }

  const derivedScript = finalizeAnalysis(
    buildAnalysis(deriveScriptFromTemplate(template, cosigners), SHARED_KEY_HASH_HRP),
  );
  return {
    canonicalTemplateJson,
    templateValidationStatus: "valid",
    templateIssues: [],
    hasDerivedScript: true,
    derivedScript,
  };
};

const rootTypeLabel = (script) => {
  switch (script.kind) {
    case "Signature":
      return "Signature";
    case "All":
      return "All";
    case "Any":
      return "Any";
    case "AtLeast":
      return "At least";
    case "ActiveFrom":
      return "Active from slot";
    case "ActiveUntil":
      return "Active until slot";
    default:
      return script.kind;
  }
};

const buildAnalysis = (script, keyHashHrp = "addr_vkh") => {
  const issues = validateScript(script);
  const canonicalBytes = concatBytes(Uint8Array.of(0), serializeScript(script));

  return {
    canonicalBytes,
    canonicalJson: JSON.stringify(scriptToJson(script, keyHashHrp)),
    scriptType: rootTypeLabel(script),
    validationStatus: issues.length === 0 ? "valid" : "warning",
    issues,
  };
};

const finalizeAnalysis = (analysis) => {
  const credentialHash = hashCredential(analysis.canonicalBytes);
  return {
    canonicalCborHex: bytesToHex(analysis.canonicalBytes),
    canonicalJson: analysis.canonicalJson,
    scriptType: analysis.scriptType,
    validationStatus: analysis.validationStatus,
    issues: analysis.issues,
    hashHex: bytesToHex(credentialHash),
    hashBech32: bech32.encode("script", bech32.toWords(credentialHash), 1000),
  };
};

export const analyzeNativeScriptImpl = (onLeft) => (onRight) => (bytes) => {
  try {
    if (bytes.length === 0) {
      fail("Native script bytes are empty.");
    }

    const cborBytes = bytes[0] === 0 ? bytes.slice(1) : bytes;
    const decoded = decodeSingle(cborBytes);
    const script = parseScript(decoded);
    return onRight(buildAnalysis(script));
  } catch (error) {
    return onLeft(
      error instanceof Error ? error.message : "Failed to analyze native script.",
    );
  }
};

export const analyzeNativeScriptJsonImpl = (onLeft) => (onRight) => (value) => {
  try {
    const decoded = JSON.parse(value);
    const script = parseScriptJson(decoded);
    return onRight(buildAnalysis(script));
  } catch (error) {
    return onLeft(
      error instanceof Error ? error.message : "Failed to analyze native script JSON.",
    );
  }
};

export const analyzeScriptTemplateJsonImpl = (onLeft) => (onRight) => (value) => {
  try {
    return onRight(analyzeTemplate(JSON.parse(value)));
  } catch (error) {
    return onLeft(
      error instanceof Error ? error.message : "Failed to analyze ScriptTemplate JSON.",
    );
  }
};
