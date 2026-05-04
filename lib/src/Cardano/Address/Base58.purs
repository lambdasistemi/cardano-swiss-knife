module Cardano.Address.Base58
  ( encode
  , decode
  ) where

import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))

foreign import encode :: Uint8Array -> String

foreign import decodeImpl
  :: forall result
   . (String -> result)
  -> (Uint8Array -> result)
  -> String
  -> result

decode :: String -> Either String Uint8Array
decode = decodeImpl Left Right
