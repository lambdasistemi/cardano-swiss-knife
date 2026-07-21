module Cardano.Transaction.Ledger
  ( planTransactionWitnessesOperation
  , attachTransactionWitnessOperation
  , validateTransactionOperation
  , evaluateTransactionScriptsOperation
  , requiresProviderContext
  ) where

import Prelude

foreign import planTransactionWitnessesOperation :: String
foreign import attachTransactionWitnessOperation :: String
foreign import validateTransactionOperation :: String
foreign import evaluateTransactionScriptsOperation :: String

requiresProviderContext :: String -> Boolean
requiresProviderContext operation =
  operation == planTransactionWitnessesOperation
    || operation == attachTransactionWitnessOperation
    || operation == validateTransactionOperation
    || operation == evaluateTransactionScriptsOperation
