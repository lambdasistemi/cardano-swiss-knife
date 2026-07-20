import { analyzeNativeScriptHex, analyzeNativeScriptJson, analyzeScriptTemplateJson } from "../index.js";
export const inspect = ({ cborHex }) => analyzeNativeScriptHex(cborHex);
export const author = ({ json }) => analyzeNativeScriptJson(json);
export const template = ({ json }) => analyzeScriptTemplateJson(json);
