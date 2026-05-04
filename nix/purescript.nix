{ pkgs, repoRoot, wasmBinary, txInspectorWasmBinary }:

let
  nodejs = pkgs.nodejs_22;
  packageJson = builtins.fromJSON (builtins.readFile (repoRoot + /package.json));
  packageLock = builtins.fromJSON (builtins.readFile (repoRoot + /package-lock.json));

  runtimePackage = builtins.removeAttrs packageJson [ "devDependencies" "scripts" ];
  runtimePackageLock = packageLock // {
    packages = packageLock.packages // {
      "" = builtins.removeAttrs packageLock.packages."" [ "devDependencies" "scripts" ];
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

  app-build = mkWorkspaceDerivation {
    name = "cardano-addresses-app-build";
    spagoYaml = repoRoot + /app/spago.yaml;
    buildPhase = ''
      cd app
      ln -sfn ../node_modules node_modules
      spago build --pure -p cardano-addresses-browser
    '';
  };

  test-build = mkWorkspaceDerivation {
    name = "cardano-addresses-test-build";
    spagoYaml = repoRoot + /test/spago.yaml;
    buildPhase = ''
      cd test
      ln -sfn ../node_modules node_modules
      spago test --pure -p cardano-addresses-test
    '';
  };

  web-dist = mkWorkspaceDerivation {
    name = "cardano-addresses-web-dist";
    spagoYaml = repoRoot + /app/spago.yaml;
    buildPhase = ''
      cd app
      ln -sfn ../node_modules node_modules
      spago build --pure -p cardano-addresses-browser
      mkdir -p ../dist
      esbuild ../output/Main/index.js \
        --bundle \
        --outfile=../dist/app.js \
        --format=esm \
        --minify \
        --alias:fs=./shims/fs.cjs \
        --alias:path=./shims/path.cjs
      cd ..
    '';
    installPhase = ''
      mkdir -p $out/wasm
      cp ${repoRoot}/dist/index.html $out/index.html
      cp dist/app.js $out/
      cp ${wasmBinary}/cardano-addresses.wasm $out/wasm/cardano-addresses.wasm
      cp ${txInspectorWasmBinary}/wasm-tx-inspector.wasm $out/wasm/wasm-tx-inspector.wasm
    '';
  };
}
