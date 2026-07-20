module Test.Offline (runOfflineTests) where

import Prelude

import Cardano.Offline.Address as Address
import Cardano.Offline.Key as Key
import Cardano.Offline.Mnemonic as Mnemonic
import Cardano.Offline.Payload as Payload
import Cardano.Offline.Script as Script
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runOfflineTests :: Aff Unit
runOfflineTests = do
  valid <- Address.eitherInspectAddress "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd"
  case valid of
    Right _ -> runWasmBackedTests
    Left _ -> pure unit

runWasmBackedTests :: Aff Unit
runWasmBackedTests = do
  invalid <- Address.eitherInspectAddress "not-a-cardano-address"
  case invalid of
    Left _ -> pure unit
    Right _ -> liftEffect (throw "Offline address facade accepted an invalid address.")

  generated <- liftEffect (Mnemonic.generateMnemonic 12)
  when (not (Mnemonic.validateMnemonic generated)) do
    liftEffect (throw "Offline mnemonic facade generated an invalid mnemonic.")
  when (Mnemonic.validateMnemonic [ "not", "a", "mnemonic" ]) do
    liftEffect (throw "Offline mnemonic facade accepted an invalid mnemonic.")

  case Key.constructShelleyAddresses Key.ShelleyMainnet Nothing "not-an-extended-key" of
    Left _ -> pure unit
    Right _ -> liftEffect (throw "Offline key facade accepted an invalid extended key.")

  verification <- Payload.verifySignature Payload.PayloadText "payload" "not-an-extended-key" "00"
  case verification of
    Left _ -> pure unit
    Right _ -> liftEffect (throw "Offline payload facade accepted an invalid verification key.")

  case Script.analyzeNativeScriptHex "zz" of
    Left _ -> pure unit
    Right _ -> liftEffect (throw "Offline script facade accepted malformed CBOR hex.")
