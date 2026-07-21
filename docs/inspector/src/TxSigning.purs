module TxSigning
  ( DetachedWitness
  , WitnessMaterial
  , prepareWitness
  , attachWitness
  ) where

import Prelude

import Cardano.Transaction.Witness as Witness
import Data.Array as Array
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect.Aff (Aff)
import FFI.Inspector as Inspector

type DetachedWitness = Witness.DetachedWitness

type WitnessMaterial =
  { bodyHashHex :: String
  , verificationKeyBech32 :: String
  , signerHashHex :: String
  , signatureHex :: String
  , vkeyWitnessCborHex :: String
  , signedTxCborHex :: String
  , witnessPatchAction :: String
  }

type WitnessAttachmentIssue =
  { code :: String
  , message :: String
  , path :: Array String
  }

type WitnessAttachment =
  { valid :: Boolean
  , status :: String
  , signedTxCborHex :: String
  , witnessPatchAction :: String
  , errors :: Array WitnessAttachmentIssue
  , warnings :: Array String
  }

foreign import operationWitnessAttachmentImpl :: String -> WitnessAttachment

prepareWitness :: String -> String -> Aff (Either String DetachedWitness)
prepareWitness = Witness.prepareWitness

attachWitness :: String -> DetachedWitness -> String -> Aff (Either String WitnessMaterial)
attachWitness txCborHex detached expectedAction = do
  attachResult <- Inspector.runLedgerOperation
    txCborHex
    "tx.witness.attach"
    (witnessAttachmentArgs detached.vkeyWitnessCborHex)
  let attachment = operationWitnessAttachmentImpl attachResult.stdout
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
            ( "Failed to patch transaction CBOR: " <>
                if attachResult.stderr /= "" then
                  attachResult.stderr
                else if attachResult.stdout /= "" then
                  "Ledger witness attachment response was not JSON."
                else
                  "Ledger witness attachment produced no JSON response."
            )
      | attachment.status /= "applied" ->
          Left
            ( "Failed to patch transaction CBOR: " <>
                renderWitnessAttachmentProblems attachment.errors attachment.warnings
            )
      | attachment.signedTxCborHex == "" ->
          Left "Failed to patch transaction CBOR: Ledger witness attachment did not return signed transaction CBOR."
      | attachment.witnessPatchAction == "" ->
          Left "Failed to patch transaction CBOR: Ledger witness attachment did not report patch action."
      | attachment.witnessPatchAction /= expectedAction ->
          Left "Failed to patch transaction CBOR: Ledger witness attachment action did not match the signer safety policy."
      | otherwise ->
          Right
            { bodyHashHex: detached.bodyHashHex
            , verificationKeyBech32: detached.verificationKeyBech32
            , signerHashHex: detached.signerHashHex
            , signatureHex: detached.signatureHex
            , vkeyWitnessCborHex: detached.vkeyWitnessCborHex
            , signedTxCborHex: attachment.signedTxCborHex
            , witnessPatchAction: attachment.witnessPatchAction
            }

witnessAttachmentArgs :: String -> String
witnessAttachmentArgs vkeyWitnessCborHex =
  "{\"vkey_witness_cbor_hex\":\"" <> vkeyWitnessCborHex <> "\"}"

renderWitnessAttachmentProblems
  :: Array WitnessAttachmentIssue
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

renderWitnessAttachmentIssue :: WitnessAttachmentIssue -> String
renderWitnessAttachmentIssue issue =
  if Array.null issue.path then
    issue.message
  else
    issue.message <> " [" <> joinWith "." issue.path <> "]"
