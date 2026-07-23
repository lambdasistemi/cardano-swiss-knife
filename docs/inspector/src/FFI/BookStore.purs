module FFI.BookStore
  ( Book
  , BookStoreInspection
  , Store
  , addCatalogBook
  , envelopeKind
  , inspect
  , annotationTurtle
  , load
  , parseStore
  , save
  , selectedBooks
  , serialize
  , storageKey
  ) where

import Prelude

import Cardano.Blueprint.Registry (BlueprintCatalogEntry, bundledRegistryJson, catalogBookId, isCatalogEntryLoaded, parseCatalog)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Exception (throw)
import FFI.OverlayBook (OverlayPart)
import FFI.OverlayBook as OverlayBook
import FFI.Storage as Storage

type Book =
  { id :: String
  , name :: String
  , source :: String
  , upstreamSource :: String
  , upstreamRef :: String
  , raw :: String
  , parts :: Array OverlayPart
  , turtle :: String
  , selected :: Boolean
  , seed :: Boolean
  }

type Store =
  { kind :: String
  , books :: Array Book
  }

type BookStoreInspection =
  { kind :: String
  , count :: Int
  , selectedCount :: Int
  , partCount :: Int
  }

type SeedSpec =
  { id :: String
  , raw :: String
  , upstreamSource :: String
  , upstreamRef :: String
  }

storageKey :: String
storageKey = "cardano-ledger-inspector.books.v1"

envelopeKind :: String
envelopeKind = storageKey

foreign import parseStoreImpl
  :: (String -> Either String Store)
  -> (Store -> Either String Store)
  -> String
  -> Either String Store

foreign import serializeImpl :: Store -> String

foreign import inspectImpl :: Store -> BookStoreInspection

foreign import annotationTurtle
  :: { label :: String
     , typeName :: String
     , entityIri :: String
     , predicate :: String
     , value :: String
     }
  -> String

serialize :: Store -> String
serialize = serializeImpl

inspect :: Store -> BookStoreInspection
inspect = inspectImpl

save :: Store -> Effect Unit
save store = Storage.setItem storageKey (serialize store)

load :: Effect Store
load = do
  raw <- Storage.getItem storageKey
  seed <- seedStore
  case raw of
    "" -> do
      save seed
      pure seed
    _ ->
      case parseStore raw of
        Left _ -> do
          save seed
          pure seed
        Right store -> do
          save store
          pure store

selectedBooks :: Store -> Array Book
selectedBooks store =
  Array.filter (\book -> book.selected) store.books

parseStore :: String -> Either String Store
parseStore = parseStoreImpl Left Right

seedStore :: Effect Store
seedStore = do
  sundaeProv <- case parseCatalog bundledRegistryJson of
    Right entries ->
      case Array.find (\entry -> entry.id == "sundaeswap-v3") entries of
        Just entry -> pure entry.provenance
        Nothing -> throw "Bundled catalog missing sundaeswap-v3 entry"
    Left err -> throw ("Failed to parse bundled catalog in seedStore: " <> err)

  amaru <- seedBook
    { id: "seed:amaru-treasury-2026-overlay"
    , raw: OverlayBook.bundledAmaruJournal
    , upstreamSource: ""
    , upstreamRef: ""
    }
  sundae <- seedBook
    { id: "seed:sundaeswap-v3-blueprint"
    , raw: OverlayBook.bundledSundaeSwapBlueprint
    , upstreamSource: sundaeProv.source
    , upstreamRef: sundaeProv.ref
    }
  shacl <- seedBook
    { id: "seed:cardano-rdf-shacl-shapes"
    , raw: OverlayBook.bundledCardanoShaclShapes
    , upstreamSource: ""
    , upstreamRef: ""
    }
  pure
    { kind: envelopeKind
    , books: [ amaru, sundae, shacl ]
    }

seedBook :: SeedSpec -> Effect Book
seedBook spec = do
  parsed <- OverlayBook.parse spec.raw
  pure
    ( case parsed of
        Right book ->
          { id: spec.id
          , name: book.title
          , source: book.source
          , upstreamSource: spec.upstreamSource
          , upstreamRef: spec.upstreamRef
          , raw: spec.raw
          , parts: book.parts
          , turtle: book.turtle
          , selected: true
          , seed: true
          }
        Left err ->
          { id: spec.id
          , name: "Unparseable seed book"
          , source: err
          , upstreamSource: spec.upstreamSource
          , upstreamRef: spec.upstreamRef
          , raw: spec.raw
          , parts: []
          , turtle: ""
          , selected: false
          , seed: true
          }
    )

addCatalogBook :: BlueprintCatalogEntry -> Store -> Effect (Either String Store)
addCatalogBook entry store =
  if isCatalogEntryLoaded entry store.books then
    pure (Right store)
  else do
    parsed <- OverlayBook.parse entry.raw
    case parsed of
      Left err ->
        pure (Left ("Failed to parse catalog blueprint for '" <> entry.id <> "': " <> err))
      Right book -> do
        let
          newBook =
            { id: catalogBookId entry.id
            , name: book.title
            , source: entry.path
            , upstreamSource: entry.provenance.source
            , upstreamRef: entry.provenance.ref
            , raw: entry.raw
            , parts: book.parts
            , turtle: book.turtle
            , selected: true
            , seed: false
            }
          updatedStore =
            { kind: store.kind
            , books: Array.snoc store.books newBook
            }
        save updatedStore
        pure (Right updatedStore)
