const decoder = new TextDecoder("utf-8", { fatal: false });

export const toHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const fromHexImpl = (onLeft) => (onRight) => (value) => {
  if (value.length % 2 !== 0) {
    return onLeft("Hex input must have an even number of characters.");
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    const pair = value.slice(index, index + 2);
    const byte = Number.parseInt(pair, 16);

    if (Number.isNaN(byte)) {
      return onLeft(`Invalid hex byte: ${pair}`);
    }

    bytes[index / 2] = byte;
  }

  return onRight(bytes);
};

export const decodeUtf8 = (bytes) => decoder.decode(bytes);
