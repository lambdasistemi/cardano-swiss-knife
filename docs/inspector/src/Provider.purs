module Provider
  ( Provider(..)
  , providerName
  , needsKey
  , fetchTxCbor
  , resolveProducerTxContext
  ) where

import Prelude

import Effect.Aff (Aff)
import Cardano.Provider as Shared
import FFI.Blockfrost (Network, toSharedNetwork)

data Provider = Blockfrost | Koios

derive instance eqProvider :: Eq Provider

toSharedProvider :: Provider -> Shared.Provider
toSharedProvider = case _ of
  Blockfrost -> Shared.Blockfrost
  Koios -> Shared.Koios

providerName :: Provider -> String
providerName = Shared.providerName <<< toSharedProvider

needsKey :: Provider -> Boolean
needsKey = Shared.needsKey <<< toSharedProvider

-- | Unified fetch. `key` is the project ID for Blockfrost or an optional
-- bearer token for Koios (empty string = no auth).
fetchTxCbor :: Provider -> Network -> String -> String -> Aff String
fetchTxCbor provider network = Shared.fetchTxCbor (toSharedProvider provider) (toSharedNetwork network)

resolveProducerTxContext :: Provider -> Network -> String -> Boolean -> String -> Aff String
resolveProducerTxContext provider network = Shared.resolveProducerTxContext (toSharedProvider provider) (toSharedNetwork network)
