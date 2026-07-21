import jsdoc from "eslint-plugin-jsdoc";

const publicFunctionJSDocRules = {
  "jsdoc/require-jsdoc": ["error", {
    publicOnly: true,
    require: {
      ArrowFunctionExpression: true,
      ClassDeclaration: true,
    },
  }],
  "jsdoc/require-param": "error",
  "jsdoc/require-param-description": "error",
  "jsdoc/require-returns": "error",
  "jsdoc/require-returns-description": "error",
  "jsdoc/require-example": "error",
  "jsdoc/check-param-names": "error",
};

export default [
  {
    files: ["**/node/src/index.js"],
    plugins: { jsdoc },
    rules: publicFunctionJSDocRules,
  },
  {
    files: ["**/node/src/error.js"],
    plugins: { jsdoc },
    rules: {
      ...publicFunctionJSDocRules,
      "jsdoc/require-jsdoc": ["error", {
        contexts: ["ClassDeclaration"],
      }],
    },
  },
];
