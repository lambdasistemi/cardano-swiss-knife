module FFI.BookStore
  ( Book
  , BookStoreInspection
  , Store
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

import Data.Array as Array
import Data.Either (Either(..))
import Effect (Effect)
import FFI.OverlayBook (OverlayPart)
import FFI.OverlayBook as OverlayBook
import FFI.Storage as Storage

type Book =
  { id :: String
  , name :: String
  , source :: String
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
        Right store ->
          pure store

selectedBooks :: Store -> Array Book
selectedBooks store =
  Array.filter (\book -> book.selected) store.books

parseStore :: String -> Either String Store
parseStore = parseStoreImpl Left Right

seedStore :: Effect Store
seedStore = do
  amaru <- seedBook
    { id: "seed:amaru-treasury-2026-overlay"
    , raw: OverlayBook.bundledAmaruJournal
    }
  sundae <- seedBook
    { id: "seed:sundaeswap-v3-blueprint"
    , raw: OverlayBook.bundledSundaeSwapBlueprint
    }
  shacl <- seedBook
    { id: "seed:cardano-rdf-shacl-shapes"
    , raw: OverlayBook.bundledCardanoShaclShapes
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
          , raw: spec.raw
          , parts: []
          , turtle: ""
          , selected: false
          , seed: true
          }
    )
