module Cardano.Bytes
  ( unsafeIndex
  , slice
  , byteLength
  ) where

import Data.ArrayBuffer.Types (Uint8Array)

foreign import unsafeIndex :: Uint8Array -> Int -> Int

foreign import slice :: Int -> Int -> Uint8Array -> Uint8Array

foreign import byteLength :: Uint8Array -> Int
