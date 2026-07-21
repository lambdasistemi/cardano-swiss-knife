module TxSigning
  ( DetachedWitness
  , WitnessMaterial
  , PastedWitnessMaterial
  , prepareWitness
  , attachWitness
  , attachPastedWitness
  , fetchCurrentSlot
  ) where

import Prelude

import Cardano.Transaction.Witness as Witness
import Cardano.Transaction.Ledger as Ledger
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Effect.Aff (Aff, attempt)
import Effect.Exception (message)
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

type PastedWitnessMaterial =
  { signerHashHex :: String
  , signedTxCborHex :: String
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

type CurrentSlot =
  { valid :: Boolean
  , slot :: Int
  , error :: String
  }

type EngineWitnessPlan =
  { valid :: Boolean
  , requiredSigners :: Array String
  , missingVkeyWitnesses :: Array String
  , presentVkeyWitnesses :: Array String
  , error :: String
  }

foreign import operationWitnessAttachmentImpl :: String -> WitnessAttachment

foreign import decodeCurrentSlotImpl :: String -> CurrentSlot

foreign import engineWitnessPlanImpl :: String -> EngineWitnessPlan

prepareWitness :: String -> String -> Aff (Either String DetachedWitness)
prepareWitness = Witness.prepareWitness

attachWitness :: String -> DetachedWitness -> String -> Boolean -> Aff (Either String WitnessMaterial)
attachWitness txCborHex detached expectedAction replaceExisting = do
  attachResult <- Inspector.runLedgerOperation
    txCborHex
    Ledger.attachTransactionWitnessOperation
    (witnessAttachmentArgs detached.vkeyWitnessCborHex replaceExisting)
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

attachPastedWitness :: String -> String -> Boolean -> Aff (Either String PastedWitnessMaterial)
attachPastedWitness txCborHex witnessCborHex replaceExisting = do
  beforeResult <- Inspector.runLedgerOperation txCborHex Ledger.planTransactionWitnessesOperation "{}"
  let before = engineWitnessPlanImpl beforeResult.stdout
  attachResult <- Inspector.runLedgerOperation
    txCborHex
    Ledger.attachTransactionWitnessOperation
    (witnessAttachmentArgs witnessCborHex replaceExisting)
  let attachment = operationWitnessAttachmentImpl attachResult.stdout
  if not beforeResult.exitOk || not before.valid then
    pure (Left ("Failed to validate pasted witness relevance through the ledger engine: " <> before.error))
  else case pastedAttachmentError attachResult.exitOk attachResult.stderr attachment of
    Just errorMessage -> pure (Left errorMessage)
    Nothing -> do
      afterResult <- Inspector.runLedgerOperation attachment.signedTxCborHex Ledger.planTransactionWitnessesOperation "{}"
      let after = engineWitnessPlanImpl afterResult.stdout
          required = unique (before.requiredSigners <> before.missingVkeyWitnesses)
          newlyPresent = Array.filter (\signer -> not (Array.elem signer before.presentVkeyWitnesses)) after.presentVkeyWitnesses
      if not afterResult.exitOk || not after.valid then
        pure (Left ("Failed to validate pasted witness relevance through the ledger engine: " <> after.error))
      else case Array.head newlyPresent, Array.drop 1 newlyPresent of
        Just signerHashHex, []
          | Array.elem signerHashHex required ->
              pure (Right { signerHashHex, signedTxCborHex: attachment.signedTxCborHex })
        _, _ -> pure (Left "Pasted witness does not satisfy exactly one required signer for this entry.")

fetchCurrentSlot :: Aff String -> Aff (Either String Int)
fetchCurrentSlot fetchValidationContext = do
  fetched <- attempt fetchValidationContext
  pure case fetched of
    Left err -> Left ("Could not fetch the current provider slot. " <> message err)
    Right context ->
      let decoded = decodeCurrentSlotImpl context
      in if decoded.valid then Right decoded.slot else Left ("Could not fetch the current provider slot. " <> decoded.error)

unique :: Array String -> Array String
unique = Array.foldl (\known value -> if Array.elem value known then known else Array.snoc known value) []

pastedAttachmentError :: Boolean -> String -> WitnessAttachment -> Maybe String
pastedAttachmentError exitOk stderr attachment
  | not exitOk =
      Just
        ( "Failed to validate pasted witness: " <>
            if stderr == "" then "Ledger witness attachment operation failed." else stderr
        )
  | not attachment.valid = Just "Failed to validate pasted witness: Ledger witness attachment response was not JSON."
  | attachment.status /= "applied" =
      Just ("Pasted witness does not satisfy a required signer for this entry: " <> renderWitnessAttachmentProblems attachment.errors attachment.warnings)
  | attachment.signedTxCborHex == "" = Just "Failed to validate pasted witness: Ledger witness attachment did not return signed transaction CBOR."
  | attachment.witnessPatchAction == "" = Just "Failed to validate pasted witness: Ledger witness attachment did not report patch action."
  | attachment.witnessPatchAction /= "inserted" && attachment.witnessPatchAction /= "replaced" = Just "Failed to validate pasted witness: Ledger witness attachment action was unsupported."
  | otherwise = Nothing

witnessAttachmentArgs :: String -> Boolean -> String
witnessAttachmentArgs vkeyWitnessCborHex replaceExisting =
  "{\"vkey_witness_cbor_hex\":\"" <> vkeyWitnessCborHex <> "\",\"replace_existing\":" <>
    (if replaceExisting then "true" else "false") <> "}"

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
