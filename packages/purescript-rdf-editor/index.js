import {
  dispose as disposeEffect,
  getValue as getValueEffect,
  mountImpl,
  onChange as onChangeEffect,
  setModeImpl,
  setValue as setValueEffect,
  validate as validateEffect,
} from "./src/Rdf/Editor.js";

export const Turtle = "Turtle";
export const Json = "Json";

export const mount = (element, opts = {}) =>
  mountImpl(element)({
    value: opts.value,
    mode: opts.mode,
  })();

export const getValue = (handle) =>
  getValueEffect(handle)();

export const setValue = (handle, value) =>
  setValueEffect(handle)(value)();

export const onChange = (handle, callback) =>
  onChangeEffect(handle)((value) => () => callback(value))();

export const setMode = (handle, mode) =>
  setModeImpl(handle)(mode)();

export const validate = (handle) =>
  validateEffect(handle)();

export const dispose = (handle) =>
  disposeEffect(handle)();
