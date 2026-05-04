module TxInspector.Blockfrost
  ( Network(..)
  , networkName
  , fetchTxCbor
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
  :: String
  -> String
  -> String
  -> Effect (Promise String)

fetchTxCbor :: Network -> String -> String -> Aff String
fetchTxCbor network projectId txHash =
  toAffE (fetchTxCborImpl (networkName network) projectId txHash)
