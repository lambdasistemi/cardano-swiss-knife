module FFI.OverlayBook
  ( OverlayBook
  , OverlayPart
  , blueprintArgs
  , bundledAmaruJournal
  , bundledCardanoShaclShapes
  , bundledSundaeSwapBlueprint
  , parse
  ) where

import Prelude (pure)

import Data.Either (Either(..))
import Effect (Effect)
import Cardano.Transaction.Book as Book

type OverlayPart = Book.BookPart

type OverlayBook = Book.Book

bundledAmaruJournal :: String
bundledAmaruJournal = Book.bundledAmaruJournal

bundledCardanoShaclShapes :: String
bundledCardanoShaclShapes = Book.bundledCardanoShaclShapes

bundledSundaeSwapBlueprint :: String
bundledSundaeSwapBlueprint = Book.bundledSundaeSwapBlueprint

blueprintArgs :: Array OverlayPart -> String
blueprintArgs = Book.blueprintArgs

parse :: String -> Effect (Either String OverlayBook)
parse input = pure (Book.parseBook input)
