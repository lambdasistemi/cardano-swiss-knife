module FFI.Koios
  ( fetchTxCbor
  , fetchTxCborEffect
  , fetchValidationContextEffect
  ) where

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)
import FFI.Blockfrost (Network, networkName)

foreign import fetchTxCborImpl
  :: String -- network
  -> String -- bearer (empty string = none)
  -> String -- tx hash
  -> Effect (Promise String)

foreign import fetchValidationContextImpl
  :: String -- network
  -> String -- bearer (empty string = none)
  -> Effect (Promise String)

fetchTxCbor :: Network -> String -> String -> Aff String
fetchTxCbor net bearer hash =
  toAffE (fetchTxCborEffect net bearer hash)

fetchTxCborEffect :: Network -> String -> String -> Effect (Promise String)
fetchTxCborEffect net bearer hash =
  fetchTxCborImpl (networkName net) bearer hash

fetchValidationContextEffect :: Network -> String -> Effect (Promise String)
fetchValidationContextEffect net bearer =
  fetchValidationContextImpl (networkName net) bearer
