{ pkgs, repoRoot, txInspectorUi, wasmBinary }:

let
  nodejs = pkgs.nodejs_22;
  packageJson = builtins.fromJSON (builtins.readFile (repoRoot + /package.json));
  packageLock = builtins.fromJSON (builtins.readFile (repoRoot + /package-lock.json));

  runtimeDependencies = builtins.listToAttrs (map (name: {
    inherit name;
    value = packageJson.dependencies.${name};
  }) [ "@bjorn3/browser_wasi_shim" "@noble/hashes" "@scure/base" "@scure/bip39" "bech32" "events" ]);

  runtimePackage = (builtins.removeAttrs packageJson [ "devDependencies" "scripts" ]) // {
    dependencies = runtimeDependencies // packageJson.dependencies;
  };
  runtimePackageLock = packageLock // {
    packages = packageLock.packages // {
      "" = (builtins.removeAttrs packageLock.packages."" [ "devDependencies" "scripts" ]) // {
        dependencies = runtimeDependencies // packageLock.packages."".dependencies;
      };
    };
  };

  playwrightPackage = {
    name = packageJson.name;
    private = true;
    type = packageJson.type;
    dependencies = {
      "@playwright/test" = packageJson.devDependencies."@playwright/test";
    };
  };
  playwrightPackageLock = packageLock // {
    packages = packageLock.packages // {
      "" = {
        name = packageLock.packages."".name;
        dependencies = {
          "@playwright/test" = packageLock.packages."".devDependencies."@playwright/test";
        };
      };
    };
  };

  nodeModules = pkgs.importNpmLock.buildNodeModules {
    inherit nodejs;
    npmRoot = repoRoot;
    package = runtimePackage;
    packageLock = runtimePackageLock;
    derivationArgs.npmInstallFlags = [ "--omit=dev" ];
  };

  playwrightNodeModules = pkgs.importNpmLock.buildNodeModules {
    inherit nodejs;
    npmRoot = repoRoot;
    package = playwrightPackage;
    packageLock = playwrightPackageLock;
    derivationArgs = {
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    };
  };

  commonArgs = {
    src = repoRoot;
    spagoLock = repoRoot + /spago.lock;
    version = "0.1.0";
    buildNodeModulesArgs = {
      inherit nodejs;
      npmRoot = repoRoot;
      package = runtimePackage;
      packageLock = runtimePackageLock;
      derivationArgs.npmInstallFlags = [ "--omit=dev" ];
    };
    nativeBuildInputs = [
      nodejs
      pkgs.esbuild
      pkgs.purs
      pkgs.spago
    ];
  };

  mkWorkspaceDerivation =
    {
      name,
      spagoYaml,
      buildPhase,
      installPhase ? ''
        mkdir -p $out
        touch $out/${name}
      '',
    }:
    pkgs.mkSpagoDerivation (commonArgs // {
      pname = name;
      inherit spagoYaml buildPhase installPhase;
    });
in
{
  inherit nodeModules playwrightNodeModules nodejs mkWorkspaceDerivation;

  lib-build = mkWorkspaceDerivation {
    name = "cardano-addresses-lib-build";
    spagoYaml = repoRoot + /lib/spago.yaml;
    buildPhase = ''
      cd lib
      ln -sfn ../node_modules node_modules
      spago build --pure -p cardano-addresses
    '';
  };

  app-build = txInspectorUi;

  test-build = mkWorkspaceDerivation {
    name = "cardano-addresses-test-build";
    spagoYaml = repoRoot + /test/spago.yaml;
    buildPhase = ''
      cd test
      ln -sfn ../node_modules node_modules
      spago test --pure -p cardano-addresses-test
    '';
  };

  node-api = mkWorkspaceDerivation {
    name = "cardano-swiss-knife-node-api";
    spagoYaml = repoRoot + /lib/spago.yaml;
    buildPhase = ''
      cd lib
      ln -sfn ../node_modules node_modules
      spago build --pure -p cardano-addresses
      cd ..
      mkdir node-api-build
      cp -a output node cli lib node-api-build/
      ln -s ${nodeModules}/node_modules node-api-build/node_modules
      cd node-api-build
      mkdir -p node/dist
      esbuild node/src/index.js --bundle --platform=node --format=esm --outfile=node/dist/index.js
      esbuild cli/csk.mjs --bundle --platform=node --format=esm --outfile=node/dist/csk.mjs
      cp ${wasmBinary}/cardano-addresses.wasm node/dist/cardano-addresses.wasm
    '';
    installPhase = ''
      mkdir -p $out
      cp ../package.json $out/
      mkdir -p $out/node/dist
      cp -a node/dist/. $out/node/dist/
    '';
  };

  web-dist = pkgs.runCommand "cardano-swiss-knife-web-dist" { } ''
    mkdir -p "$out"
    cp -a ${txInspectorUi}/. "$out/"
    chmod u+w "$out"
    mkdir "$out/inspector"
    cp -a ${txInspectorUi}/. "$out/inspector/"
  '';
}
