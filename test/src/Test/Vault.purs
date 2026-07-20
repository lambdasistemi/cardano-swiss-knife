module Test.Vault (runVaultContractTests) where

import Prelude

import Cardano.Vault (canonicalVaultContract)
import Effect (Effect)
import Effect.Exception (throw)

runVaultContractTests :: Effect Unit
runVaultContractTests = do
  if canonicalVaultContract "{\"cardanoSwissKnifeVault\":{\"version\":1,\"entries\":[]}}" then pure unit
  else throw "Vault canonical contract rejected valid JSON"
  if canonicalVaultContract "{\"cardanoSwissKnifeVault\":{\"version\":2,\"entries\":[]}}" then
    throw "Vault canonical contract accepted unsupported version"
  else pure unit
