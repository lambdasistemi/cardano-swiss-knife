export const bundledRegistryJson =
  typeof globalThis !== "undefined" && globalThis.protocolRegistryJson
    ? globalThis.protocolRegistryJson
    : "";

export const bundledPinsJson =
  typeof globalThis !== "undefined" && globalThis.protocolPinsJson
    ? globalThis.protocolPinsJson
    : {};

export const bundledBlueprintsJson =
  typeof globalThis !== "undefined" && globalThis.protocolBlueprintsJson
    ? globalThis.protocolBlueprintsJson
    : {};
