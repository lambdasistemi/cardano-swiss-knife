module Test.BlueprintRegistry
  ( runBlueprintRegistryTests
  ) where

import Prelude

import Cardano.Blueprint.Registry (parseCatalogWithMaps)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Exception (throw)
import Foreign.Object as Object

sampleRegistryJson :: String
sampleRegistryJson = """{
  "$schema_note": "Build-time registry for tx.intent.",
  "blueprints": [
    {
      "id": "sundaeswap-v3",
      "path": "sundaeswap-v3/plutus.json",
      "pin": "sundaeswap-v3/pin.json"
    }
  ],
  "validators": [
    {
      "on_chain_hash": "fa6a58bbe2d0ff05534431c8e2f0ef2cbdc1602a8456e4b13c8f3077",
      "blueprint": "sundaeswap-v3",
      "validator": "order.spend",
      "parameterized": false,
      "label": "SundaeSwap V3 order"
    }
  ],
  "instances": []
}"""

samplePinJson :: String
samplePinJson = """{
  "source": "github.com/SundaeSwap-finance/sundae-contracts",
  "ref": "be33466b7dbe0f8e6c0e0f46ff23737897f45835"
}"""

samplePlutusJson :: String
samplePlutusJson = """{
  "$schema": "https://json.schemastore.org/cardano-plutus-blueprint.json",
  "preamble": {
    "title": "SundaeSwap V3 Contracts",
    "version": "1.0.0"
  },
  "validators": []
}"""

runBlueprintRegistryTests :: Effect Unit
runBlueprintRegistryTests = do
  testParseCatalogSuccess
  testParseCatalogMissingJoin
  testParseCatalogMalformedArtifact

testParseCatalogSuccess :: Effect Unit
testParseCatalogSuccess = do
  let
    pins = Object.singleton "sundaeswap-v3/pin.json" samplePinJson
    blueprints = Object.singleton "sundaeswap-v3/plutus.json" samplePlutusJson
    res = parseCatalogWithMaps
      { registryJson: sampleRegistryJson
      , pins
      , blueprints
      }
  case res of
    Right entries ->
      case Array.head entries of
        Just entry -> do
          when (entry.id /= "sundaeswap-v3") do
            throw "Expected id sundaeswap-v3"
          when (entry.provenance.source /= "github.com/SundaeSwap-finance/sundae-contracts") do
            throw "Expected source github.com/SundaeSwap-finance/sundae-contracts"
          when (entry.provenance.ref /= "be33466b7dbe0f8e6c0e0f46ff23737897f45835") do
            throw "Expected ref be33466b7dbe0f8e6c0e0f46ff23737897f45835"
          when (entry.onChainHashes /= ["fa6a58bbe2d0ff05534431c8e2f0ef2cbdc1602a8456e4b13c8f3077"]) do
            throw "Expected matching on-chain hash"
        Nothing -> throw "Expected at least one catalog entry"
    Left err -> throw ("parseCatalogWithMaps failed: " <> err)

testParseCatalogMissingJoin :: Effect Unit
testParseCatalogMissingJoin = do
  let
    pins = Object.empty
    blueprints = Object.singleton "sundaeswap-v3/plutus.json" samplePlutusJson
    res = parseCatalogWithMaps
      { registryJson: sampleRegistryJson
      , pins
      , blueprints
      }
  case res of
    Right _ -> throw "Expected missing pin join to fail explicitly"
    Left _ -> pure unit

testParseCatalogMalformedArtifact :: Effect Unit
testParseCatalogMalformedArtifact = do
  let
    pins = Object.singleton "sundaeswap-v3/pin.json" samplePinJson
    blueprints = Object.singleton "sundaeswap-v3/plutus.json" "INVALID JSON {"
    res = parseCatalogWithMaps
      { registryJson: sampleRegistryJson
      , pins
      , blueprints
      }
  case res of
    Right _ -> throw "Expected malformed plutus artifact JSON to fail explicitly"
    Left _ -> pure unit
