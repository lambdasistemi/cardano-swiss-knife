module Cardano.Transaction.Entry
  ( EntryId
  , SignerId
  , CollectedWitness
  , EntryStatus(..)
  , TxEntry
  , EntryCompleteness
  , deriveCompleteness
  , deriveStatus
  , refreshStatus
  , collectWitness
  ) where

import Prelude

import Cardano.Transaction.Witness (decodeWitnessInput)
import Data.Array (cons, elem, filter, snoc, uncons)
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Maybe (Maybe(..))

type EntryId = String

type SignerId = String

type CollectedWitness =
  { signerId :: SignerId
  , witnessCborHex :: String
  }

data EntryStatus
  = Open
  | Complete
  | Expired
  | Submitted

derive instance eqEntryStatus :: Eq EntryStatus

type TxEntry =
  { entryId :: EntryId
  , unsignedTxCborHex :: String
  , requiredSigners :: Array SignerId
  , collectedWitnesses :: Array CollectedWitness
  , invalidAfterSlot :: Int
  , status :: EntryStatus
  }

type EntryCompleteness =
  { requiredSigners :: Array SignerId
  , satisfiedSigners :: Array SignerId
  , missingSigners :: Array SignerId
  , isComplete :: Boolean
  }

deriveCompleteness :: TxEntry -> EntryCompleteness
deriveCompleteness entry =
  let
    requiredSigners = unique entry.requiredSigners
    satisfiedSigners = filter (hasCollectedWitness entry.collectedWitnesses) requiredSigners
    missingSigners = filter (not <<< hasCollectedWitness entry.collectedWitnesses) requiredSigners
  in
    { requiredSigners
    , satisfiedSigners
    , missingSigners
    , isComplete: missingSigners == []
    }

deriveStatus :: Int -> TxEntry -> EntryStatus
deriveStatus currentSlot entry = case entry.status of
  Submitted -> Submitted
  Expired -> Expired
  _
    | currentSlot >= entry.invalidAfterSlot -> Expired
    | (deriveCompleteness entry).isComplete -> Complete
    | otherwise -> Open

refreshStatus :: Int -> TxEntry -> TxEntry
refreshStatus currentSlot entry = entry { status = deriveStatus currentSlot entry }

collectWitness
  :: Int
  -> { replaceExisting :: Boolean, signerId :: SignerId, witnessInput :: String }
  -> TxEntry
  -> Either String TxEntry
collectWitness currentSlot options entry = do
  rejectTerminalMutation currentSlot entry
  if not (elem options.signerId entry.requiredSigners) then
    Left "Signer is not required by this entry."
  else do
    witnessCborHex <- decodeWitnessInput options.witnessInput
    let
      collectedWitness = { signerId: options.signerId, witnessCborHex }
      isAlreadyCollected = hasCollectedWitness entry.collectedWitnesses options.signerId
    if isAlreadyCollected && not options.replaceExisting then
      Left "Signer already has a collected witness."
    else
      let
        collectedWitnesses =
          if isAlreadyCollected then
            replaceWitness options.signerId collectedWitness entry.collectedWitnesses
          else
            snoc entry.collectedWitnesses collectedWitness
      in
        Right $ refreshStatus currentSlot (entry { collectedWitnesses = collectedWitnesses })

rejectTerminalMutation :: Int -> TxEntry -> Either String Unit
rejectTerminalMutation currentSlot entry = case entry.status of
  Submitted -> Left "Submitted entries cannot collect witnesses."
  Expired -> Left "Expired entries cannot collect witnesses."
  _
    | currentSlot >= entry.invalidAfterSlot -> Left "Expired entries cannot collect witnesses."
    | otherwise -> Right unit

hasCollectedWitness :: Array CollectedWitness -> SignerId -> Boolean
hasCollectedWitness collectedWitnesses signerId =
  foldl
    (\found collectedWitness -> found || collectedWitness.signerId == signerId)
    false
    collectedWitnesses

unique :: Array SignerId -> Array SignerId
unique =
  foldl
    (\known signerId -> if elem signerId known then known else snoc known signerId)
    []

replaceWitness :: SignerId -> CollectedWitness -> Array CollectedWitness -> Array CollectedWitness
replaceWitness signerId replacement = go false
  where
  go replaced witnesses = case uncons witnesses of
    Nothing -> []
    Just { head: collectedWitness, tail: remaining }
      | collectedWitness.signerId /= signerId -> cons collectedWitness (go replaced remaining)
      | replaced -> go true remaining
      | otherwise -> cons replacement (go true remaining)
