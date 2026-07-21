module Test.TransactionEntry (runTransactionEntryTests) where

import Prelude

import Cardano.Transaction.Entry
  ( EntryStatus(..)
  , TxEntry
  , collectWitness
  , deriveCompleteness
  , deriveStatus
  , refreshStatus
  )
import Cardano.Transaction.Entry.Ports (CoordinationPort, EntryStore)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runTransactionEntryTests :: Aff Unit
runTransactionEntryTests = do
  assertCompleteness
    "completeness preserves the required roster order while partitioning it"
    (entry [ "alice", "bob", "carol" ] [ witness "carol" "cc", witness "alice" "aa" ])
    [ "alice", "bob", "carol" ]
    [ "alice", "carol" ]
    [ "bob" ]
    false
  assertCompleteness
    "duplicate required signers and unrelated witnesses are set-like"
    (entry [ "alice", "alice", "bob" ] [ witness "alice" "aa", witness "mallory" "mm" ])
    [ "alice", "bob" ]
    [ "alice" ]
    [ "bob" ]
    false
  assertCompleteness
    "an empty required roster is complete"
    (entry [] [ witness "mallory" "mm" ])
    []
    []
    []
    true
  assertCompleteness
    "a full required roster is complete"
    (entry [ "alice", "bob" ] [ witness "bob" "bb", witness "alice" "aa" ])
    [ "alice", "bob" ]
    [ "alice", "bob" ]
    []
    true
  assertEqual "an incomplete live entry is open" Open (deriveStatus 9 (entry [ "alice" ] []))
  assertEqual "a complete live entry is complete" Complete (deriveStatus 9 (entry [ "alice" ] [ witness "alice" "aa" ]))
  assertEqual "expiry starts at the invalid-after slot" Expired (deriveStatus 10 (entry [ "alice" ] [ witness "alice" "aa" ]))
  assertEqual "expiry takes precedence over completeness" Expired (deriveStatus 11 (entry [ "alice" ] [ witness "alice" "aa" ]))
  assertEqual "submitted status is terminal" Submitted (deriveStatus 0 ((entry [ "alice" ] []) { status = Submitted }))
  assertEqual "persisted expired status is terminal" Expired (deriveStatus 0 ((entry [ "alice" ] []) { status = Expired }))
  assertEqual "refreshStatus updates only the live status" Complete (refreshStatus 9 (entry [ "alice" ] [ witness "alice" "aa" ])).status
  assertWitnessCollection
  assertCollectionFailures
  assertPorts

assertWitnessCollection :: Aff Unit
assertWitnessCollection = do
  let
    rawInput = "aBcD"
    envelopeInput = "{\"type\":\"TxWitness ConwayEra\",\"description\":\"Ledger Cddl Format\",\"cborHex\":\"aBcD\"}"
    initial = entry [ "alice", "bob" ] []
  raw <- assertRight "raw witness input must collect" (collectWitness 9 { replaceExisting: false, signerId: "alice", witnessInput: rawInput } initial)
  enveloped <- assertRight "TxWitness ConwayEra input must collect" (collectWitness 9 { replaceExisting: false, signerId: "alice", witnessInput: envelopeInput } initial)
  assertEqual "raw and TextEnvelope input normalize identically" raw.collectedWitnesses enveloped.collectedWitnesses
  assertEqual "a collected witness retains the caller-supplied signer" [ witness "alice" rawInput ] raw.collectedWitnesses
  complete <- assertRight "a second witness must collect" (collectWitness 9 { replaceExisting: false, signerId: "bob", witnessInput: "beef" } raw)
  assertEqual "collecting the final signer refreshes status" Complete complete.status
  replaced <- assertRight
    "explicit replacement must succeed"
    ( collectWitness 9
        { replaceExisting: true, signerId: "alice", witnessInput: "cccc" }
        (entry [ "alice", "bob" ] [ witness "alice" "aaaa", witness "bob" "bbbb" ])
    )
  assertEqual
    "replacement retains the witness position without duplication"
    [ witness "alice" "cccc", witness "bob" "bbbb" ]
    replaced.collectedWitnesses

assertCollectionFailures :: Aff Unit
assertCollectionFailures = do
  let
    initial = entry [ "alice" ] []
    duplicate = entry [ "alice" ] [ witness "alice" "aaaa" ]
    transactionEnvelope = "{\"type\":\"Tx ConwayEra\",\"description\":\"Ledger Cddl Format\",\"cborHex\":\"abcd\"}"
  assertLeft "a transaction TextEnvelope is invalid for a witness" (collectWitness 9 { replaceExisting: false, signerId: "alice", witnessInput: transactionEnvelope } initial)
  assertLeft "malformed witness input is rejected" (collectWitness 9 { replaceExisting: false, signerId: "alice", witnessInput: "abcz" } initial)
  assertLeft "a signer outside the required roster is rejected" (collectWitness 9 { replaceExisting: false, signerId: "mallory", witnessInput: "abcd" } initial)
  assertLeft "a duplicate signer requires explicit replacement" (collectWitness 9 { replaceExisting: false, signerId: "alice", witnessInput: "cccc" } duplicate)
  assertLeft "submitted entries cannot be mutated" (collectWitness 9 { replaceExisting: true, signerId: "alice", witnessInput: "cccc" } (initial { status = Submitted }))
  assertLeft "persisted expired entries cannot be mutated" (collectWitness 9 { replaceExisting: true, signerId: "alice", witnessInput: "cccc" } (initial { status = Expired }))
  assertLeft "entries at their expiry slot cannot be mutated" (collectWitness 10 { replaceExisting: true, signerId: "alice", witnessInput: "cccc" } initial)

assertPorts :: Aff Unit
assertPorts = do
  let
    storedEntry = entry [ "alice" ] []
    storedWitness = witness "alice" "aBcD"

    store :: EntryStore Aff
    store =
      { putEntry: \_ -> pure unit
      , lookupEntry: \entryId -> pure $ if entryId == storedEntry.entryId then Just storedEntry else Nothing
      , listEntries: pure [ storedEntry ]
      }

    coordination :: CoordinationPort Aff
    coordination =
      { publishEntry: \_ -> pure unit
      , fetchEntry: \entryId -> pure $ if entryId == storedEntry.entryId then Just storedEntry else Nothing
      , publishWitness: \_ _ -> pure unit
      }
  store.putEntry storedEntry
  assertEqual "EntryStore lookupEntry is exercised" (Just storedEntry) =<< store.lookupEntry "entry-1"
  assertEqual "EntryStore listEntries is exercised" [ storedEntry ] =<< store.listEntries
  coordination.publishEntry storedEntry
  assertEqual "CoordinationPort fetchEntry is exercised" (Just storedEntry) =<< coordination.fetchEntry "entry-1"
  coordination.publishWitness storedEntry.entryId storedWitness

entry :: Array String -> Array { signerId :: String, witnessCborHex :: String } -> TxEntry
entry requiredSigners collectedWitnesses =
  { entryId: "entry-1"
  , unsignedTxCborHex: "deadbeef"
  , requiredSigners
  , collectedWitnesses
  , invalidAfterSlot: 10
  , status: Open
  }

witness :: String -> String -> { signerId :: String, witnessCborHex :: String }
witness signerId witnessCborHex = { signerId, witnessCborHex }

assertCompleteness
  :: String
  -> TxEntry
  -> Array String
  -> Array String
  -> Array String
  -> Boolean
  -> Aff Unit
assertCompleteness label value requiredSigners satisfiedSigners missingSigners isComplete =
  let
    actual = deriveCompleteness value
  in
    if
      actual.requiredSigners == requiredSigners
        && actual.satisfiedSigners == satisfiedSigners
        && actual.missingSigners == missingSigners
        && actual.isComplete == isComplete then
      pure unit
    else
      fail label

assertRight :: forall a. String -> Either String a -> Aff a
assertRight label = case _ of
  Right value -> pure value
  Left _ -> fail label

assertLeft :: forall a. String -> Either String a -> Aff Unit
assertLeft label = case _ of
  Left _ -> pure unit
  Right _ -> fail label

assertEqual :: forall a. Eq a => String -> a -> a -> Aff Unit
assertEqual label expected actual =
  if expected == actual then pure unit else fail label

fail :: forall a. String -> Aff a
fail = liftEffect <<< throw
