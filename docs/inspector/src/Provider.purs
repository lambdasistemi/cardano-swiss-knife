module Provider
  ( Provider(..)
  , providerName
  , needsKey
  , fetchTxCbor
  , submitTxEntry
  , resolveProducerTxContext
  ) where

import Prelude

import Effect.Aff (Aff)
import Data.Either (Either(..))
import Cardano.Transaction.Entry (TxEntry)
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

submitTxEntry :: Provider -> Network -> String -> Int -> String -> TxEntry -> Aff (Either String { txId :: String, entry :: TxEntry })
submitTxEntry provider network credential currentSlot signedTxCborHex entry = do
  result <- Shared.submitTxEntry (toSharedProvider provider) (toSharedNetwork network) credential currentSlot signedTxCborHex entry
  pure case result of
    Left err -> Left (Shared.renderSubmissionError err)
    Right receipt -> Right { txId: receipt.txId, entry: receipt.entry }

resolveProducerTxContext :: Provider -> Network -> String -> Boolean -> String -> Aff String
resolveProducerTxContext provider network = Shared.resolveProducerTxContext (toSharedProvider provider) (toSharedNetwork network)
