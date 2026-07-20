module Cardano.TextEnvelope
  ( TextEnvelopeType(..)
  , TextEnvelopeError(..)
  , DecodedCborInput
  , textEnvelopeTypeString
  , decodeCborInput
  , encodeTextEnvelope
  , renderTextEnvelopeError
  ) where

import Prelude

import Data.Array (length)
import Data.Either (Either(..))
import Data.Foldable (all)
import Data.Maybe (Maybe(..))
import Data.String (trim)
import Data.String.CodeUnits (charAt, toCharArray)

data TextEnvelopeType
  = Transaction
  | TransactionWitness

derive instance eqTextEnvelopeType :: Eq TextEnvelopeType

data TextEnvelopeError
  = EmptyCborHex
  | OddLengthCborHex
  | InvalidCborHex
  | MalformedTextEnvelope
  | MissingTextEnvelopeField String
  | NonStringTextEnvelopeField String
  | UnsupportedTextEnvelopeType String

derive instance eqTextEnvelopeError :: Eq TextEnvelopeError

type DecodedCborInput =
  { cborHex :: String
  , envelopeType :: Maybe TextEnvelopeType
  , description :: Maybe String
  }

type JsonField =
  { status :: String
  , value :: String
  }

type ParsedTextEnvelope =
  { typeField :: JsonField
  , descriptionField :: JsonField
  , cborHexField :: JsonField
  }

foreign import parseTextEnvelopeImpl
  :: forall result
   . (ParsedTextEnvelope -> result)
  -> result
  -> String
  -> result

foreign import stringifyTextEnvelope :: String -> String -> String -> String

textEnvelopeTypeString :: TextEnvelopeType -> String
textEnvelopeTypeString = case _ of
  Transaction -> "Tx ConwayEra"
  TransactionWitness -> "TxWitness ConwayEra"

decodeCborInput :: String -> Either TextEnvelopeError DecodedCborInput
decodeCborInput input =
  let
    normalized = trim input
  in
    if beginsWithObject normalized then
      parseTextEnvelopeImpl decodeEnvelope (Left MalformedTextEnvelope) normalized
    else do
      cborHex <- validateCborHex normalized
      pure { cborHex, envelopeType: Nothing, description: Nothing }

encodeTextEnvelope :: TextEnvelopeType -> String -> Either TextEnvelopeError String
encodeTextEnvelope envelopeType cborHex = do
  validatedCborHex <- validateCborHex (trim cborHex)
  pure $ stringifyTextEnvelope (textEnvelopeTypeString envelopeType) "Ledger Cddl Format" validatedCborHex

renderTextEnvelopeError :: TextEnvelopeError -> String
renderTextEnvelopeError = case _ of
  EmptyCborHex -> "CBOR hexadecimal input is empty."
  OddLengthCborHex -> "CBOR hexadecimal input must have an even number of characters."
  InvalidCborHex -> "CBOR hexadecimal input contains a non-hexadecimal character."
  MalformedTextEnvelope -> "TextEnvelope JSON is malformed."
  MissingTextEnvelopeField field -> "TextEnvelope field is missing: " <> field
  NonStringTextEnvelopeField field -> "TextEnvelope field must be a string: " <> field
  UnsupportedTextEnvelopeType typeName -> "Unsupported TextEnvelope type: " <> typeName

decodeEnvelope :: ParsedTextEnvelope -> Either TextEnvelopeError DecodedCborInput
decodeEnvelope envelope = do
  typeName <- requireString "type" envelope.typeField
  description <- requireString "description" envelope.descriptionField
  cborHex <- requireString "cborHex" envelope.cborHexField
  envelopeType <- parseTextEnvelopeType typeName
  validatedCborHex <- validateCborHex cborHex
  pure { cborHex: validatedCborHex, envelopeType: Just envelopeType, description: Just description }

requireString :: String -> JsonField -> Either TextEnvelopeError String
requireString field jsonField = case jsonField.status of
  "missing" -> Left (MissingTextEnvelopeField field)
  "string" -> Right jsonField.value
  _ -> Left (NonStringTextEnvelopeField field)

parseTextEnvelopeType :: String -> Either TextEnvelopeError TextEnvelopeType
parseTextEnvelopeType = case _ of
  "Tx ConwayEra" -> Right Transaction
  "TxWitness ConwayEra" -> Right TransactionWitness
  unsupported -> Left (UnsupportedTextEnvelopeType unsupported)

validateCborHex :: String -> Either TextEnvelopeError String
validateCborHex value
  | value == "" = Left EmptyCborHex
  | mod (length (toCharArray value)) 2 /= 0 = Left OddLengthCborHex
  | all isAsciiHex (toCharArray value) = Right value
  | otherwise = Left InvalidCborHex

beginsWithObject :: String -> Boolean
beginsWithObject value = charAt 0 value == Just '{'

isAsciiHex :: Char -> Boolean
isAsciiHex character =
  (character >= '0' && character <= '9')
    || (character >= 'a' && character <= 'f')
    || (character >= 'A' && character <= 'F')
