module Cardano.Blueprint.Registry
  ( Provenance
  , BlueprintCatalogEntry
  , parseCatalog
  , parseCatalogWithMaps
  , bundledRegistryJson
  , bundledPinsJson
  , bundledBlueprintsJson
  , normalizeScriptHash
  , catalogEntriesForScriptHash
  , lookupCatalogEntry
  , isCatalogBookForEntry
  , isCatalogEntryLoaded
  , catalogBookId
  ) where

import Prelude

import Data.Argonaut.Core (Json, toArray, toObject, toString)
import Data.Argonaut.Parser (jsonParser)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits as StringCodeUnits
import Data.String.Common as String
import Data.Traversable (traverse)
import Foreign.Object (Object)
import Foreign.Object as Object

type Provenance =
  { source :: String
  , ref :: String
  }

type BlueprintCatalogEntry =
  { id :: String
  , path :: String
  , raw :: String
  , provenance :: Provenance
  , onChainHashes :: Array String
  }

foreign import bundledRegistryJson :: String
foreign import bundledPinsJson :: Object String
foreign import bundledBlueprintsJson :: Object String

parseCatalog :: String -> Either String (Array BlueprintCatalogEntry)
parseCatalog registryJson =
  parseCatalogWithMaps
    { registryJson
    , pins: bundledPinsJson
    , blueprints: bundledBlueprintsJson
    }

parseCatalogWithMaps
  :: { registryJson :: String
     , pins :: Object String
     , blueprints :: Object String
     }
  -> Either String (Array BlueprintCatalogEntry)
parseCatalogWithMaps { registryJson, pins, blueprints } = do
  json <- case jsonParser registryJson of
    Right res -> Right res
    Left err -> Left ("Failed to parse registry JSON: " <> err)

  obj <- case toObject json of
    Just o -> Right o
    Nothing -> Left "Registry JSON root is not an object"

  blueprintsArray <- case Object.lookup "blueprints" obj >>= toArray of
    Just arr -> Right arr
    Nothing -> Left "Missing or non-array 'blueprints' field in registry JSON"

  let
    validatorsArray = case Object.lookup "validators" obj >>= toArray of
      Just arr -> arr
      Nothing -> []

  let
    instancesArray = case Object.lookup "instances" obj >>= toArray of
      Just arr -> arr
      Nothing -> []

  traverse (parseEntry pins blueprints validatorsArray instancesArray) blueprintsArray

parseEntry
  :: Object String
  -> Object String
  -> Array Json
  -> Array Json
  -> Json
  -> Either String BlueprintCatalogEntry
parseEntry pins blueprints validatorsArray instancesArray bpJson = do
  bpObj <- case toObject bpJson of
    Just o -> Right o
    Nothing -> Left "Blueprint entry is not an object"

  bpId <- case Object.lookup "id" bpObj >>= toString of
    Just s -> Right s
    Nothing -> Left "Blueprint entry missing string 'id'"

  bpPath <- case Object.lookup "path" bpObj >>= toString of
    Just s -> Right s
    Nothing -> Left ("Blueprint entry " <> bpId <> " missing string 'path'")

  bpPin <- case Object.lookup "pin" bpObj >>= toString of
    Just s -> Right s
    Nothing -> Left ("Blueprint entry " <> bpId <> " missing string 'pin'")

  pinRaw <- case Object.lookup bpPin pins of
    Just s -> Right s
    Nothing -> Left ("Missing pin document at path '" <> bpPin <> "' for blueprint '" <> bpId <> "'")

  pinJson <- case jsonParser pinRaw of
    Right j -> Right j
    Left err -> Left ("Failed to parse pin document '" <> bpPin <> "': " <> err)

  pinObj <- case toObject pinJson of
    Just o -> Right o
    Nothing -> Left ("Pin document '" <> bpPin <> "' root is not an object")

  sourceStr <- case Object.lookup "source" pinObj >>= toString of
    Just s -> Right s
    Nothing -> Left ("Pin document '" <> bpPin <> "' missing string 'source'")

  refStr <- case Object.lookup "ref" pinObj >>= toString of
    Just s -> Right s
    Nothing -> Left ("Pin document '" <> bpPin <> "' missing string 'ref'")

  plutusRaw <- case Object.lookup bpPath blueprints of
    Just s -> Right s
    Nothing -> Left ("Missing plutus document at path '" <> bpPath <> "' for blueprint '" <> bpId <> "'")

  _ <- case jsonParser plutusRaw of
    Right j -> Right j
    Left err -> Left ("Failed to parse plutus artifact JSON at path '" <> bpPath <> "' for blueprint '" <> bpId <> "': " <> err)

  let
    valHashes = Array.mapMaybe (extractHash bpId) validatorsArray
    instHashes = Array.mapMaybe (extractHash bpId) instancesArray
    allHashes = Array.nub (Array.sort (valHashes <> instHashes))

  pure
    { id: bpId
    , path: bpPath
    , raw: plutusRaw
    , provenance: { source: sourceStr, ref: refStr }
    , onChainHashes: allHashes
    }

extractHash :: String -> Json -> Maybe String
extractHash targetBpId itemJson = do
  obj <- toObject itemJson
  bp <- Object.lookup "blueprint" obj >>= toString
  if bp == targetBpId then Object.lookup "on_chain_hash" obj >>= toString
  else Nothing

catalogBookId :: String -> String
catalogBookId entryId = "catalog:" <> entryId

normalizeScriptHash :: String -> Maybe String
normalizeScriptHash value =
  let
    normalized = String.toLower value
  in
    if StringCodeUnits.length normalized == 56 && Array.all isHexChar (StringCodeUnits.toCharArray normalized) then
      Just normalized
    else
      Nothing

catalogEntriesForScriptHash :: String -> Array BlueprintCatalogEntry -> Array BlueprintCatalogEntry
catalogEntriesForScriptHash scriptHash =
  Array.filter (Array.elem scriptHash <<< _.onChainHashes)

isHexChar :: Char -> Boolean
isHexChar char =
  (char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')

lookupCatalogEntry :: String -> Array BlueprintCatalogEntry -> Maybe BlueprintCatalogEntry
lookupCatalogEntry targetId entries =
  Array.find (\entry -> entry.id == targetId) entries

isCatalogBookForEntry :: BlueprintCatalogEntry -> { id :: String, upstreamRef :: String } -> Boolean
isCatalogBookForEntry entry book =
  book.upstreamRef /= ""
    && book.upstreamRef == entry.provenance.ref
    &&
      ( book.id == "seed:" <> entry.id <> "-blueprint"
          || book.id == "catalog:" <> entry.id
          ||
            book.id == entry.id
      )

isCatalogEntryLoaded :: forall r. BlueprintCatalogEntry -> Array { id :: String, upstreamRef :: String | r } -> Boolean
isCatalogEntryLoaded entry books =
  Array.any (\book -> isCatalogBookForEntry entry { id: book.id, upstreamRef: book.upstreamRef }) books
