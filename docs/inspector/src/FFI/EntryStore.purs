module FFI.EntryStore
  ( entryStore
  ) where

import Prelude

import Cardano.Transaction.Entry
  ( CollectedWitness
  , EntryStatus(..)
  , TxEntry
  )
import Cardano.Transaction.Entry.Ports (EntryStore)
import Control.Promise (Promise, toAffE)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

type PersistedWitness =
  { signerId :: String
  , witnessCborHex :: String
  }

type PersistedEntry =
  { entryId :: String
  , unsignedTxCborHex :: String
  , requiredSigners :: Array String
  , collectedWitnesses :: Array PersistedWitness
  , invalidAfterSlot :: Int
  , status :: String
  }

foreign import putEntryImpl :: PersistedEntry -> Effect (Promise Unit)

foreign import lookupEntryImpl :: String -> Effect (Promise (Nullable PersistedEntry))

foreign import listEntriesImpl :: Effect (Promise (Array PersistedEntry))

entryStore :: EntryStore Aff
entryStore =
  { putEntry: putEntry
  , lookupEntry: lookupEntry
  , listEntries: listEntries
  }

putEntry :: TxEntry -> Aff Unit
putEntry = toAffE <<< putEntryImpl <<< encodeEntry

lookupEntry :: String -> Aff (Maybe TxEntry)
lookupEntry entryId = do
  persisted <- toAffE $ lookupEntryImpl entryId
  case toMaybe persisted of
    Nothing -> pure Nothing
    Just value -> Just <$> decodeOrThrow value

listEntries :: Aff (Array TxEntry)
listEntries = toAffE listEntriesImpl >>= traverse decodeOrThrow

encodeEntry :: TxEntry -> PersistedEntry
encodeEntry entry =
  { entryId: entry.entryId
  , unsignedTxCborHex: entry.unsignedTxCborHex
  , requiredSigners: entry.requiredSigners
  , collectedWitnesses: map encodeWitness entry.collectedWitnesses
  , invalidAfterSlot: entry.invalidAfterSlot
  , status: encodeStatus entry.status
  }

encodeWitness :: CollectedWitness -> PersistedWitness
encodeWitness witness =
  { signerId: witness.signerId
  , witnessCborHex: witness.witnessCborHex
  }

encodeStatus :: EntryStatus -> String
encodeStatus = case _ of
  Open -> "Open"
  Complete -> "Complete"
  Expired -> "Expired"
  Submitted -> "Submitted"

decodeOrThrow :: PersistedEntry -> Aff TxEntry
decodeOrThrow persisted = case decodeEntry persisted of
  Left message -> liftEffect $ throw message
  Right entry -> pure entry

decodeEntry :: PersistedEntry -> Either String TxEntry
decodeEntry entry = do
  status <- decodeStatus entry.status
  pure
    { entryId: entry.entryId
    , unsignedTxCborHex: entry.unsignedTxCborHex
    , requiredSigners: entry.requiredSigners
    , collectedWitnesses: map decodeWitness entry.collectedWitnesses
    , invalidAfterSlot: entry.invalidAfterSlot
    , status
    }

decodeWitness :: PersistedWitness -> CollectedWitness
decodeWitness witness =
  { signerId: witness.signerId
  , witnessCborHex: witness.witnessCborHex
  }

decodeStatus :: String -> Either String EntryStatus
decodeStatus = case _ of
  "Open" -> Right Open
  "Complete" -> Right Complete
  "Expired" -> Right Expired
  "Submitted" -> Right Submitted
  status -> Left $ "Entry store record has unknown status " <> status <> "."
