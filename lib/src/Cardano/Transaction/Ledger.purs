module Cardano.Transaction.Ledger
  ( planTransactionWitnessesOperation
  , validateTransactionOperation
  , evaluateTransactionScriptsOperation
  , requiresProviderContext
  ) where

import Prelude

foreign import planTransactionWitnessesOperation :: String
foreign import validateTransactionOperation :: String
foreign import evaluateTransactionScriptsOperation :: String

requiresProviderContext :: String -> Boolean
requiresProviderContext operation =
  operation == planTransactionWitnessesOperation
    || operation == validateTransactionOperation
    || operation == evaluateTransactionScriptsOperation
