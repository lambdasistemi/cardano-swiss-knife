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
import Data.Array as Array
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect.Aff (Aff)
import TxInspector.Inspector as TxInspector
import TxInspector.Json as TxJson

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
                    attachResult <- TxInspector.runLedgerOperation
                      txCborHex
                      "tx.witness.attach"
                      (witnessAttachmentArgs vkeyWitnessHex)
                    let
                      attachment = TxJson.operationWitnessAttachment attachResult.stdout
                    pure case unit of
                      _
                        | not attachResult.exitOk ->
                            Left
                              ( "Failed to patch transaction CBOR: " <>
                                  if attachResult.stderr == "" then
                                    "Ledger witness attachment operation failed."
                                  else
                                    attachResult.stderr
                              )
                        | not attachment.valid ->
                            Left
                              "Failed to patch transaction CBOR: Ledger witness attachment response was not JSON."
                        | attachment.status /= "applied" ->
                            Left
                              ( "Failed to patch transaction CBOR: " <>
                                  renderWitnessAttachmentProblems attachment.errors attachment.warnings
                              )
                        | attachment.signedTxCborHex == "" ->
                            Left
                              "Failed to patch transaction CBOR: Ledger witness attachment did not return signed transaction CBOR."
                        | attachment.witnessPatchAction == "" ->
                            Left
                              "Failed to patch transaction CBOR: Ledger witness attachment did not report patch action."
                        | otherwise ->
                            Right
                              { bodyHashHex
                              , verificationKeyBech32: signed.verificationKeyBech32
                              , signerHashHex
                              , signatureHex: signed.signatureHex
                              , vkeyWitnessCborHex: vkeyWitnessHex
                              , signedTxCborHex: attachment.signedTxCborHex
                              , witnessPatchAction: attachment.witnessPatchAction
                              }

witnessAttachmentArgs :: String -> String
witnessAttachmentArgs vkeyWitnessCborHex =
  "{\"vkey_witness_cbor_hex\":\"" <> vkeyWitnessCborHex <> "\"}"

renderWitnessAttachmentProblems
  :: Array TxJson.WitnessAttachmentIssue
  -> Array String
  -> String
renderWitnessAttachmentProblems errors warnings =
  let
    parts =
      map renderWitnessAttachmentIssue errors <>
        map (\warning -> "warning: " <> warning) warnings
  in
    if Array.null parts then
      "Ledger witness attachment rejected the witness."
    else
      joinWith "; " parts

renderWitnessAttachmentIssue :: TxJson.WitnessAttachmentIssue -> String
renderWitnessAttachmentIssue issue =
  if Array.null issue.path then
    issue.message
  else
    issue.message <> " [" <> joinWith "." issue.path <> "]"
