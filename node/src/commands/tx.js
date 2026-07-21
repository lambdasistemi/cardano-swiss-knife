import { attachTransactionWitness, browseTransaction, evaluateTransactionScripts, identifyTransaction, inspectTransaction, normaliseTransactionWitness, planTransactionWitnesses, prepareTransactionWitness, transactionIntent, validateTransaction } from "../index.js";

export const inspect = (input, options) => inspectTransaction(input, options);
export const browse = (input, options) => browseTransaction(input, options);
export const identify = (input, options) => identifyTransaction(input, options);
export const intent = (input, options) => transactionIntent(input, options);
export const witnessPlan = (input, options) => planTransactionWitnesses(input, options);
export const validate = (input, options) => validateTransaction(input, options);
export const evaluateScripts = (input, options) => evaluateTransactionScripts(input, options);
export const prepareWitness = (input) => prepareTransactionWitness(input);
export const normaliseWitness = (input) => normaliseTransactionWitness(input);
export const attachWitness = (input, witness, options) => attachTransactionWitness(input, witness, options);
