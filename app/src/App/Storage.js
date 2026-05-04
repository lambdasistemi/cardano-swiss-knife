export const getItemImpl = (key) => () => {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? "" : value;
  } catch (_err) {
    return "";
  }
};

export const setItemImpl = (key) => (value) => () => {
  try {
    window.localStorage.setItem(key, value);
  } catch (_err) {
    return undefined;
  }
};
