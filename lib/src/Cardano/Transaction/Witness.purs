module Cardano.Transaction.Witness
  ( DetachedWitness
  , decodeWitnessInput
  , encodeWitnessTextEnvelope
  , prepareWitness
  , attachmentSafety
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hash as Hash
import Cardano.Address.Hex as Hex
import Cardano.Address.Signing as Signing
import Cardano.Bytes (byteLength)
import Cardano.TextEnvelope (TextEnvelopeType(..), decodeCborInput, encodeTextEnvelope, renderTextEnvelopeError)
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)

type DetachedWitness =
  { bodyHashHex :: String
  , verificationKeyBech32 :: String
  , signerHashHex :: String
  , signatureHex :: String
  , vkeyWitnessCborHex :: String
  }

foreign import xpubPublicKeyBytesImpl :: Uint8Array -> Uint8Array

foreign import vkeyWitnessCborHexImpl :: Uint8Array -> Uint8Array -> String

decodeWitnessInput :: String -> Either String String
decodeWitnessInput input = case decodeCborInput input of
  Left error -> Left (renderTextEnvelopeError error)
  Right decoded -> case decoded.envelopeType of
    Just Transaction -> Left "Witness input must not use a Tx ConwayEra TextEnvelope."
    _ -> Right decoded.cborHex

encodeWitnessTextEnvelope :: String -> Either String String
encodeWitnessTextEnvelope cborHex = case encodeTextEnvelope TransactionWitness cborHex of
  Left error -> Left (renderTextEnvelopeError error)
  Right envelope -> Right envelope

prepareWitness :: String -> String -> Aff (Either String DetachedWitness)
prepareWitness bodyHashHex signingKeyBech32 = do
  result <- Signing.signPayload Signing.PayloadHex bodyHashHex signingKeyBech32
  case result of
    Left err -> pure (Left err)
    Right signed ->
      case Bech32.decode signed.verificationKeyBech32 of
        Left err -> pure (Left err)
        Right decoded ->
          if byteLength decoded.bytes /= 64 then
            pure (Left "Expected an extended verification key with 64 bytes.")
          else
            let
              publicKeyBytes = xpubPublicKeyBytesImpl decoded.bytes
              signerHashHex = Hash.hashCredentialHex publicKeyBytes
              vkeyWitnessCborHex = vkeyWitnessCborHexImpl publicKeyBytes
            in
              case Hex.fromHex signed.signatureHex of
                Left err -> pure (Left err)
                Right signatureBytes ->
                  pure
                    ( Right
                        { bodyHashHex
                        , verificationKeyBech32: signed.verificationKeyBech32
                        , signerHashHex
                        , signatureHex: signed.signatureHex
                        , vkeyWitnessCborHex: vkeyWitnessCborHex signatureBytes
                        }
                    )

attachmentSafety :: Boolean -> Boolean -> Boolean -> Either String String
attachmentSafety isMissing isPresent replaceExisting
  | isMissing = Right "inserted"
  | isPresent && replaceExisting = Right "replaced"
  | isPresent = Left "Signer already present in the witness set."
  | otherwise = Left "Signer is not required by the current witness plan."
