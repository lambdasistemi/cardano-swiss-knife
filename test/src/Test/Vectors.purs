module Test.Vectors
  ( BootstrapVector
  , DerivationVector
  , DetailRow
  , ExpectedAddressInfo
  , ExpectedKeys
  , ExpectedScriptHash
  , ExpectedScriptTemplate
  , FamilyRestoreVector
  , InspectionVector
  , ShelleyRestoreVector
  , SigningVector
  , ScriptHashVector
  , ScriptTemplateVector
  , ValidationIssue
  , derivationVectors
  , inspectionVectors
  , bootstrapVectors
  , familyRestoreVectors
  , shelleyRestoreVectors
  , signingVectors
  , scriptHashVectors
  , scriptTemplateVectors
  ) where

import Data.Maybe (Maybe)

type DetailRow =
  { label :: String
  , value :: String
  }

type ExpectedKeys =
  { rootKeyBech32 :: String
  , accountKeyBech32 :: String
  , addressKeyBech32 :: String
  , addressPublicKeyBech32 :: String
  , stakeKeyBech32 :: String
  , stakePublicKeyBech32 :: String
  }

type DerivationVector =
  { label :: String
  , mnemonic :: Array String
  , accountIndex :: Int
  , role :: String
  , addressIndex :: Int
  , expected :: ExpectedKeys
  }

type ExpectedAddressInfo =
  { addressStyle :: String
  , addressType :: Int
  , addressTypeLabel :: String
  , networkTag :: Int
  , networkTagLabel :: String
  , stakeReference :: String
  , spendingKeyHash :: Maybe String
  , stakeKeyHash :: Maybe String
  , spendingScriptHash :: Maybe String
  , stakeScriptHash :: Maybe String
  , extraDetails :: Array DetailRow
  }

type InspectionVector =
  { label :: String
  , address :: String
  , expected :: ExpectedAddressInfo
  }

type BootstrapVector =
  { label :: String
  , style :: String
  , network :: String
  , protocolMagic :: Int
  , addressXPubBech32 :: String
  , rootXPubBech32 :: Maybe String
  , derivationPath :: Maybe String
  , expectedAddressBase58 :: String
  }

type FamilyRestoreVector =
  { label :: String
  , style :: String
  , mnemonic :: Array String
  , network :: String
  , protocolMagic :: Int
  , accountIndex :: Int
  , role :: Maybe String
  , addressIndex :: Int
  , expectedAddressBase58 :: String
  }

type ShelleyRestoreVector =
  { label :: String
  , mnemonic :: Array String
  , network :: String
  , networkTag :: Int
  , accountIndex :: Int
  , role :: String
  , addressIndex :: Int
  , paymentAddressBech32 :: Maybe String
  , delegationAddressBech32 :: Maybe String
  , rewardAddressBech32 :: String
  }

type SigningVector =
  { label :: String
  , payloadMode :: String
  , payloadInput :: String
  , signingKeyBech32 :: String
  , verificationKeyBech32 :: String
  , signatureHex :: String
  }

type ExpectedScriptHash =
  { hashHex :: String
  , hashBech32 :: String
  , canonicalCborHex :: String
  , canonicalJson :: String
  , scriptType :: String
  , validationStatus :: String
  , issues :: Array ValidationIssue
  }

type ValidationIssue =
  { level :: String
  , code :: String
  , message :: String
  }

type ScriptHashVector =
  { label :: String
  , scriptCborHex :: String
  , scriptJson :: String
  , expected :: ExpectedScriptHash
  }

type ExpectedScriptTemplate =
  { canonicalTemplateJson :: String
  , templateValidationStatus :: String
  , templateIssues :: Array ValidationIssue
  , hasDerivedScript :: Boolean
  , derivedScript :: ExpectedScriptHash
  }

type ScriptTemplateVector =
  { label :: String
  , templateJson :: String
  , expected :: ExpectedScriptTemplate
  }

foreign import derivationVectors :: Array DerivationVector

foreign import inspectionVectors :: Array InspectionVector

foreign import bootstrapVectors :: Array BootstrapVector

foreign import familyRestoreVectors :: Array FamilyRestoreVector

foreign import shelleyRestoreVectors :: Array ShelleyRestoreVector

foreign import signingVectors :: Array SigningVector

foreign import scriptHashVectors :: Array ScriptHashVector

foreign import scriptTemplateVectors :: Array ScriptTemplateVector
