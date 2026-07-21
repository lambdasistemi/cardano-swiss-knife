module Cardano.Transaction
  ( decodeTransactionInput
  ) where

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Cardano.TextEnvelope (TextEnvelopeType(..), decodeCborInput, renderTextEnvelopeError)

decodeTransactionInput :: String -> Either String String
decodeTransactionInput input = case decodeCborInput input of
  Left error -> Left (renderTextEnvelopeError error)
  Right decoded -> case decoded.envelopeType of
    Just TransactionWitness -> Left "Transaction input must not use a TxWitness ConwayEra TextEnvelope."
    _ -> Right decoded.cborHex
