import { browseTransaction, evaluateTransactionScripts, identifyTransaction, inspectTransaction, planTransactionWitnesses, transactionIntent, validateTransaction } from "../index.js";

export const inspect = (input, options) => inspectTransaction(input, options);
export const browse = (input, options) => browseTransaction(input, options);
export const identify = (input, options) => identifyTransaction(input, options);
export const intent = (input, options) => transactionIntent(input, options);
export const witnessPlan = (input, options) => planTransactionWitnesses(input, options);
export const validate = (input, options) => validateTransaction(input, options);
export const evaluateScripts = (input, options) => evaluateTransactionScripts(input, options);
