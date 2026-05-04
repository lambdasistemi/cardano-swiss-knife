module TxInspector.Koios
  ( fetchTxCbor
  ) where

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)
import TxInspector.Blockfrost (Network, networkName)

foreign import fetchTxCborImpl
  :: String
  -> String
  -> String
  -> Effect (Promise String)

fetchTxCbor :: Network -> String -> String -> Aff String
fetchTxCbor network bearer txHash =
  toAffE (fetchTxCborImpl (networkName network) bearer txHash)
