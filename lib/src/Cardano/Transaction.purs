module Cardano.Transaction
  ( decodeTransactionInput
  , encodeTransactionTextEnvelope
  ) where

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Cardano.TextEnvelope (TextEnvelopeType(..), decodeCborInput, encodeTextEnvelope, renderTextEnvelopeError)

decodeTransactionInput :: String -> Either String String
decodeTransactionInput input = case decodeCborInput input of
  Left error -> Left (renderTextEnvelopeError error)
  Right decoded -> case decoded.envelopeType of
    Just TransactionWitness -> Left "Transaction input must not use a TxWitness ConwayEra TextEnvelope."
    _ -> Right decoded.cborHex

encodeTransactionTextEnvelope :: String -> Either String String
encodeTransactionTextEnvelope cborHex = case encodeTextEnvelope Transaction cborHex of
  Left error -> Left (renderTextEnvelopeError error)
  Right envelope -> Right envelope
