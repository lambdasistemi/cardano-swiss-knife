export const copyToClipboard = (text) => () => navigator.clipboard.writeText(text);

export const normalizeMnemonicInput = (text) =>
  text
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);

export const normalizeHexInput = (text) => text.replace(/\s+/gu, "").trim();

export const parseIndexInput = (text) => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};
