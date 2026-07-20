const field = (object, key) => {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return { status: "missing", value: "" };
  }

  const value = object[key];
  return typeof value === "string"
    ? { status: "string", value }
    : { status: "non-string", value: "" };
};

export const parseTextEnvelopeImpl = (onSuccess) => (onFailure) => (input) => {
  try {
    const parsed = JSON.parse(input);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return onFailure;
    }

    return onSuccess({
      typeField: field(parsed, "type"),
      descriptionField: field(parsed, "description"),
      cborHexField: field(parsed, "cborHex"),
    });
  } catch {
    return onFailure;
  }
};

export const stringifyTextEnvelope = (type) => (description) => (cborHex) =>
  JSON.stringify({ type, description, cborHex });
