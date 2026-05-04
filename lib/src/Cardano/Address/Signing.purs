module Cardano.Address.Signing
  ( PayloadMode(..)
  , SignResult
  , payloadModeLabel
  , signPayload
  , verifySignature
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hex as Hex
import Cardano.Bytes (byteLength)
import Control.Promise (Promise, toAffE)
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff)

data PayloadMode
  = PayloadText
  | PayloadHex

derive instance eqPayloadMode :: Eq PayloadMode

type SignResult =
  { payloadHex :: String
  , signatureHex :: String
  , verificationKeyBech32 :: String
  }

foreign import encodeUtf8Impl :: String -> Uint8Array

foreign import signSerializedXPrvWasmImpl
  :: (String -> Either String { signatureHex :: String, verificationKeyHex :: String })
  -> ({ signatureHex :: String, verificationKeyHex :: String } -> Either String { signatureHex :: String, verificationKeyHex :: String })
  -> String
  -> String
  -> Effect (Promise (Either String { signatureHex :: String, verificationKeyHex :: String }))

foreign import verifyXPubWasmImpl
  :: (String -> Either String Boolean)
  -> (Boolean -> Either String Boolean)
  -> String
  -> String
  -> String
  -> Effect (Promise (Either String Boolean))

payloadModeLabel :: PayloadMode -> String
payloadModeLabel = case _ of
  PayloadText -> "Text"
  PayloadHex -> "Hex"

signPayload :: PayloadMode -> String -> String -> Aff (Either String SignResult)
signPayload payloadMode payloadInput signingKeyBech32 =
  case Bech32.decode signingKeyBech32 of
    Left err -> pure (Left err)
    Right decoded ->
      case verificationHrpFor decoded.hrp of
        Left err -> pure (Left err)
        Right verificationHrp ->
          if byteLength decoded.bytes /= 96 then
            pure (Left "Expected a serialized extended signing key with 96 bytes.")
          else do
            let
              payloadHex = case payloadMode of
                PayloadText -> Hex.toHex (encodeUtf8Impl payloadInput)
                PayloadHex -> payloadInput
            let keyHex = Hex.toHex decoded.bytes
            result <- toAffE (signSerializedXPrvWasmImpl Left Right keyHex payloadHex)
            pure $ case result of
              Left err -> Left err
              Right { signatureHex, verificationKeyHex } ->
                case Hex.fromHex verificationKeyHex of
                  Left err -> Left err
                  Right vkBytes -> Right
                    { payloadHex
                    , signatureHex
                    , verificationKeyBech32: Bech32.encode verificationHrp vkBytes
                    }

verifySignature :: PayloadMode -> String -> String -> String -> Aff (Either String Boolean)
verifySignature payloadMode payloadInput verificationKeyBech32 signatureHex =
  case Bech32.decode verificationKeyBech32 of
    Left err -> pure (Left err)
    Right decoded ->
      case ensureVerificationHrp decoded.hrp of
        Left err -> pure (Left err)
        Right _ ->
          if byteLength decoded.bytes /= 64 then
            pure (Left "Expected an extended verification key with 64 bytes.")
          else do
            let
              payloadHex = case payloadMode of
                PayloadText -> Hex.toHex (encodeUtf8Impl payloadInput)
                PayloadHex -> payloadInput
            let keyHex = Hex.toHex decoded.bytes
            toAffE (verifyXPubWasmImpl Left Right keyHex payloadHex signatureHex)

verificationHrpFor :: String -> Either String String
verificationHrpFor = case _ of
  "root_xsk" -> Right "root_xvk"
  "acct_xsk" -> Right "acct_xvk"
  "addr_xsk" -> Right "addr_xvk"
  "stake_xsk" -> Right "stake_xvk"
  other -> Left ("Unsupported signing key prefix: " <> other <> ".")

ensureVerificationHrp :: String -> Either String Unit
ensureVerificationHrp = case _ of
  "root_xvk" -> Right unit
  "acct_xvk" -> Right unit
  "addr_xvk" -> Right unit
  "stake_xvk" -> Right unit
  other -> Left ("Unsupported verification key prefix: " <> other <> ".")
