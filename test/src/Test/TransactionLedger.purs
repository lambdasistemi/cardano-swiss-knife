module Test.TransactionLedger (runTransactionLedgerTests) where

import Prelude

import Cardano.Transaction (decodeTransactionInput)
import Data.Either (Either(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runTransactionLedgerTests :: Aff Unit
runTransactionLedgerTests =
  case decodeTransactionInput "{\"type\":\"TxWitness ConwayEra\",\"description\":\"Ledger Cddl Format\",\"cborHex\":\"abcd\"}" of
    Left message | message == "Transaction input must not use a TxWitness ConwayEra TextEnvelope." -> pure unit
    _ -> liftEffect $ throw "transaction slots must reject TxWitness ConwayEra TextEnvelopes"
