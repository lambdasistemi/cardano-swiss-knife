import { generateMnemonic, validateMnemonic } from "../index.js";
export const generate = ({ wordCount }) => generateMnemonic(Number(wordCount));
export const validate = ({ mnemonic }) => validateMnemonic(mnemonic.trim().split(/\s+/));
