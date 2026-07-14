"use strict";

const STORE_KEY = "cardano-ledger-inspector-theme";

export const _getStored = () => {
  try {
    return localStorage.getItem(STORE_KEY) ?? "";
  } catch {
    return "";
  }
};

export const _setStored = (value) => () => {
  try {
    localStorage.setItem(STORE_KEY, value);
  } catch {
    /* localStorage can be unavailable in private browsing. */
  }
};

export const _prefersDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const _setHtmlTheme = (value) => () => {
  document.documentElement.setAttribute("data-theme", value);
};
