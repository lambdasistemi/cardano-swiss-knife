module Cardano.Transaction.Entry.Ports
  ( EntryStore
  , CoordinationPort
  ) where

import Prelude

import Cardano.Transaction.Entry (CollectedWitness, EntryId, TxEntry)
import Data.Maybe (Maybe)

type EntryStore m =
  { putEntry :: TxEntry -> m Unit
  , lookupEntry :: EntryId -> m (Maybe TxEntry)
  , listEntries :: m (Array TxEntry)
  }

type CoordinationPort m =
  { publishEntry :: TxEntry -> m Unit
  , fetchEntry :: EntryId -> m (Maybe TxEntry)
  , publishWitness :: EntryId -> CollectedWitness -> m Unit
  }
