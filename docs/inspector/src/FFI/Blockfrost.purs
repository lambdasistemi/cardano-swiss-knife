module FFI.Blockfrost
  ( Network(..)
  , networkName
  , fetchTxCbor
  , fetchTxCborEffect
  , fetchValidationContextEffect
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)

data Network = Mainnet | Preprod | Preview

derive instance eqNetwork :: Eq Network

networkName :: Network -> String
networkName = case _ of
  Mainnet -> "mainnet"
  Preprod -> "preprod"
  Preview -> "preview"

foreign import fetchTxCborImpl
  :: String -- network
  -> String -- projectId
  -> String -- tx hash
  -> Effect (Promise String)

foreign import fetchValidationContextImpl
  :: String -- network
  -> String -- projectId
  -> Effect (Promise String)

fetchTxCbor :: Network -> String -> String -> Aff String
fetchTxCbor net projectId hash =
  toAffE (fetchTxCborEffect net projectId hash)

fetchTxCborEffect :: Network -> String -> String -> Effect (Promise String)
fetchTxCborEffect net projectId hash =
  fetchTxCborImpl (networkName net) projectId hash

fetchValidationContextEffect :: Network -> String -> Effect (Promise String)
fetchValidationContextEffect net projectId =
  fetchValidationContextImpl (networkName net) projectId
