module TxInspector.Signing
  ( WitnessMaterial
  , signBodyHash
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hash as Hash
import Cardano.Address.Hex as Hex
import Cardano.Address.Signing as Signing
import Cardano.Bytes (byteLength)
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Effect.Aff (Aff)

type WitnessMaterial =
  { bodyHashHex :: String
  , verificationKeyBech32 :: String
  , signerHashHex :: String
  , signatureHex :: String
  , vkeyWitnessCborHex :: String
  }

foreign import xpubPublicKeyBytesImpl :: Uint8Array -> Uint8Array

foreign import vkeyWitnessCborHexImpl :: Uint8Array -> Uint8Array -> String

signBodyHash :: String -> String -> Aff (Either String WitnessMaterial)
signBodyHash bodyHashHex signingKeyBech32 = do
  result <- Signing.signPayload Signing.PayloadHex bodyHashHex signingKeyBech32
  pure case result of
    Left err ->
      Left err
    Right signed ->
      case Bech32.decode signed.verificationKeyBech32 of
        Left err ->
          Left err
        Right decoded ->
          if byteLength decoded.bytes /= 64 then
            Left "Expected an extended verification key with 64 bytes."
          else
            let
              publicKeyBytes = xpubPublicKeyBytesImpl decoded.bytes
              signerHashHex = Hash.hashCredentialHex publicKeyBytes
            in
              case Hex.fromHex signed.signatureHex of
                Left err ->
                  Left err
                Right signatureBytes ->
                  Right
                    { bodyHashHex
                    , verificationKeyBech32: signed.verificationKeyBech32
                    , signerHashHex
                    , signatureHex: signed.signatureHex
                    , vkeyWitnessCborHex: vkeyWitnessCborHexImpl publicKeyBytes signatureBytes
                    }
