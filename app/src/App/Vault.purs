module App.Vault
  ( VaultEntry
  , VaultImportResult
  , VaultKind(..)
  , createVaultEntry
  , createVaultFile
  , exportVaultFile
  , importVaultFile
  , kindTag
  , labelForKind
  , persistVaultFile
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)

data VaultKind
  = VaultMnemonic
  | VaultSigningKey
  | VaultRootPrivateKey
  | VaultAccountPrivateKey
  | VaultAddressPrivateKey
  | VaultStakePrivateKey

derive instance eqVaultKind :: Eq VaultKind

type VaultEntry =
  { id :: String
  , kind :: String
  , label :: String
  , value :: String
  , createdAt :: String
  }

type VaultImportResult =
  { canceled :: Boolean
  , fileName :: String
  , entries :: Array VaultEntry
  }

foreign import createVaultEntryImpl :: String -> String -> String -> Effect VaultEntry

foreign import createVaultFileImpl :: String -> String -> Array VaultEntry -> Effect (Promise String)

foreign import exportVaultFileImpl :: String -> String -> Array VaultEntry -> Effect (Promise Unit)

foreign import importVaultFileImpl :: String -> Effect (Promise VaultImportResult)

foreign import persistVaultFileImpl :: String -> String -> Array VaultEntry -> Effect (Promise String)

createVaultEntry :: VaultKind -> String -> String -> Effect VaultEntry
createVaultEntry kind label value = createVaultEntryImpl (kindTag kind) label value

createVaultFile :: String -> String -> Array VaultEntry -> Aff String
createVaultFile fileName passphrase entries = toAffE (createVaultFileImpl fileName passphrase entries)

exportVaultFile :: String -> String -> Array VaultEntry -> Aff Unit
exportVaultFile fileName passphrase entries = toAffE (exportVaultFileImpl fileName passphrase entries)

importVaultFile :: String -> Aff VaultImportResult
importVaultFile passphrase = toAffE (importVaultFileImpl passphrase)

persistVaultFile :: String -> String -> Array VaultEntry -> Aff String
persistVaultFile fileName passphrase entries = toAffE (persistVaultFileImpl fileName passphrase entries)

kindTag :: VaultKind -> String
kindTag = case _ of
  VaultMnemonic -> "mnemonic"
  VaultSigningKey -> "signing-key"
  VaultRootPrivateKey -> "root-private-key"
  VaultAccountPrivateKey -> "account-private-key"
  VaultAddressPrivateKey -> "address-private-key"
  VaultStakePrivateKey -> "stake-private-key"

labelForKind :: VaultKind -> String
labelForKind = case _ of
  VaultMnemonic -> "Mnemonic"
  VaultSigningKey -> "Signing key"
  VaultRootPrivateKey -> "Root private key"
  VaultAccountPrivateKey -> "Account private key"
  VaultAddressPrivateKey -> "Address private key"
  VaultStakePrivateKey -> "Stake private key"
