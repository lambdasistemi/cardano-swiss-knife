const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const BREAK = Symbol("break");

export const xpubPublicKeyBytesImpl = (xpubBytes) => xpubBytes.slice(0, 32);

export const vkeyWitnessCborHexImpl = (publicKeyBytes) => (signatureBytes) => {
  if (publicKeyBytes.length !== 32) {
    throw new Error("Expected a 32-byte Ed25519 public key.");
  }

  if (signatureBytes.length !== 64) {
    throw new Error("Expected a 64-byte Ed25519 signature.");
  }

  return bytesToHex(
    Uint8Array.from([
      0x82,
      0x58,
      0x20,
      ...publicKeyBytes,
      0x58,
      0x40,
      ...signatureBytes,
    ])
  );
};

const hexToBytes = (value) => {
  const normalized = String(value || "").trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Expected canonical transaction CBOR encoded as hex.");
  }

  return Uint8Array.from(
    normalized.match(/../g).map((chunk) => Number.parseInt(chunk, 16))
  );
};

const concatBytes = (...chunks) => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

const bytesEqual = (left, right) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const readLength = (bytes, state, additional) => {
  if (additional < 24) {
    return additional;
  }

  const readByte = () => {
    if (state.offset >= bytes.length) {
      throw new Error("Unexpected end of CBOR input.");
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

  if (additional === 27) {
    let value = 0n;
    for (let index = 0; index < 8; index += 1) {
      value = (value << 8n) | BigInt(readByte());
    }
    return value;
  }

  if (additional === 31) {
    return null;
  }

  throw new Error(`Unsupported CBOR additional info: ${additional}`);
};

const decodeItem = (bytes, state) => {
  if (state.offset >= bytes.length) {
    throw new Error("Unexpected end of CBOR input.");
  }

  const initial = bytes[state.offset++];
  const major = initial >> 5;
  const additional = initial & 0x1f;

  if (major === 7 && additional === 31) {
    return BREAK;
  }

  switch (major) {
    case 0:
      return readLength(bytes, state, additional);
    case 1: {
      const value = readLength(bytes, state, additional);
      return value === null ? null : -1 - value;
    }
    case 2: {
      const length = readLength(bytes, state, additional);
      if (length === null) {
        const chunks = [];
        for (;;) {
          const chunk = decodeItem(bytes, state);
          if (chunk === BREAK) break;
          if (!(chunk instanceof Uint8Array)) {
            throw new Error("Invalid indefinite byte string chunk.");
          }
          chunks.push(chunk);
        }
        return concatBytes(...chunks);
      }

      const start = state.offset;
      const end = start + length;
      if (end > bytes.length) {
        throw new Error("Unexpected end of CBOR byte string.");
      }
      state.offset = end;
      return bytes.slice(start, end);
    }
    case 3: {
      const length = readLength(bytes, state, additional);
      if (length === null) {
        let text = "";
        for (;;) {
          const chunk = decodeItem(bytes, state);
          if (chunk === BREAK) break;
          if (typeof chunk !== "string") {
            throw new Error("Invalid indefinite text string chunk.");
          }
          text += chunk;
        }
        return text;
      }

      const start = state.offset;
      const end = start + length;
      if (end > bytes.length) {
        throw new Error("Unexpected end of CBOR text string.");
      }
      state.offset = end;
      return new TextDecoder().decode(bytes.slice(start, end));
    }
    case 4: {
      const length = readLength(bytes, state, additional);
      const items = [];
      if (length === null) {
        for (;;) {
          const item = decodeItem(bytes, state);
          if (item === BREAK) break;
          items.push(item);
        }
        return items;
      }

      for (let index = 0; index < length; index += 1) {
        items.push(decodeItem(bytes, state));
      }
      return items;
    }
    case 5: {
      const length = readLength(bytes, state, additional);
      const entries = [];
      if (length === null) {
        for (;;) {
          const key = decodeItem(bytes, state);
          if (key === BREAK) break;
          entries.push([key, decodeItem(bytes, state)]);
        }
        return { map: entries };
      }

      for (let index = 0; index < length; index += 1) {
        entries.push([decodeItem(bytes, state), decodeItem(bytes, state)]);
      }
      return { map: entries };
    }
    case 6:
      return { tag: readLength(bytes, state, additional), value: decodeItem(bytes, state) };
    case 7:
      if (additional === 20) return false;
      if (additional === 21) return true;
      if (additional === 22) return null;
      if (additional === 23) return undefined;
      throw new Error(`Unsupported CBOR simple value: ${additional}`);
    default:
      throw new Error(`Unsupported CBOR major type: ${major}`);
  }
};

const decodeSingle = (bytes) => {
  const state = { offset: 0 };
  const value = decodeItem(bytes, state);
  if (state.offset !== bytes.length) {
    throw new Error("Unconsumed bytes remaining after CBOR decode.");
  }
  return value;
};

const encodeUnsigned = (major, value) => {
  if (
    !(
      (typeof value === "number" && Number.isInteger(value) && value >= 0) ||
      (typeof value === "bigint" && value >= 0n)
    )
  ) {
    throw new Error("CBOR encoder expects a non-negative integer.");
  }

  const normalized = typeof value === "bigint" ? value : BigInt(value);

  if (normalized < 24n) {
    return Uint8Array.of((major << 5) | Number(normalized));
  }

  if (normalized < 0x100n) {
    return Uint8Array.of((major << 5) | 24, Number(normalized));
  }

  if (normalized < 0x10000n) {
    return Uint8Array.of(
      (major << 5) | 25,
      Number((normalized >> 8n) & 0xffn),
      Number(normalized & 0xffn)
    );
  }

  if (normalized < 0x100000000n) {
    return Uint8Array.of(
      (major << 5) | 26,
      Number((normalized >> 24n) & 0xffn),
      Number((normalized >> 16n) & 0xffn),
      Number((normalized >> 8n) & 0xffn),
      Number(normalized & 0xffn)
    );
  }

  if (normalized <= 0xffffffffffffffffn) {
    return Uint8Array.of(
      (major << 5) | 27,
      Number((normalized >> 56n) & 0xffn),
      Number((normalized >> 48n) & 0xffn),
      Number((normalized >> 40n) & 0xffn),
      Number((normalized >> 32n) & 0xffn),
      Number((normalized >> 24n) & 0xffn),
      Number((normalized >> 16n) & 0xffn),
      Number((normalized >> 8n) & 0xffn),
      Number(normalized & 0xffn)
    );
  }

  throw new Error("CBOR encoder does not support integers above 64 bits.");
};

const encodeBytes = (value) => concatBytes(encodeUnsigned(2, value.length), value);

const encodeText = (value) => {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(encodeUnsigned(3, bytes.length), bytes);
};

const encodeArray = (items) =>
  concatBytes(encodeUnsigned(4, items.length), ...items.map(encodeItem));

const encodeMap = (entries) =>
  concatBytes(
    encodeUnsigned(5, entries.length),
    ...entries.flatMap(([key, value]) => [encodeItem(key), encodeItem(value)])
  );

const encodeTag = (tag, value) => concatBytes(encodeUnsigned(6, tag), encodeItem(value));

const encodeItem = (value) => {
  if (value instanceof Uint8Array) {
    return encodeBytes(value);
  }

  if (Array.isArray(value)) {
    return encodeArray(value);
  }

  if (value === false) {
    return Uint8Array.of(0xf4);
  }

  if (value === true) {
    return Uint8Array.of(0xf5);
  }

  if (value === null) {
    return Uint8Array.of(0xf6);
  }

  if (value === undefined) {
    return Uint8Array.of(0xf7);
  }

  if (typeof value === "number") {
    return value >= 0 ? encodeUnsigned(0, value) : encodeUnsigned(1, -1 - value);
  }

  if (typeof value === "bigint") {
    return value >= 0n ? encodeUnsigned(0, value) : encodeUnsigned(1, -1n - value);
  }

  if (typeof value === "string") {
    return encodeText(value);
  }

  if (value && typeof value === "object" && Array.isArray(value.map)) {
    return encodeMap(value.map);
  }

  if (value && typeof value === "object" && "tag" in value) {
    return encodeTag(value.tag, value.value);
  }

  throw new Error("Unsupported CBOR value while encoding signed transaction.");
};

const expectArray = (value, message) => {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
};

const expectBytes = (value, message) => {
  if (!(value instanceof Uint8Array)) {
    throw new Error(message);
  }
  return value;
};

const expectMap = (value, message) => {
  if (!value || typeof value !== "object" || !Array.isArray(value.map)) {
    throw new Error(message);
  }
  return value.map;
};

const normalizeWitnessCollection = (value) => {
  if (Array.isArray(value)) {
    return { witnesses: value, wrap: (next) => next };
  }

  if (value && typeof value === "object" && "tag" in value && Array.isArray(value.value)) {
    return {
      witnesses: value.value,
      wrap: (next) => ({ tag: value.tag, value: next }),
    };
  }

  throw new Error("Expected the vkey witness collection to be a CBOR array.");
};

const patchSignedTxCbor = (txCborHex, witnessCborHex) => {
  const tx = decodeSingle(hexToBytes(txCborHex));
  const witness = decodeSingle(hexToBytes(witnessCborHex));

  const txArray = expectArray(tx, "Expected the transaction to decode as a CBOR array.");
  if (txArray.length < 2) {
    throw new Error("Expected the transaction array to contain a witness set.");
  }

  const witnessSetEntries = expectMap(
    txArray[1],
    "Expected the transaction witness set to decode as a CBOR map."
  );
  const witnessTuple = expectArray(
    witness,
    "Expected the generated vkey witness to decode as a 2-element CBOR array."
  );
  if (witnessTuple.length !== 2) {
    throw new Error("Expected the generated vkey witness to contain key and signature bytes.");
  }

  const witnessKeyBytes = expectBytes(
    witnessTuple[0],
    "Expected the generated witness verification key to decode as bytes."
  );
  expectBytes(
    witnessTuple[1],
    "Expected the generated witness signature to decode as bytes."
  );

  const vkeyEntryIndex = witnessSetEntries.findIndex(([key]) => key === 0);
  if (vkeyEntryIndex === -1) {
    txArray[1] = {
      map: [[0, [witnessTuple]], ...witnessSetEntries],
    };
    return {
      signedTxCborHex: bytesToHex(encodeItem(txArray)),
      witnessPatchAction: "inserted",
    };
  }

  const [entryKey, entryValue] = witnessSetEntries[vkeyEntryIndex];
  const { witnesses, wrap } = normalizeWitnessCollection(entryValue);
  const nextWitnesses = [...witnesses];
  const existingIndex = nextWitnesses.findIndex((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < 2) {
      return false;
    }
    const candidateKey = candidate[0];
    return candidateKey instanceof Uint8Array && bytesEqual(candidateKey, witnessKeyBytes);
  });

  let witnessPatchAction = "inserted";
  if (existingIndex >= 0) {
    nextWitnesses[existingIndex] = witnessTuple;
    witnessPatchAction = "replaced";
  } else {
    nextWitnesses.push(witnessTuple);
  }

  witnessSetEntries[vkeyEntryIndex] = [entryKey, wrap(nextWitnesses)];
  txArray[1] = { map: witnessSetEntries };

  return {
    signedTxCborHex: bytesToHex(encodeItem(txArray)),
    witnessPatchAction,
  };
};

export const patchSignedTxCborImpl = (txCborHex) => (vkeyWitnessCborHex) => () =>
  patchSignedTxCbor(txCborHex, vkeyWitnessCborHex);
