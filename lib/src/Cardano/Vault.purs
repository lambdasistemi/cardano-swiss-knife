module Cardano.Vault
  ( canonicalVaultContract
  ) where

foreign import canonicalVaultContractImpl :: String -> Boolean

canonicalVaultContract :: String -> Boolean
canonicalVaultContract = canonicalVaultContractImpl
