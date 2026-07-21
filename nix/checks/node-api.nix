{ pkgs, repoRoot, purescript, nodePackage }:

let
  package = builtins.fromJSON (builtins.readFile (repoRoot + /package.json));
  packageLock = builtins.fromJSON (builtins.readFile (repoRoot + /package-lock.json));
  propertyPackage = {
    name = package.name;
    private = true;
    type = package.type;
    dependencies = package.dependencies // { fast-check = package.devDependencies.fast-check; };
  };
  propertyPackageLock = packageLock // {
    packages = packageLock.packages // {
      "" = {
        name = packageLock.packages."".name;
        dependencies = packageLock.packages."".dependencies // { fast-check = packageLock.packages."".devDependencies.fast-check; };
      };
    };
  };
  propertyNodeModules = pkgs.importNpmLock.buildNodeModules {
    nodejs = pkgs.nodejs_22;
    npmRoot = repoRoot;
    package = propertyPackage;
    packageLock = propertyPackageLock;
  };
in
pkgs.runCommand "cardano-swiss-knife-node-api-check" {
  nativeBuildInputs = [ pkgs.nodejs_22 pkgs.gnutar pkgs.gzip pkgs.ripgrep pkgs.bash ];
} ''
  mkdir -p work/node work/scripts work/test-vectors work/fixtures
  cp -a ${repoRoot}/node/test work/node/
  cp -a ${repoRoot}/node/src work/node/
  cp ${repoRoot}/scripts/check-node-api-exports.mjs work/scripts/
  cp ${repoRoot}/eslint.config.js work/scripts/
  cp -a ${repoRoot}/lib work/lib
  ln -s ${propertyNodeModules}/node_modules work/node_modules
  ln -s ${purescript.documentationToolNodeModules}/node_modules work/scripts/node_modules
  mkdir unpacked-package
  tar -xzf "$(echo ${nodePackage}/*.tgz)" -C unpacked-package
  cp -a unpacked-package/package/node/dist work/node/
  cp -a ${repoRoot}/test-vectors/vectors.json work/test-vectors/
  cp ${repoRoot}/docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex work/fixtures/conway-mainnet-tx.hex
  cd work
  scripts/node_modules/.bin/eslint --config scripts/eslint.config.js node/src/index.js node/src/error.js
  bash ${repoRoot}/scripts/check-architecture-boundary.sh ${repoRoot}
  node scripts/check-node-api-exports.mjs --runtime ../unpacked-package/package/node/dist/index.js --facade ../unpacked-package/package/node/dist/index.d.ts
  CSK_PACKAGE_TARBALL="$(echo ${nodePackage}/*.tgz)" node --test node/test/api-contract.test.mjs node/test/api.test.mjs node/test/cli.test.mjs node/test/api-properties.test.mjs node/test/transaction-api.test.mjs node/test/transaction-provider.test.mjs node/test/transaction-books.test.mjs node/test/transaction-ledger.test.mjs node/test/transaction-witness.test.mjs
  test -f ${purescript.node-api-docs}/index.md
  rg --fixed-strings --quiet 'https://github.com/lambdasistemi/cardano-swiss-knife/blob/main/node/test/api-properties.test.mjs' ${purescript.node-api-docs}/index.md
  mkdir -p $out
''
