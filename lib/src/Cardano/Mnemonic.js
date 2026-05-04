import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const strengthFromWordCount = (wordCount) => {
  switch (wordCount) {
    case 12:
      return 128;
    case 15:
      return 160;
    case 18:
      return 192;
    case 21:
      return 224;
    case 24:
      return 256;
    default:
      throw new Error(`Unsupported mnemonic word count: ${wordCount}`);
  }
};

export const generateMnemonicImpl = (wordCount) => () =>
  generateMnemonic(wordlist, strengthFromWordCount(wordCount)).split(" ");

export const validateMnemonicImpl = (words) =>
  validateMnemonic(words.join(" "), wordlist);

export const mnemonicToEntropyImpl = (onNothing) => (onJust) => (words) => {
  try {
    const entropy = mnemonicToEntropy(words.join(" "), wordlist);
    const bytes = new Uint8Array(entropy.length / 2);

    for (let index = 0; index < entropy.length; index += 2) {
      bytes[index / 2] = Number.parseInt(entropy.slice(index, index + 2), 16);
    }

    return onJust(bytes);
  } catch (_error) {
    return onNothing;
  }
};
