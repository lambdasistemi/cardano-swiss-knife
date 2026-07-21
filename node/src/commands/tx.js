import { browseTransaction, identifyTransaction, inspectTransaction, transactionIntent } from "../index.js";

export const inspect = (input, options) => inspectTransaction(input, options);
export const browse = (input, options) => browseTransaction(input, options);
export const identify = (input, options) => identifyTransaction(input, options);
export const intent = (input, options) => transactionIntent(input, options);
