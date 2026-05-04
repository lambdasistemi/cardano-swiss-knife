module Cardano.Address.Hex
  ( toHex
  , fromHex
  , decodeUtf8
  ) where

import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))

foreign import toHex :: Uint8Array -> String

foreign import fromHexImpl
  :: forall result
   . (String -> result)
  -> (Uint8Array -> result)
  -> String
  -> result

foreign import decodeUtf8 :: Uint8Array -> String

fromHex :: String -> Either String Uint8Array
fromHex = fromHexImpl Left Right
