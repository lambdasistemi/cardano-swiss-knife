// Thin wrappers over localStorage for non-secret shell preferences.

export const downloadJsonImpl = (filename) => (contents) => () => {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const fetchTextImpl = (url) => async () => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return await response.text();
};

export const getItemImpl = (key) => () => {
  const v = window.localStorage.getItem(key);
  return v == null ? "" : v;
};

export const readFileInputTextImpl = (inputId) => async () => {
  const input = document.getElementById(inputId);
  const file = input && input.files && input.files[0];
  if (!file) {
    throw new Error("No file selected.");
  }

  const text = await file.text();
  input.value = "";
  return text;
};

export const removeItemImpl = (key) => () => {
  window.localStorage.removeItem(key);
};

export const setItemImpl = (key) => (value) => () => {
  window.localStorage.setItem(key, value);
};
