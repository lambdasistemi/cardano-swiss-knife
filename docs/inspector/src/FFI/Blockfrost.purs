module FFI.Blockfrost
  ( Network(..)
  , networkName
  , toSharedNetwork
  , fetchTxCbor
  , fetchTxCborEffect
  , fetchValidationContextEffect
  ) where

import Prelude

import Effect.Aff (Aff)
import Control.Promise (Promise)
import Effect (Effect)
import Cardano.Provider as Shared

data Network = Mainnet | Preprod | Preview

derive instance eqNetwork :: Eq Network

toSharedNetwork :: Network -> Shared.Network
toSharedNetwork = case _ of
  Mainnet -> Shared.Mainnet
  Preprod -> Shared.Preprod
  Preview -> Shared.Preview

networkName :: Network -> String
networkName = Shared.networkName <<< toSharedNetwork

fetchTxCbor :: Network -> String -> String -> Aff String
fetchTxCbor network = Shared.fetchTxCbor Shared.Blockfrost (toSharedNetwork network)

fetchTxCborEffect :: Network -> String -> String -> Effect (Promise String)
fetchTxCborEffect network = Shared.fetchTxCborEffect Shared.Blockfrost (toSharedNetwork network)

fetchValidationContextEffect :: Network -> String -> Effect (Promise String)
fetchValidationContextEffect network = Shared.fetchValidationContextEffect Shared.Blockfrost (toSharedNetwork network)
