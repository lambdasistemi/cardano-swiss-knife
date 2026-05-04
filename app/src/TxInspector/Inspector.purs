module TxInspector.Inspector
  ( InspectorResult
  , runLedgerOperation
  ) where

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)

type InspectorResult =
  { stdout :: String
  , stderr :: String
  , exitOk :: Boolean
  }

foreign import runLedgerOperationImpl
  :: String
  -> String
  -> String
  -> Effect (Promise InspectorResult)

runLedgerOperation :: String -> String -> String -> Aff InspectorResult
runLedgerOperation txCbor op args =
  toAffE (runLedgerOperationImpl txCbor op args)
