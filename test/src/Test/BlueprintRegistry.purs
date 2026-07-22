module Test.BlueprintRegistry
  ( runBlueprintRegistryTests
  ) where

import Prelude

import Cardano.Blueprint.Registry (isCatalogBookForEntry, isCatalogEntryLoaded, lookupCatalogEntry, parseCatalog, parseCatalogWithMaps)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Exception (throw)
import Foreign.Object as Object

sampleRegistryJson :: String
sampleRegistryJson =
  """{
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
samplePinJson =
  """{
  "source": "github.com/SundaeSwap-finance/sundae-contracts",
  "ref": "be33466b7dbe0f8e6c0e0f46ff23737897f45835"
}"""

samplePlutusJson :: String
samplePlutusJson =
  """{
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
  testCatalogLookupAndIdentity

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
          when (entry.onChainHashes /= [ "fa6a58bbe2d0ff05534431c8e2f0ef2cbdc1602a8456e4b13c8f3077" ]) do
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

testCatalogLookupAndIdentity :: Effect Unit
testCatalogLookupAndIdentity = do
  let
    sampleMultiRegistryJson =
      """{
      "$schema_note": "Build-time registry for tx.intent.",
      "blueprints": [
        {
          "id": "sundaeswap-v3",
          "path": "sundaeswap-v3/plutus.json",
          "pin": "sundaeswap-v3/pin.json"
        },
        {
          "id": "sundaeswap-treasury-v3",
          "path": "sundaeswap-treasury-v3/plutus.json",
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
        },
        {
          "on_chain_hash": "32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d",
          "blueprint": "sundaeswap-treasury-v3",
          "validator": "treasury.spend",
          "parameterized": false,
          "label": "SundaeSwap V3 treasury"
        }
      ],
      "instances": []
    }"""
    treasuryPlutusJson =
      """{
      "$schema": "https://json.schemastore.org/cardano-plutus-blueprint.json",
      "preamble": {
        "title": "SundaeSwap V3 Treasury",
        "version": "1.0.0"
      },
      "validators": []
    }"""
    pins = Object.singleton "sundaeswap-v3/pin.json" samplePinJson
    blueprints =
      Object.empty
        # Object.insert "sundaeswap-v3/plutus.json" samplePlutusJson
        # Object.insert "sundaeswap-treasury-v3/plutus.json" treasuryPlutusJson
    res = parseCatalogWithMaps
      { registryJson: sampleMultiRegistryJson
      , pins
      , blueprints
      }
  case res of
    Left err -> throw ("Failed to parse catalog for lookup test: " <> err)
    Right entries -> do
      case lookupCatalogEntry "sundaeswap-v3" entries of
        Nothing -> throw "Expected catalog lookup for sundaeswap-v3 to return Just entry"
        Just entry1 -> do
          -- 1. Assert exact raw blueprint bytes preservation
          when (entry1.raw /= samplePlutusJson) do
            throw "Expected entry1 raw bytes to match samplePlutusJson byte-for-byte"

          case lookupCatalogEntry "sundaeswap-treasury-v3" entries of
            Nothing -> throw "Expected catalog lookup for sundaeswap-treasury-v3 to return Just entry"
            Just entry2 -> do
              when (entry2.raw /= treasuryPlutusJson) do
                throw "Expected entry2 raw bytes to match treasuryPlutusJson byte-for-byte"

              -- 2. Test (id, ref) identity pair logic:
              let
                seededSundaeBook =
                  { id: "seed:sundaeswap-v3-blueprint"
                  , upstreamRef: "be33466b7dbe0f8e6c0e0f46ff23737897f45835"
                  }
                catalogSundaeBook =
                  { id: "catalog:sundaeswap-v3"
                  , upstreamRef: "be33466b7dbe0f8e6c0e0f46ff23737897f45835"
                  }
                catalogTreasuryBook =
                  { id: "catalog:sundaeswap-treasury-v3"
                  , upstreamRef: "be33466b7dbe0f8e6c0e0f46ff23737897f45835"
                  }
                differentRefSundaeBook =
                  { id: "catalog:sundaeswap-v3"
                  , upstreamRef: "different-ref-12345"
                  }
                unrelatedBook =
                  { id: "seed:amaru-treasury-2026-overlay"
                  , upstreamRef: ""
                  }

              -- Seeded book matches sundaeswap-v3 catalog entry
              unless (isCatalogBookForEntry entry1 seededSundaeBook) do
                throw "Expected seeded sundaeswap-v3 book to match sundaeswap-v3 catalog entry"

              -- Catalog book with catalog:sundaeswap-v3 matches sundaeswap-v3 catalog entry
              unless (isCatalogBookForEntry entry1 catalogSundaeBook) do
                throw "Expected catalog:sundaeswap-v3 book to match sundaeswap-v3 catalog entry"

              -- sundaeswap-treasury-v3 shares same ref, but has different id, so MUST NOT match sundaeswap-v3 catalog entry
              when (isCatalogBookForEntry entry1 catalogTreasuryBook) do
                throw "Expected sundaeswap-treasury-v3 catalog book NOT to match sundaeswap-v3 catalog entry"

              -- sundaeswap-treasury-v3 catalog book MUST match sundaeswap-treasury-v3 catalog entry
              unless (isCatalogBookForEntry entry2 catalogTreasuryBook) do
                throw "Expected sundaeswap-treasury-v3 catalog book to match sundaeswap-treasury-v3 catalog entry"

              -- Same id but different ref MUST NOT match
              when (isCatalogBookForEntry entry1 differentRefSundaeBook) do
                throw "Expected book with different ref NOT to match sundaeswap-v3 catalog entry"

              -- Duplicate-loaded detection assertions across array of books
              let booksWithSeededSundaeOnly = [ seededSundaeBook, unrelatedBook ]
              unless (isCatalogEntryLoaded entry1 booksWithSeededSundaeOnly) do
                throw "Expected sundaeswap-v3 catalog entry to be loaded when seeded sundae book is present"

              when (isCatalogEntryLoaded entry2 booksWithSeededSundaeOnly) do
                throw "Expected sundaeswap-treasury-v3 catalog entry NOT to be loaded when only seeded sundae book is present"

              let booksWithBoth = [ seededSundaeBook, catalogTreasuryBook, unrelatedBook ]
              unless (isCatalogEntryLoaded entry1 booksWithBoth) do
                throw "Expected sundaeswap-v3 catalog entry to be loaded when both books present"
              unless (isCatalogEntryLoaded entry2 booksWithBoth) do
                throw "Expected sundaeswap-treasury-v3 catalog entry to be loaded when catalog treasury book present"

              -- Malformed catalog JSON returns Left err explicitly
              case parseCatalog "not-json" of
                Left _ -> pure unit
                Right _ -> throw "Expected parseCatalog of invalid json to return Left"
