module Test.TransactionWitness (runTransactionWitnessTests) where

import Prelude

import Cardano.Transaction.Witness (decodeWitnessInput, encodeWitnessTextEnvelope)
import Data.Either (Either(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runTransactionWitnessTests :: Aff Unit
runTransactionWitnessTests = do
  assertRight "raw detached witness CBOR must be accepted" (decodeWitnessInput witnessCbor)
  assertRight "TxWitness ConwayEra TextEnvelope must be accepted" (decodeWitnessInput ("{\"type\":\"TxWitness ConwayEra\",\"description\":\"Ledger Cddl Format\",\"cborHex\":\"" <> witnessCbor <> "\"}"))
  assertLeft "transaction envelope must be rejected in a witness slot" (decodeWitnessInput "{\"type\":\"Tx ConwayEra\",\"description\":\"Ledger Cddl Format\",\"cborHex\":\"abcd\"}")
  assertLeft "malformed detached witness input must remain typed" (decodeWitnessInput "not-cbor")
  assertRight "detached witness output must carry TxWitness ConwayEra type" (encodeWitnessTextEnvelope witnessCbor)

witnessCbor :: String
witnessCbor = "825820" <> zeros 32 <> "5840" <> zeros 64

zeros :: Int -> String
zeros count = if count == 0 then "" else "00" <> zeros (count - 1)

assertRight :: forall a. String -> Either String a -> Aff Unit
assertRight label = case _ of
  Right _ -> pure unit
  Left _ -> liftEffect $ throw label

assertLeft :: forall a. String -> Either String a -> Aff Unit
assertLeft label = case _ of
  Left _ -> pure unit
  Right _ -> liftEffect $ throw label
