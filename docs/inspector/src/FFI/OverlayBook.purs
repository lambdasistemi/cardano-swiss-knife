module FFI.OverlayBook
  ( OverlayBook
  , OverlayPart
  , blueprintArgs
  , bundledAmaruJournal
  , bundledCardanoShaclShapes
  , bundledSundaeSwapBlueprint
  , parse
  ) where

import Data.Either (Either(..))
import Effect (Effect)

type OverlayPart =
  { id :: String
  , label :: String
  , kind :: String
  , turtle :: String
  , plutusJson :: String
  }

type OverlayBook =
  { title :: String
  , source :: String
  , parts :: Array OverlayPart
  , turtle :: String
  }

foreign import bundledAmaruJournal :: String

foreign import bundledCardanoShaclShapes :: String

foreign import bundledSundaeSwapBlueprint :: String

foreign import blueprintArgs :: Array OverlayPart -> String

foreign import parseImpl
  :: (String -> Either String OverlayBook)
  -> (OverlayBook -> Either String OverlayBook)
  -> String
  -> Effect (Either String OverlayBook)

parse :: String -> Effect (Either String OverlayBook)
parse = parseImpl Left Right
