module Cardano.Address.Bech32
  ( encode
  , decode
  ) where

import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))

foreign import encode :: String -> Uint8Array -> String

foreign import decodeImpl
  :: forall result
   . (String -> result)
  -> ({ hrp :: String, bytes :: Uint8Array } -> result)
  -> String
  -> result

decode :: String -> Either String { hrp :: String, bytes :: Uint8Array }
decode = decodeImpl Left Right
