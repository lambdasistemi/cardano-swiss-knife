import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const runtime = option("--runtime");
const facade = option("--facade");
if (!runtime || !facade) {
  console.error("Usage: check-node-api-exports.mjs --runtime <module> --facade <declaration>");
  process.exitCode = 2;
} else {
  const runtimePath = pathToFileURL(resolve(runtime)).href;
  const source = ts.createSourceFile(facade, await readFile(facade, "utf8"), ts.ScriptTarget.Latest, true);
  const exported = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  const declarationNames = new Set();

  for (const statement of source.statements) {
    if (!exported(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarationNames.add(declaration.name.text);
      }
    } else if ((ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
      declarationNames.add(statement.name.text);
    }
  }

  const runtimeNames = new Set(Object.keys(await import(runtimePath)));
  const missing = [...runtimeNames].filter((name) => !declarationNames.has(name)).sort();
  const stale = [...declarationNames].filter((name) => !runtimeNames.has(name)).sort();

  if (missing.length > 0) console.error(`Missing declaration exports: ${missing.join(", ")}`);
  if (stale.length > 0) console.error(`Stale declaration exports: ${stale.join(", ")}`);
  if (missing.length > 0 || stale.length > 0) process.exitCode = 1;
}
