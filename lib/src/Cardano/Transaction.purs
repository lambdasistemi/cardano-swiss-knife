module Cardano.Transaction
  ( decodeTransactionInput
  ) where

import Data.Either (Either(..))
import Cardano.TextEnvelope (decodeCborInput, renderTextEnvelopeError)

decodeTransactionInput :: String -> Either String String
decodeTransactionInput input = case decodeCborInput input of
  Left error -> Left (renderTextEnvelopeError error)
  Right decoded -> Right decoded.cborHex
