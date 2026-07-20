module Test.TextEnvelope (runTextEnvelopeTests) where

import Prelude

import Cardano.TextEnvelope
  ( TextEnvelopeError(..)
  , TextEnvelopeType(..)
  , decodeCborInput
  , encodeTextEnvelope
  , textEnvelopeTypeString
  )
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runTextEnvelopeTests :: Aff Unit
runTextEnvelopeTests = do
  assertRawHex
  assertDecodedEnvelope "Tx ConwayEra" Transaction "transaction description"
  assertDecodedEnvelope "TxWitness ConwayEra" TransactionWitness "witness description"
  assertEncoding Transaction "aBcD" "Tx ConwayEra"
  assertEncoding TransactionWitness "1234" "TxWitness ConwayEra"
  assertRoundTrip Transaction "aBcD"
  assertRoundTrip TransactionWitness "1234"
  assertDecodeError "" EmptyCborHex
  assertDecodeError "abc" OddLengthCborHex
  assertDecodeError "abcz" InvalidCborHex
  assertDecodeError "{" MalformedTextEnvelope
  assertDecodeError "{}" (MissingTextEnvelopeField "type")
  assertDecodeError "{\"type\":\"Tx ConwayEra\",\"cborHex\":\"abcd\"}" (MissingTextEnvelopeField "description")
  assertDecodeError "{\"type\":\"Tx ConwayEra\",\"description\":\"x\"}" (MissingTextEnvelopeField "cborHex")
  assertDecodeError "{\"type\":7,\"description\":\"x\",\"cborHex\":\"abcd\"}" (NonStringTextEnvelopeField "type")
  assertDecodeError "{\"type\":\"Tx ConwayEra\",\"description\":7,\"cborHex\":\"abcd\"}" (NonStringTextEnvelopeField "description")
  assertDecodeError "{\"type\":\"Tx ConwayEra\",\"description\":\"x\",\"cborHex\":7}" (NonStringTextEnvelopeField "cborHex")
  assertDecodeError "{\"type\":\"Tx BabbageEra\",\"description\":\"x\",\"cborHex\":\"abcd\"}" (UnsupportedTextEnvelopeType "Tx BabbageEra")
  assertDecodeError "{\"type\":\"Invented\",\"description\":\"x\",\"cborHex\":\"abcd\"}" (UnsupportedTextEnvelopeType "Invented")
  assertDecodeError "{\"type\":\"Tx ConwayEra\",\"description\":\"x\",\"cborHex\":\"abc\"}" OddLengthCborHex
  assertEncodeError Transaction "" EmptyCborHex
  assertEncodeError Transaction "abc" OddLengthCborHex
  assertEncodeError TransactionWitness "abcz" InvalidCborHex

assertRawHex :: Aff Unit
assertRawHex =
  case decodeCborInput "  aBcD  " of
    Right actual | actual.cborHex == "aBcD" && actual.envelopeType == Nothing && actual.description == Nothing -> pure unit
    _ -> fail "raw hexadecimal input was not decoded with preserved case"

assertDecodedEnvelope :: String -> TextEnvelopeType -> String -> Aff Unit
assertDecodedEnvelope typeName expectedType expectedDescription =
  case decodeCborInput ("{\"type\":\"" <> typeName <> "\",\"description\":\"" <> expectedDescription <> "\",\"cborHex\":\"aBcD\"}") of
    Right actual | actual.cborHex == "aBcD" && actual.envelopeType == Just expectedType && actual.description == Just expectedDescription -> pure unit
    _ -> fail ("failed to decode " <> typeName <> " envelope")

assertEncoding :: TextEnvelopeType -> String -> String -> Aff Unit
assertEncoding envelopeType cborHex expectedType =
  case encodeTextEnvelope envelopeType cborHex of
    Right actual
      | actual == ("{\"type\":\"" <> expectedType <> "\",\"description\":\"Ledger Cddl Format\",\"cborHex\":\"" <> cborHex <> "\"}")
      && textEnvelopeTypeString envelopeType == expectedType -> pure unit
    _ -> fail ("failed to encode exact " <> expectedType <> " envelope")

assertRoundTrip :: TextEnvelopeType -> String -> Aff Unit
assertRoundTrip envelopeType cborHex =
  case encodeTextEnvelope envelopeType cborHex of
    Right encoded ->
      case decodeCborInput encoded of
        Right decoded | decoded.cborHex == cborHex && decoded.envelopeType == Just envelopeType -> pure unit
        _ -> fail "encoded envelope did not decode to the original artifact"
    Left _ -> fail "could not encode valid CBOR for round-trip"

assertDecodeError :: String -> TextEnvelopeError -> Aff Unit
assertDecodeError input expected =
  case decodeCborInput input of
    Left actual | actual == expected -> pure unit
    _ -> fail ("unexpected decoder result for: " <> input)

assertEncodeError :: TextEnvelopeType -> String -> TextEnvelopeError -> Aff Unit
assertEncodeError envelopeType input expected =
  case encodeTextEnvelope envelopeType input of
    Left actual | actual == expected -> pure unit
    _ -> fail ("unexpected encoder result for: " <> input)

fail :: String -> Aff Unit
fail = liftEffect <<< throw
