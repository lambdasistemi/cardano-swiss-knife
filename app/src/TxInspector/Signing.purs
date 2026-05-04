module TxInspector.Signing
  ( WitnessMaterial
  , signTransaction
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hash as Hash
import Cardano.Address.Hex as Hex
import Cardano.Address.Signing as Signing
import Cardano.Bytes (byteLength)
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception as Exception

type WitnessMaterial =
  { bodyHashHex :: String
  , verificationKeyBech32 :: String
  , signerHashHex :: String
  , signatureHex :: String
  , vkeyWitnessCborHex :: String
  , signedTxCborHex :: String
  , witnessPatchAction :: String
  }

foreign import xpubPublicKeyBytesImpl :: Uint8Array -> Uint8Array

foreign import vkeyWitnessCborHexImpl :: Uint8Array -> Uint8Array -> String

foreign import patchSignedTxCborImpl
  :: String
  -> String
  -> Effect
       { signedTxCborHex :: String
       , witnessPatchAction :: String
       }

signTransaction :: String -> String -> String -> Aff (Either String WitnessMaterial)
signTransaction txCborHex bodyHashHex signingKeyBech32 = do
  result <- Signing.signPayload Signing.PayloadHex bodyHashHex signingKeyBech32
  case result of
    Left err ->
      pure (Left err)
    Right signed ->
      case Bech32.decode signed.verificationKeyBech32 of
        Left err ->
          pure (Left err)
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
                Left err ->
                  pure (Left err)
                Right signatureBytes ->
                  do
                    let
                      vkeyWitnessHex = vkeyWitnessCborHex signatureBytes
                    patchResult <- liftEffect
                      (Exception.try (patchSignedTxCborImpl txCborHex vkeyWitnessHex))
                    pure case patchResult of
                      Left err ->
                        Left ("Failed to patch transaction CBOR: " <> Exception.message err)
                      Right patched ->
                        Right
                          { bodyHashHex
                          , verificationKeyBech32: signed.verificationKeyBech32
                          , signerHashHex
                          , signatureHex: signed.signatureHex
                          , vkeyWitnessCborHex: vkeyWitnessHex
                          , signedTxCborHex: patched.signedTxCborHex
                          , witnessPatchAction: patched.witnessPatchAction
                          }
