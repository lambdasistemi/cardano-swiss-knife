export const unsafeIndex = (arr) => (i) => arr[i];

export const slice = (start) => (end) => (arr) => arr.slice(start, end);

export const byteLength = (arr) => arr.length;
