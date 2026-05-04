module TxInspector.Provider
  ( Provider(..)
  , providerName
  , fetchTxCbor
  ) where

import Prelude

import Effect.Aff (Aff)
import TxInspector.Blockfrost (Network)
import TxInspector.Blockfrost as Blockfrost
import TxInspector.Koios as Koios

data Provider = Blockfrost | Koios

derive instance eqProvider :: Eq Provider

providerName :: Provider -> String
providerName = case _ of
  Blockfrost -> "Blockfrost"
  Koios -> "Koios"

fetchTxCbor :: Provider -> Network -> String -> String -> Aff String
fetchTxCbor provider network credential txHash = case provider of
  Blockfrost -> Blockfrost.fetchTxCbor network credential txHash
  Koios -> Koios.fetchTxCbor network credential txHash
