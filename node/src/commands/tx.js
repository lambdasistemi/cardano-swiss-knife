import { attachTransactionWitness, browseTransaction, evaluateTransactionScripts, identifyTransaction, inspectTransaction, normaliseTransactionWitness, planTransactionWitnesses, prepareTransactionWitness, submitTransactionEntry, transactionIntent, validateTransaction } from "../index.js";

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
export const submit = (input) => submitTransactionEntry(input);

export const review = async (input, options = {}) => {
  const { books = [], ...rest } = options;
  const inspected = await inspect(input, { ...rest, books });
  if (!inspected.ok) return inspected;
  const localInput = Object.hasOwn(input, "cborHex") ? { cborHex: input.cborHex } : { textEnvelope: input.textEnvelope };
  const context = inspected.value.context;
  const carried = context === undefined ? rest : { ...rest, context };
  const [intentResult, witnessResult, validateResult] = await Promise.all([
    intent(localInput, carried),
    witnessPlan(localInput, carried),
    validate(localInput, carried),
  ]);
  if (!intentResult.ok) return intentResult;
  if (!witnessResult.ok) return witnessResult;
  if (!validateResult.ok) return validateResult;
  return {
    ok: true,
    value: {
      inspection: inspected.value.result.inspection,
      intent: intentResult.value.result.intent,
      witnessPlan: witnessResult.value.result.witness_plan,
      validation: validateResult.value.result.validation,
      resolutions: inspected.value.resolutions ?? [],
    },
  };
};
