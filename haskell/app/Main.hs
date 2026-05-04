{-# LANGUAGE DataKinds #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DuplicateRecordFields #-}
{-# LANGUAGE LambdaCase #-}
{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE RecordWildCards #-}
{-# LANGUAGE TypeApplications #-}

{- |
Module      : Main
Description : Generate golden vectors from cardano-addresses
Copyright   : (c) cardano-addresses-browser contributors, 2026
License     : Apache-2.0

Builds the committed derivation and inspection fixtures from the
Haskell `cardano-addresses` library so the PureScript/browser layer is
tested against the upstream implementation.
-}
module Main where

import Prelude

import Cardano.Address (
    Address,
    AddressDiscrimination (RequiresNetworkTag),
    ChainPointer (..),
    NetworkDiscriminant,
    NetworkTag (..),
    base58,
    bech32,
    bech32With,
    unAddress,
    unsafeMkAddress,
 )
import Cardano.Address.Derivation (
    Depth (AccountK, DelegationK, PaymentK, RootK),
    DerivationType (Hardened, Soft, WholeDomain),
    Index,
    XPrv,
    XPub,
    indexFromWord32,
    sign,
    toXPub,
    verify,
    xprvToBytes,
    xpubToBytes,
 )
import Cardano.Address.KeyHash (
    KeyHash,
    KeyRole (Payment, PaymentShared, Policy),
 )
import Cardano.Address.Script (
    Cosigner (..),
    ErrRecommendedValidateScript (..),
    ErrValidateScript (..),
    ErrValidateScriptTemplate (..),
    Script (..),
    ScriptHash (ScriptHash),
    ScriptTemplate (..),
    ValidationLevel (RecommendedValidation, RequiredValidation),
    cosignerToText,
    cosigners,
    prettyErrValidateScriptTemplate,
    scriptHashToText,
    serializeScript,
    template,
    toScriptHash,
    validateScript,
    validateScriptTemplate,
 )
import Cardano.Address.Style.Shelley (
    AddressInfo (..),
    Credential (DelegationFromExtendedKey, PaymentFromExtendedKey),
    InspectAddress (InspectAddressShelley),
    ReferenceInfo (ByPointer, ByValue),
    Role (UTxOExternal, UTxOInternal),
    Shelley (..),
    delegationAddress,
    deriveAccountPrivateKey,
    deriveAddressPrivateKey,
    deriveDelegationPrivateKey,
    eitherInspectAddress,
    genMasterKeyFromMnemonic,
    hashKey,
    mkNetworkDiscriminant,
    paymentAddress,
    pointerAddress,
    shelleyMainnet,
    shelleyTestnet,
    stakeAddress,
 )
import Cardano.Mnemonic (
    SomeMnemonic,
    mkSomeMnemonic,
 )
import Data.Aeson (
    ToJSON,
    encode,
 )
import Data.Maybe (
    fromMaybe,
 )
import Data.String (
    fromString,
 )
import Data.Text (
    Text,
 )
import Data.Text qualified as Text
import GHC.Generics (
    Generic,
 )

import Cardano.Address.Style.Byron qualified as Byron
import Cardano.Address.Style.Icarus qualified as Icarus
import Cardano.Address.Style.Shared qualified as Shared
import Cardano.Codec.Bech32.Prefixes qualified as CIP5
import Cardano.Codec.Cbor qualified as CBOR
import Codec.Binary.Bech32 qualified as Bech32
import Codec.Binary.Encoding qualified as Encoding
import Codec.CBOR.Decoding qualified as CBORDec
import Data.Bits (shiftL)
import Data.ByteArray qualified as BA
import Data.ByteString qualified as BS
import Data.ByteString.Lazy qualified as BL
import Data.Char (isDigit)
import Data.Map.Strict qualified as Map
import Data.Text.Encoding qualified as Text
import Data.Word (Word32, Word8)

data Vectors = Vectors
    { derivationVectors :: [DerivationVector]
    , inspectionVectors :: [InspectionVector]
    , scriptHashVectors :: [ScriptHashVector]
    , scriptTemplateVectors :: [ScriptTemplateVector]
    , bootstrapVectors :: [BootstrapVector]
    , familyRestoreVectors :: [FamilyRestoreVector]
    , shelleyRestoreVectors :: [ShelleyRestoreVector]
    , signingVectors :: [SigningVector]
    }
    deriving (Eq, Generic, Show)

instance ToJSON Vectors

data DerivationVector = DerivationVector
    { label :: Text
    , mnemonic :: [Text]
    , accountIndex :: Int
    , role :: Text
    , addressIndex :: Int
    , expected :: ExpectedKeys
    }
    deriving (Eq, Generic, Show)

instance ToJSON DerivationVector

data ExpectedKeys = ExpectedKeys
    { rootKeyBech32 :: Text
    , accountKeyBech32 :: Text
    , addressKeyBech32 :: Text
    , addressPublicKeyBech32 :: Text
    , stakeKeyBech32 :: Text
    , stakePublicKeyBech32 :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON ExpectedKeys

data InspectionVector = InspectionVector
    { label :: Text
    , address :: Text
    , expected :: ExpectedAddressInfo
    }
    deriving (Eq, Generic, Show)

instance ToJSON InspectionVector

data ExpectedAddressInfo = ExpectedAddressInfo
    { addressStyle :: Text
    , addressType :: Int
    , addressTypeLabel :: Text
    , networkTag :: Int
    , networkTagLabel :: Text
    , stakeReference :: Text
    , spendingKeyHash :: Maybe Text
    , stakeKeyHash :: Maybe Text
    , spendingScriptHash :: Maybe Text
    , stakeScriptHash :: Maybe Text
    , extraDetails :: [DetailRow]
    }
    deriving (Eq, Generic, Show)

instance ToJSON ExpectedAddressInfo

data DetailRow = DetailRow
    { label :: Text
    , value :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON DetailRow

data ScriptHashVector = ScriptHashVector
    { label :: Text
    , scriptCborHex :: Text
    , scriptJson :: Text
    , expected :: ExpectedScriptHash
    }
    deriving (Eq, Generic, Show)

instance ToJSON ScriptHashVector

data ExpectedScriptHash = ExpectedScriptHash
    { hashHex :: Text
    , hashBech32 :: Text
    , canonicalCborHex :: Text
    , canonicalJson :: Text
    , scriptType :: Text
    , validationStatus :: Text
    , issues :: [ValidationIssue]
    }
    deriving (Eq, Generic, Show)

instance ToJSON ExpectedScriptHash

data ValidationIssue = ValidationIssue
    { level :: Text
    , code :: Text
    , message :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON ValidationIssue

data ScriptTemplateVector = ScriptTemplateVector
    { label :: Text
    , templateJson :: Text
    , expected :: ExpectedScriptTemplate
    }
    deriving (Eq, Generic, Show)

instance ToJSON ScriptTemplateVector

data ExpectedScriptTemplate = ExpectedScriptTemplate
    { canonicalTemplateJson :: Text
    , templateValidationStatus :: Text
    , templateIssues :: [ValidationIssue]
    , hasDerivedScript :: Bool
    , derivedScript :: ExpectedScriptHash
    }
    deriving (Eq, Generic, Show)

instance ToJSON ExpectedScriptTemplate

data BootstrapVector = BootstrapVector
    { label :: Text
    , style :: Text
    , network :: Text
    , protocolMagic :: Int
    , addressXPubBech32 :: Text
    , rootXPubBech32 :: Maybe Text
    , derivationPath :: Maybe Text
    , expectedAddressBase58 :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON BootstrapVector

data FamilyRestoreVector = FamilyRestoreVector
    { label :: Text
    , style :: Text
    , mnemonic :: [Text]
    , network :: Text
    , protocolMagic :: Int
    , accountIndex :: Int
    , role :: Maybe Text
    , addressIndex :: Int
    , expectedAddressBase58 :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON FamilyRestoreVector

data ShelleyRestoreVector = ShelleyRestoreVector
    { label :: Text
    , mnemonic :: [Text]
    , network :: Text
    , networkTag :: Int
    , accountIndex :: Int
    , role :: Text
    , addressIndex :: Int
    , paymentAddressBech32 :: Maybe Text
    , delegationAddressBech32 :: Maybe Text
    , rewardAddressBech32 :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON ShelleyRestoreVector

data SigningVector = SigningVector
    { label :: Text
    , payloadMode :: Text
    , payloadInput :: Text
    , signingKeyBech32 :: Text
    , verificationKeyBech32 :: Text
    , signatureHex :: Text
    }
    deriving (Eq, Generic, Show)

instance ToJSON SigningVector

main :: IO ()
main = BL.putStr (encode vectors)

vectors :: Vectors
vectors =
    Vectors
        { derivationVectors =
            concatMap derivationVectorsForMnemonic mnemonics
        , inspectionVectors =
            concatMap inspectionVectorsForMnemonic mnemonics
        , scriptHashVectors =
            concatMap scriptHashVectorsForMnemonic mnemonics
        , scriptTemplateVectors =
            concatMap scriptTemplateVectorsForMnemonic mnemonics
        , bootstrapVectors =
            concatMap bootstrapVectorsForMnemonic mnemonics
        , familyRestoreVectors =
            concatMap familyRestoreVectorsForMnemonic mnemonics
        , shelleyRestoreVectors =
            concatMap shelleyRestoreVectorsForMnemonic mnemonics
        , signingVectors =
            concatMap signingVectorsForMnemonic mnemonics
        }

mnemonics :: [[Text]]
mnemonics =
    [
        [ "message"
        , "mask"
        , "aunt"
        , "wheel"
        , "ten"
        , "maze"
        , "between"
        , "tomato"
        , "slow"
        , "analyst"
        , "ladder"
        , "such"
        , "report"
        , "capital"
        , "produce"
        ]
    ,
        [ "network"
        , "empty"
        , "cause"
        , "mean"
        , "expire"
        , "private"
        , "finger"
        , "accident"
        , "session"
        , "problem"
        , "absurd"
        , "banner"
        , "stage"
        , "void"
        , "what"
        ]
    ,
        [ "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "abandon"
        , "about"
        ]
    ]

derivationVectorsForMnemonic :: [Text] -> [DerivationVector]
derivationVectorsForMnemonic mnemonicWords =
    concatMap (derivationVectorsForAccount mnemonicWords) [0, 1, 7]

derivationVectorsForAccount :: [Text] -> Int -> [DerivationVector]
derivationVectorsForAccount mnemonicWords accountIx =
    [ mkDerivationVector mnemonicWords accountIx "external" 0
    , mkDerivationVector mnemonicWords accountIx "external" 1
    , mkDerivationVector mnemonicWords accountIx "external" 17
    , mkDerivationVector mnemonicWords accountIx "external" 1442
    , mkDerivationVector mnemonicWords accountIx "external" 4096
    , mkDerivationVector mnemonicWords accountIx "internal" 0
    , mkDerivationVector mnemonicWords accountIx "internal" 7
    , mkDerivationVector mnemonicWords accountIx "internal" 31
    , mkDerivationVector mnemonicWords accountIx "stake" 0
    ]

inspectionVectorsForMnemonic :: [Text] -> [InspectionVector]
inspectionVectorsForMnemonic mnemonicWords =
    let rootKey = rootKeyFromMnemonic mnemonicWords
        account0 = accountKey rootKey 0
        account1 = accountKey rootKey 1
        account7 = accountKey rootKey 7
        external0 = addressKey account0 UTxOExternal 0
        external1 = addressKey account0 UTxOExternal 1
        internal0 = addressKey account0 UTxOInternal 0
        internal7 = addressKey account0 UTxOInternal 7
        stake0 = delegationKey account0
        stake1 = delegationKey account1
        stake7 = delegationKey account7
        paymentMainnet0 =
            paymentAddress shelleyMainnet (PaymentFromExtendedKey (toXPub <$> external0))
        paymentTestnet0 =
            paymentAddress shelleyTestnet (PaymentFromExtendedKey (toXPub <$> external0))
        paymentCustom3 =
            paymentAddress (unsafeNetworkDiscriminant 3) (PaymentFromExtendedKey (toXPub <$> external0))
        paymentCustom6 =
            paymentAddress (unsafeNetworkDiscriminant 6) (PaymentFromExtendedKey (toXPub <$> external0))
        changeMainnet0 =
            paymentAddress shelleyMainnet (PaymentFromExtendedKey (toXPub <$> internal0))
        changeTestnet7 =
            paymentAddress shelleyTestnet (PaymentFromExtendedKey (toXPub <$> internal7))
        delegationTestnet0 =
            delegationAddress
                shelleyTestnet
                (PaymentFromExtendedKey (toXPub <$> external0))
                (DelegationFromExtendedKey (toXPub <$> stake0))
        delegationMainnet0 =
            delegationAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> external0))
                (DelegationFromExtendedKey (toXPub <$> stake0))
        delegationMainnet1 =
            delegationAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> external1))
                (DelegationFromExtendedKey (toXPub <$> stake1))
        delegationMainnetAccount7 =
            delegationAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> internal7))
                (DelegationFromExtendedKey (toXPub <$> stake7))
        pointerMainnet0 =
            pointerAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> external0))
                (ChainPointer 24157 177 42)
        pointerTestnet0 =
            pointerAddress
                shelleyTestnet
                (PaymentFromExtendedKey (toXPub <$> external0))
                (ChainPointer 1 2 3)
        pointerMainnetAlt =
            pointerAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> internal7))
                (ChainPointer 99 100 101)
        rewardMainnet0 =
            unsafeRight $
                stakeAddress shelleyMainnet (DelegationFromExtendedKey (toXPub <$> stake0))
        rewardTestnet0 =
            unsafeRight $
                stakeAddress shelleyTestnet (DelegationFromExtendedKey (toXPub <$> stake0))
        rewardMainnet7 =
            unsafeRight $
                stakeAddress shelleyMainnet (DelegationFromExtendedKey (toXPub <$> stake7))
        stem = mnemonicStem mnemonicWords
     in [ mkInspectionVector (stem <> "-payment-mainnet") paymentMainnet0
        , mkInspectionVector (stem <> "-payment-testnet") paymentTestnet0
        , mkInspectionVector (stem <> "-payment-custom-3") paymentCustom3
        , mkInspectionVector (stem <> "-payment-custom-6") paymentCustom6
        , mkInspectionVector (stem <> "-change-mainnet") changeMainnet0
        , mkInspectionVector (stem <> "-change-testnet-alt") changeTestnet7
        , mkInspectionVector (stem <> "-delegation-mainnet") delegationMainnet0
        , mkInspectionVector (stem <> "-delegation-testnet") delegationTestnet0
        , mkInspectionVector (stem <> "-delegation-mainnet-alt") delegationMainnet1
        , mkInspectionVector (stem <> "-delegation-mainnet-account7") delegationMainnetAccount7
        , mkInspectionVector (stem <> "-pointer-mainnet") pointerMainnet0
        , mkInspectionVector (stem <> "-pointer-testnet") pointerTestnet0
        , mkInspectionVector (stem <> "-pointer-mainnet-alt") pointerMainnetAlt
        , mkInspectionVector (stem <> "-reward-mainnet") rewardMainnet0
        , mkInspectionVector (stem <> "-reward-testnet") rewardTestnet0
        , mkInspectionVector (stem <> "-reward-mainnet-account7") rewardMainnet7
        ]
            <> legacyInspectionVectorsForMnemonic mnemonicWords

legacyInspectionVectorsForMnemonic :: [Text] -> [InspectionVector]
legacyInspectionVectorsForMnemonic mnemonicWords =
    let stem = mnemonicStem mnemonicWords
        icarusRoot = icarusRootKeyFromMnemonic mnemonicWords
        icarusAccount0 = icarusAccountKey icarusRoot 0
        icarusExternal0 = icarusAddressKey icarusAccount0 Icarus.UTxOExternal 0
        icarusInternal7 = icarusAddressKey icarusAccount0 Icarus.UTxOInternal 7
        byronRoot = byronRootKeyFromMnemonic mnemonicWords
        byronAccount0 = byronAccountKey byronRoot 0
        byronAddress0 = byronAddressKey byronAccount0 0
        byronAddress14 = byronAddressKey byronAccount0 14
     in [ mkIcarusInspectionVector
            (stem <> "-icarus-mainnet")
            (Icarus.paymentAddress Icarus.icarusMainnet (toXPub <$> icarusExternal0))
        , mkIcarusInspectionVector
            (stem <> "-icarus-testnet")
            (Icarus.paymentAddress Icarus.icarusTestnet (toXPub <$> icarusInternal7))
        , mkIcarusInspectionVector
            (stem <> "-icarus-preview")
            (Icarus.paymentAddress Icarus.icarusPreview (toXPub <$> icarusExternal0))
        , mkByronInspectionVector
            (stem <> "-byron-mainnet")
            (Byron.paymentAddress Byron.byronMainnet (toXPub <$> byronAddress0))
        , mkByronInspectionVector
            (stem <> "-byron-testnet")
            (Byron.paymentAddress Byron.byronTestnet (toXPub <$> byronAddress14))
        , mkByronInspectionVector
            (stem <> "-byron-preprod")
            (Byron.paymentAddress Byron.byronPreprod (toXPub <$> byronAddress0))
        ]

scriptHashVectorsForMnemonic :: [Text] -> [ScriptHashVector]
scriptHashVectorsForMnemonic mnemonicWords =
    let rootKey = rootKeyFromMnemonic mnemonicWords
        account0 = accountKey rootKey 0
        external0 = addressKey account0 UTxOExternal 0
        external1 = addressKey account0 UTxOExternal 1
        internal0 = addressKey account0 UTxOInternal 0
        payment0 = hashKey Payment (toXPub <$> external0)
        payment1 = hashKey Payment (toXPub <$> external1)
        paymentInternal = hashKey Payment (toXPub <$> internal0)
        stem = mnemonicStem mnemonicWords
     in [ mkScriptHashVector (stem <> "-script-sig") (RequireSignatureOf payment0)
        , mkScriptHashVector
            (stem <> "-script-all")
            (RequireAllOf [RequireSignatureOf payment0, RequireSignatureOf payment1])
        , mkScriptHashVector
            (stem <> "-script-any-timelock")
            (RequireAnyOf [RequireSignatureOf payment0, ActiveFromSlot 42, ActiveUntilSlot 500])
        , mkScriptHashVector
            (stem <> "-script-some")
            (RequireSomeOf 2 [RequireSignatureOf payment0, RequireSignatureOf payment1, RequireSignatureOf paymentInternal])
        , mkScriptHashVector
            (stem <> "-script-empty-all")
            (RequireAllOf [])
        , mkScriptHashVector
            (stem <> "-script-some-zero")
            (RequireSomeOf 0 [RequireSignatureOf payment0, RequireSignatureOf payment1])
        , mkScriptHashVector
            (stem <> "-script-duplicate-sig")
            (RequireAnyOf [RequireSignatureOf payment0, RequireSignatureOf payment0])
        , mkScriptHashVector
            (stem <> "-script-timelock-trap")
            (RequireAllOf [ActiveFromSlot 500, ActiveUntilSlot 42])
        ]

scriptTemplateVectorsForMnemonic :: [Text] -> [ScriptTemplateVector]
scriptTemplateVectorsForMnemonic mnemonicWords =
    let stem = mnemonicStem mnemonicWords
        sharedRoot = sharedRootKeyFromMnemonic mnemonicWords
        sharedAccount0 = sharedAccountKey sharedRoot 0
        sharedPayment0 = Shared.deriveAddressPublicKey (toXPub <$> sharedAccount0) UTxOExternal (softPaymentIndex 0)
        sharedPayment1 = Shared.deriveAddressPublicKey (toXPub <$> sharedAccount0) UTxOExternal (softPaymentIndex 1)
        sharedPayment2 = Shared.deriveAddressPublicKey (toXPub <$> sharedAccount0) UTxOInternal (softPaymentIndex 0)
        xpub0 = Shared.getKey sharedPayment0
        xpub1 = Shared.getKey sharedPayment1
        xpub2 = Shared.getKey sharedPayment2
        c0 = Cosigner 0
        c1 = Cosigner 1
        c2 = Cosigner 2
        validTemplate =
            ScriptTemplate
                (Map.fromList [(c0, xpub0), (c1, xpub1)])
                (RequireAllOf [RequireSignatureOf c0, RequireAnyOf [RequireSignatureOf c1, ActiveFromSlot 120]])
        someTemplate =
            ScriptTemplate
                (Map.fromList [(c0, xpub0), (c1, xpub1), (c2, xpub2)])
                (RequireSomeOf 2 [RequireSignatureOf c0, RequireSignatureOf c1, RequireSignatureOf c2])
        duplicateXpubTemplate =
            ScriptTemplate
                (Map.fromList [(c0, xpub0), (c1, xpub0)])
                (RequireAllOf [RequireSignatureOf c0, RequireSignatureOf c1])
        missingCosignerTemplate =
            ScriptTemplate
                (Map.fromList [(c0, xpub0)])
                (RequireAllOf [RequireSignatureOf c0, RequireSignatureOf c1])
     in [ mkScriptTemplateVector (stem <> "-template-valid") validTemplate
        , mkScriptTemplateVector (stem <> "-template-some") someTemplate
        , mkScriptTemplateVector (stem <> "-template-duplicate-xpub") duplicateXpubTemplate
        , mkScriptTemplateVector (stem <> "-template-missing-cosigner") missingCosignerTemplate
        ]

bootstrapVectorsForMnemonic :: [Text] -> [BootstrapVector]
bootstrapVectorsForMnemonic mnemonicWords =
    let stem = mnemonicStem mnemonicWords
        customProtocolMagic :: Int
        customProtocolMagic = 4242
        customNetworkTag :: Word32
        customNetworkTag = 4242
        customIcarusDiscriminant :: NetworkDiscriminant Icarus.Icarus
        customIcarusDiscriminant = (RequiresNetworkTag, NetworkTag customNetworkTag)
        customByronDiscriminant :: NetworkDiscriminant Byron.Byron
        customByronDiscriminant = (RequiresNetworkTag, NetworkTag customNetworkTag)
        icarusRoot = icarusRootKeyFromMnemonic mnemonicWords
        icarusAccount0 = icarusAccountKey icarusRoot 0
        icarusExternal0 = icarusAddressKey icarusAccount0 Icarus.UTxOExternal 0
        icarusInternal7 = icarusAddressKey icarusAccount0 Icarus.UTxOInternal 7
        byronRoot = byronRootKeyFromMnemonic mnemonicWords
        byronRootXPub = toXPub <$> byronRoot
        byronAccount0 = byronAccountKey byronRoot 0
        byronAddress0 = byronAddressKey byronAccount0 0
        byronAddress14 = byronAddressKey byronAccount0 14
     in [ mkIcarusBootstrapVector
            (stem <> "-icarus-mainnet-bootstrap")
            "mainnet"
            764824073
            (toXPub <$> icarusExternal0)
            (Icarus.paymentAddress Icarus.icarusMainnet (toXPub <$> icarusExternal0))
        , mkIcarusBootstrapVector
            (stem <> "-icarus-preview-bootstrap")
            "preview"
            2
            (toXPub <$> icarusInternal7)
            (Icarus.paymentAddress Icarus.icarusPreview (toXPub <$> icarusInternal7))
        , mkIcarusBootstrapVector
            (stem <> "-icarus-custom-bootstrap")
            "custom"
            customProtocolMagic
            (toXPub <$> icarusExternal0)
            (Icarus.paymentAddress customIcarusDiscriminant (toXPub <$> icarusExternal0))
        , mkByronBootstrapVector
            (stem <> "-byron-mainnet-bootstrap")
            "mainnet"
            764824073
            byronRootXPub
            (toXPub <$> byronAddress0)
            "0H/0"
            (Byron.paymentAddress Byron.byronMainnet (toXPub <$> byronAddress0))
        , mkByronBootstrapVector
            (stem <> "-byron-testnet-bootstrap")
            "testnet"
            1097911063
            byronRootXPub
            (toXPub <$> byronAddress14)
            "0H/14"
            (Byron.paymentAddress Byron.byronTestnet (toXPub <$> byronAddress14))
        , mkByronBootstrapVector
            (stem <> "-byron-preprod-bootstrap")
            "preprod"
            1
            byronRootXPub
            (toXPub <$> byronAddress0)
            "0H/0"
            (Byron.paymentAddress Byron.byronPreprod (toXPub <$> byronAddress0))
        , mkByronBootstrapVector
            (stem <> "-byron-custom-bootstrap")
            "custom"
            customProtocolMagic
            byronRootXPub
            (toXPub <$> byronAddress14)
            "0H/14"
            (Byron.paymentAddress customByronDiscriminant (toXPub <$> byronAddress14))
        ]

familyRestoreVectorsForMnemonic :: [Text] -> [FamilyRestoreVector]
familyRestoreVectorsForMnemonic mnemonicWords =
    let stem = mnemonicStem mnemonicWords
        customProtocolMagic :: Int
        customProtocolMagic = 4242
        customNetworkTag :: Word32
        customNetworkTag = 4242
        customIcarusDiscriminant :: NetworkDiscriminant Icarus.Icarus
        customIcarusDiscriminant = (RequiresNetworkTag, NetworkTag customNetworkTag)
        customByronDiscriminant :: NetworkDiscriminant Byron.Byron
        customByronDiscriminant = (RequiresNetworkTag, NetworkTag customNetworkTag)
        icarusRoot = icarusRootKeyFromMnemonic mnemonicWords
        icarusAccount0 = icarusAccountKey icarusRoot 0
        icarusAccount1 = icarusAccountKey icarusRoot 1
        byronRoot = byronRootKeyFromMnemonic mnemonicWords
        byronAccount0 = byronAccountKey byronRoot 0
        byronAccount1 = byronAccountKey byronRoot 1
     in [ mkFamilyRestoreVector
            (stem <> "-family-icarus-mainnet")
            "Icarus"
            mnemonicWords
            "mainnet"
            764824073
            0
            (Just "external")
            0
            (Icarus.paymentAddress Icarus.icarusMainnet (toXPub <$> icarusAddressKey icarusAccount0 Icarus.UTxOExternal 0))
        , mkFamilyRestoreVector
            (stem <> "-family-icarus-preview")
            "Icarus"
            mnemonicWords
            "preview"
            2
            0
            (Just "internal")
            7
            (Icarus.paymentAddress Icarus.icarusPreview (toXPub <$> icarusAddressKey icarusAccount0 Icarus.UTxOInternal 7))
        , mkFamilyRestoreVector
            (stem <> "-family-icarus-custom")
            "Icarus"
            mnemonicWords
            "custom"
            customProtocolMagic
            1
            (Just "external")
            3
            (Icarus.paymentAddress customIcarusDiscriminant (toXPub <$> icarusAddressKey icarusAccount1 Icarus.UTxOExternal 3))
        , mkFamilyRestoreVector
            (stem <> "-family-byron-mainnet")
            "Byron"
            mnemonicWords
            "mainnet"
            764824073
            0
            Nothing
            0
            (Byron.paymentAddress Byron.byronMainnet (toXPub <$> byronAddressKey byronAccount0 0))
        , mkFamilyRestoreVector
            (stem <> "-family-byron-preprod")
            "Byron"
            mnemonicWords
            "preprod"
            1
            0
            Nothing
            14
            (Byron.paymentAddress Byron.byronPreprod (toXPub <$> byronAddressKey byronAccount0 14))
        , mkFamilyRestoreVector
            (stem <> "-family-byron-custom")
            "Byron"
            mnemonicWords
            "custom"
            customProtocolMagic
            1
            Nothing
            7
            (Byron.paymentAddress customByronDiscriminant (toXPub <$> byronAddressKey byronAccount1 7))
        ]

shelleyRestoreVectorsForMnemonic :: [Text] -> [ShelleyRestoreVector]
shelleyRestoreVectorsForMnemonic mnemonicWords =
    let stem = mnemonicStem mnemonicWords
        root = rootKeyFromMnemonic mnemonicWords
        account0 = accountKey root 0
        account1 = accountKey root 1
        external0 = addressKey account0 UTxOExternal 0
        internal7 = addressKey account0 UTxOInternal 7
        external1 = addressKey account1 UTxOExternal 1
        stake0 = delegationKey account0
        stake1 = delegationKey account1
        paymentMainnet0 =
            paymentAddress shelleyMainnet (PaymentFromExtendedKey (toXPub <$> external0))
        baseMainnet0 =
            delegationAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> external0))
                (DelegationFromExtendedKey (toXPub <$> stake0))
        rewardMainnet0 =
            unsafeRight $
                stakeAddress shelleyMainnet (DelegationFromExtendedKey (toXPub <$> stake0))
        paymentPreprod0 =
            paymentAddress shelleyTestnet (PaymentFromExtendedKey (toXPub <$> external0))
        basePreprod0 =
            delegationAddress
                shelleyTestnet
                (PaymentFromExtendedKey (toXPub <$> external0))
                (DelegationFromExtendedKey (toXPub <$> stake0))
        rewardPreprod0 =
            unsafeRight $
                stakeAddress shelleyTestnet (DelegationFromExtendedKey (toXPub <$> stake0))
        paymentCustom1 =
            paymentAddress (unsafeNetworkDiscriminant 3) (PaymentFromExtendedKey (toXPub <$> external1))
        baseCustom1 =
            delegationAddress
                (unsafeNetworkDiscriminant 3)
                (PaymentFromExtendedKey (toXPub <$> external1))
                (DelegationFromExtendedKey (toXPub <$> stake1))
        rewardCustom1 =
            unsafeRight $
                stakeAddress (unsafeNetworkDiscriminant 3) (DelegationFromExtendedKey (toXPub <$> stake1))
        paymentChange7 =
            paymentAddress shelleyMainnet (PaymentFromExtendedKey (toXPub <$> internal7))
        baseChange7 =
            delegationAddress
                shelleyMainnet
                (PaymentFromExtendedKey (toXPub <$> internal7))
                (DelegationFromExtendedKey (toXPub <$> stake0))
     in [ mkShelleyRestoreVector
            (stem <> "-shelley-mainnet-external-0")
            mnemonicWords
            "mainnet"
            1
            0
            "external"
            0
            (Just paymentMainnet0)
            (Just baseMainnet0)
            rewardMainnet0
        , mkShelleyRestoreVector
            (stem <> "-shelley-preprod-external-0")
            mnemonicWords
            "preprod"
            0
            0
            "external"
            0
            (Just paymentPreprod0)
            (Just basePreprod0)
            rewardPreprod0
        , mkShelleyRestoreVector
            (stem <> "-shelley-preview-external-0")
            mnemonicWords
            "preview"
            0
            0
            "external"
            0
            (Just paymentPreprod0)
            (Just basePreprod0)
            rewardPreprod0
        , mkShelleyRestoreVector
            (stem <> "-shelley-mainnet-internal-7")
            mnemonicWords
            "mainnet"
            1
            0
            "internal"
            7
            (Just paymentChange7)
            (Just baseChange7)
            rewardMainnet0
        , mkShelleyRestoreVector
            (stem <> "-shelley-mainnet-stake-0")
            mnemonicWords
            "mainnet"
            1
            0
            "stake"
            0
            Nothing
            Nothing
            rewardMainnet0
        , mkShelleyRestoreVector
            (stem <> "-shelley-custom-3-external-1")
            mnemonicWords
            "custom"
            3
            1
            "external"
            1
            (Just paymentCustom1)
            (Just baseCustom1)
            rewardCustom1
        ]

signingVectorsForMnemonic :: [Text] -> [SigningVector]
signingVectorsForMnemonic mnemonicWords =
    let stem = mnemonicStem mnemonicWords
        root = rootKeyFromMnemonic mnemonicWords
        account0 = accountKey root 0
        external0 = addressKey account0 UTxOExternal 0
        stake0 = delegationKey account0
     in [ mkSigningVector
            (stem <> "-sign-root-text")
            "text"
            "cardano-addresses-browser signing test"
            CIP5.root_xsk
            CIP5.root_xvk
            root
        , mkSigningVector
            (stem <> "-sign-account-text")
            "text"
            "account scoped signing"
            CIP5.acct_xsk
            CIP5.acct_xvk
            account0
        , mkSigningVector
            (stem <> "-sign-address-hex")
            "hex"
            "deadbeef00ff11"
            CIP5.addr_xsk
            CIP5.addr_xvk
            external0
        , mkSigningVector
            (stem <> "-sign-stake-text")
            "text"
            "stake credential proof"
            CIP5.stake_xsk
            CIP5.stake_xvk
            stake0
        ]

mkDerivationVector :: [Text] -> Int -> Text -> Int -> DerivationVector
mkDerivationVector mnemonicWords accountIx roleName addressIx =
    let root = rootKeyFromMnemonic mnemonicWords
        account = accountKey root accountIx
        stake = delegationKey account
        expected =
            case roleName of
                "external" ->
                    let derived = addressKey account UTxOExternal addressIx
                     in expectedKeys root account derived stake CIP5.addr_xsk CIP5.addr_xvk
                "internal" ->
                    let derived = addressKey account UTxOInternal addressIx
                     in expectedKeys root account derived stake CIP5.addr_xsk CIP5.addr_xvk
                "stake" ->
                    expectedKeys root account stake stake CIP5.stake_xsk CIP5.stake_xvk
                other ->
                    error ("Unsupported role: " <> show other)
     in DerivationVector
            { label = mnemonicStem mnemonicWords <> "-" <> roleName <> "-" <> toText addressIx
            , mnemonic = mnemonicWords
            , accountIndex = accountIx
            , role = roleName
            , addressIndex = addressIx
            , expected
            }

mkShelleyRestoreVector ::
    Text ->
    [Text] ->
    Text ->
    Int ->
    Int ->
    Text ->
    Int ->
    Maybe Address ->
    Maybe Address ->
    Address ->
    ShelleyRestoreVector
mkShelleyRestoreVector label mnemonicWords network networkTag accountIndex role addressIndex paymentAddress delegationAddress rewardAddress =
    ShelleyRestoreVector
        { label
        , mnemonic = mnemonicWords
        , network
        , networkTag
        , accountIndex
        , role
        , addressIndex
        , paymentAddressBech32 = bech32 <$> paymentAddress
        , delegationAddressBech32 = bech32 <$> delegationAddress
        , rewardAddressBech32 = bech32 rewardAddress
        }

mkSigningVector ::
    Text ->
    Text ->
    Text ->
    Bech32.HumanReadablePart ->
    Bech32.HumanReadablePart ->
    Shelley depth XPrv ->
    SigningVector
mkSigningVector label payloadMode payloadInput signingHrp verificationHrp signingKey =
    let payloadBytes = payloadBytesFor payloadMode payloadInput
        signature = sign (getKey signingKey) payloadBytes
        verificationKey = toXPub <$> signingKey
        isValid = verify (getKey verificationKey) payloadBytes signature
     in if not isValid
            then
                error ("Unexpected signing vector verification failure: " <> show label)
            else
                SigningVector
                    { label
                    , payloadMode
                    , payloadInput
                    , signingKeyBech32 = bech32With signingHrp (xprvAddress signingKey)
                    , verificationKeyBech32 = bech32With verificationHrp (xpubAddress verificationKey)
                    , signatureHex = hexText (BA.convert signature)
                    }

expectedKeys ::
    Shelley depth XPrv ->
    Shelley depth1 XPrv ->
    Shelley depth2 XPrv ->
    Shelley depth3 XPrv ->
    Bech32.HumanReadablePart ->
    Bech32.HumanReadablePart ->
    ExpectedKeys
expectedKeys root account derived stake addrXskHrp addrXvkHrp =
    ExpectedKeys
        { rootKeyBech32 = bech32With CIP5.root_xsk (xprvAddress root)
        , accountKeyBech32 = bech32With CIP5.acct_xsk (xprvAddress account)
        , addressKeyBech32 = bech32With addrXskHrp (xprvAddress derived)
        , addressPublicKeyBech32 = bech32With addrXvkHrp (xpubAddress (toXPub <$> derived))
        , stakeKeyBech32 = bech32With CIP5.stake_xsk (xprvAddress stake)
        , stakePublicKeyBech32 = bech32With CIP5.stake_xvk (xpubAddress (toXPub <$> stake))
        }

mkInspectionVector :: Text -> Address -> InspectionVector
mkInspectionVector label address =
    InspectionVector
        { label
        , address = bech32 address
        , expected = toExpectedAddressInfo (inspectShelleyAddress address)
        }

mkIcarusInspectionVector :: Text -> Address -> InspectionVector
mkIcarusInspectionVector label address =
    let (addressRoot, _, networkTag) = inspectLegacyPayload address
     in InspectionVector
            { label
            , address = base58 address
            , expected =
                ExpectedAddressInfo
                    { addressStyle = "Icarus"
                    , addressType = 8
                    , addressTypeLabel = "Icarus address"
                    , networkTag = legacyNetworkTagValue networkTag
                    , networkTagLabel = legacyNetworkTagLabelFor (legacyNetworkTagValue networkTag)
                    , stakeReference = "none"
                    , spendingKeyHash = Nothing
                    , stakeKeyHash = Nothing
                    , spendingScriptHash = Nothing
                    , stakeScriptHash = Nothing
                    , extraDetails =
                        [ DetailRow
                            { label = "Address root"
                            , value = hexText addressRoot
                            }
                        ]
                    }
            }

mkByronInspectionVector :: Text -> Address -> InspectionVector
mkByronInspectionVector label address =
    let (addressRoot, attrs, networkTag) = inspectLegacyPayload address
        encryptedPath =
            case lookup 1 attrs of
                Just payload -> hexText payload
                Nothing -> error "Expected Byron derivation path attribute"
     in InspectionVector
            { label
            , address = base58 address
            , expected =
                ExpectedAddressInfo
                    { addressStyle = "Byron"
                    , addressType = 8
                    , addressTypeLabel = "Byron address"
                    , networkTag = legacyNetworkTagValue networkTag
                    , networkTagLabel = legacyNetworkTagLabelFor (legacyNetworkTagValue networkTag)
                    , stakeReference = "none"
                    , spendingKeyHash = Nothing
                    , stakeKeyHash = Nothing
                    , spendingScriptHash = Nothing
                    , stakeScriptHash = Nothing
                    , extraDetails =
                        [ DetailRow
                            { label = "Address root"
                            , value = hexText addressRoot
                            }
                        , DetailRow
                            { label = "Encrypted derivation path"
                            , value = encryptedPath
                            }
                        ]
                    }
            }

mkScriptHashVector :: Text -> Script KeyHash -> ScriptHashVector
mkScriptHashVector label script =
    let serialized = serializeScript script
        scriptHash = toScriptHash script
        issues = validationIssues script
     in ScriptHashVector
            { label
            , scriptCborHex = hexText serialized
            , scriptJson = jsonText script
            , expected =
                ExpectedScriptHash
                    { hashHex = scriptHashHex scriptHash
                    , hashBech32 = scriptHashToText scriptHash Policy Nothing
                    , canonicalCborHex = hexText serialized
                    , canonicalJson = jsonText script
                    , scriptType = scriptTypeLabel script
                    , validationStatus =
                        if null issues
                            then
                                "valid"
                            else
                                "warning"
                    , issues
                    }
            }

mkScriptTemplateVector :: Text -> ScriptTemplate -> ScriptTemplateVector
mkScriptTemplateVector label scriptTemplate =
    let issues = templateValidationIssues scriptTemplate
        valid = null issues
     in ScriptTemplateVector
            { label
            , templateJson = jsonText scriptTemplate
            , expected =
                ExpectedScriptTemplate
                    { canonicalTemplateJson = jsonText scriptTemplate
                    , templateValidationStatus =
                        if valid then "valid" else "error"
                    , templateIssues = issues
                    , hasDerivedScript = valid
                    , derivedScript =
                        if valid
                            then expectedScriptHashFromScript (deriveScriptFromTemplate scriptTemplate)
                            else emptyExpectedScriptHash
                    }
            }

expectedScriptHashFromScript :: Script KeyHash -> ExpectedScriptHash
expectedScriptHashFromScript script =
    let serialized = serializeScript script
        scriptHash = toScriptHash script
        issues = validationIssues script
     in ExpectedScriptHash
            { hashHex = scriptHashHex scriptHash
            , hashBech32 = scriptHashToText scriptHash Policy Nothing
            , canonicalCborHex = hexText serialized
            , canonicalJson = jsonText script
            , scriptType = scriptTypeLabel script
            , validationStatus =
                if null issues then "valid" else "warning"
            , issues
            }

emptyExpectedScriptHash :: ExpectedScriptHash
emptyExpectedScriptHash =
    ExpectedScriptHash
        { hashHex = ""
        , hashBech32 = ""
        , canonicalCborHex = ""
        , canonicalJson = ""
        , scriptType = ""
        , validationStatus = "error"
        , issues = []
        }

scriptTypeLabel :: Script elem -> Text
scriptTypeLabel = \case
    RequireSignatureOf _ -> "Signature"
    RequireAllOf _ -> "All"
    RequireAnyOf _ -> "Any"
    RequireSomeOf _ _ -> "At least"
    ActiveFromSlot _ -> "Active from slot"
    ActiveUntilSlot _ -> "Active until slot"

validationIssues :: Script KeyHash -> [ValidationIssue]
validationIssues script =
    case validateScript RequiredValidation script of
        Left err -> [validationIssue "required" err]
        Right () ->
            case validateScript RecommendedValidation script of
                Left err -> [validationIssue "recommended" err]
                Right () -> []

templateValidationIssues :: ScriptTemplate -> [ValidationIssue]
templateValidationIssues scriptTemplate =
    case validateScriptTemplate RequiredValidation scriptTemplate of
        Left err -> [templateValidationIssue err]
        Right () -> []

templateValidationIssue :: ErrValidateScriptTemplate -> ValidationIssue
templateValidationIssue err =
    case err of
        WrongScript scriptErr -> validationIssue "required" scriptErr
        _ ->
            ValidationIssue
                { level = "required"
                , code = templateValidationCode err
                , message = fromString (prettyErrValidateScriptTemplate err)
                }

templateValidationCode :: ErrValidateScriptTemplate -> Text
templateValidationCode = \case
    WrongScript scriptErr -> validationCode scriptErr
    DuplicateXPubs -> "duplicate-xpubs"
    UnknownCosigner -> "unknown-cosigner"
    MissingCosignerXPub -> "missing-cosigner-xpub"
    NoCosignerInScript -> "no-cosigner-in-script"
    NoCosignerXPub -> "no-cosigner-xpub"

deriveScriptFromTemplate :: ScriptTemplate -> Script KeyHash
deriveScriptFromTemplate scriptTemplate =
    let lookupCosigner cosigner =
            case Map.lookup cosigner (cosigners scriptTemplate) of
                Just xpub -> Shared.hashKey PaymentShared (Shared.liftXPub xpub)
                Nothing -> error "Missing cosigner while deriving template script"
        go = \case
            RequireSignatureOf cosigner -> RequireSignatureOf (lookupCosigner cosigner)
            RequireAllOf scripts -> RequireAllOf (map go scripts)
            RequireAnyOf scripts -> RequireAnyOf (map go scripts)
            RequireSomeOf required scripts -> RequireSomeOf required (map go scripts)
            ActiveFromSlot slot -> ActiveFromSlot slot
            ActiveUntilSlot slot -> ActiveUntilSlot slot
     in go (template scriptTemplate)

validationIssue :: Text -> ErrValidateScript -> ValidationIssue
validationIssue level err =
    ValidationIssue
        { level
        , code = validationCode err
        , message = validationMessage err
        }

validationCode :: ErrValidateScript -> Text
validationCode = \case
    Malformed -> "malformed"
    LedgerIncompatible -> "ledger-incompatible"
    WrongKeyHash -> "wrong-key-hash"
    NotUniformKeyType -> "not-uniform-key-type"
    NotRecommended recommended -> recommendedCode recommended

recommendedCode :: ErrRecommendedValidateScript -> Text
recommendedCode = \case
    DuplicateSignatures -> "duplicate-signatures"
    EmptyList -> "empty-list"
    ListTooSmall -> "list-too-small"
    MZero -> "m-zero"
    RedundantTimelocks -> "redundant-timelocks"
    TimelockTrap -> "timelock-trap"

validationMessage :: ErrValidateScript -> Text
validationMessage = \case
    Malformed -> "Script is malformed."
    LedgerIncompatible -> "Script is not ledger-compatible."
    WrongKeyHash -> "Signature script key hash must be 28 bytes."
    NotUniformKeyType -> "Script mixes incompatible key hash types."
    NotRecommended recommended -> recommendedMessage recommended

recommendedMessage :: ErrRecommendedValidateScript -> Text
recommendedMessage = \case
    DuplicateSignatures -> "Script repeats the same signature requirement."
    EmptyList -> "Script list should not be empty."
    ListTooSmall -> "At least threshold exceeds the number of child scripts."
    MZero -> "At least scripts should require at least one branch."
    RedundantTimelocks -> "Script contains redundant timelock constraints."
    TimelockTrap -> "Timelock constraints cannot be satisfied together."

mkIcarusBootstrapVector ::
    Text ->
    Text ->
    Int ->
    Icarus.Icarus 'PaymentK XPub ->
    Address ->
    BootstrapVector
mkIcarusBootstrapVector label network protocolMagic addressXPub expectedAddress =
    BootstrapVector
        { label
        , style = "Icarus"
        , network
        , protocolMagic
        , addressXPubBech32 = bech32With CIP5.addr_xvk (icarusXPubAddress addressXPub)
        , rootXPubBech32 = Nothing
        , derivationPath = Nothing
        , expectedAddressBase58 = base58 expectedAddress
        }

mkByronBootstrapVector ::
    Text ->
    Text ->
    Int ->
    Byron.Byron 'RootK XPub ->
    Byron.Byron 'PaymentK XPub ->
    Text ->
    Address ->
    BootstrapVector
mkByronBootstrapVector label network protocolMagic rootXPub addressXPub derivationPath expectedAddress =
    BootstrapVector
        { label
        , style = "Byron"
        , network
        , protocolMagic
        , addressXPubBech32 = bech32With CIP5.addr_xvk (byronXPubAddress addressXPub)
        , rootXPubBech32 = Just (bech32With CIP5.root_xvk (byronXPubAddress rootXPub))
        , derivationPath = Just derivationPath
        , expectedAddressBase58 = base58 expectedAddress
        }

mkFamilyRestoreVector ::
    Text ->
    Text ->
    [Text] ->
    Text ->
    Int ->
    Int ->
    Maybe Text ->
    Int ->
    Address ->
    FamilyRestoreVector
mkFamilyRestoreVector label style mnemonic network protocolMagic accountIndex role addressIndex expectedAddress =
    FamilyRestoreVector
        { label
        , style
        , mnemonic
        , network
        , protocolMagic
        , accountIndex
        , role
        , addressIndex
        , expectedAddressBase58 = base58 expectedAddress
        }

toExpectedAddressInfo :: AddressInfo -> ExpectedAddressInfo
toExpectedAddressInfo AddressInfo{..} =
    ExpectedAddressInfo
        { addressStyle = "Shelley"
        , addressType = fromIntegral infoAddressType
        , addressTypeLabel = addressTypeLabelFor (fromIntegral infoAddressType)
        , networkTag = networkTagToInt infoNetworkTag
        , networkTagLabel = networkTagLabelFor (networkTagToInt infoNetworkTag)
        , stakeReference =
            case infoStakeReference of
                Just ByValue -> "by value"
                Just (ByPointer _) -> "by pointer"
                Nothing -> "none"
        , spendingKeyHash = fmap hexText infoSpendingKeyHash
        , stakeKeyHash = fmap hexText infoStakeKeyHash
        , spendingScriptHash = fmap hexText infoSpendingScriptHash
        , stakeScriptHash = fmap hexText infoStakeScriptHash
        , extraDetails = []
        }

rootKeyFromMnemonic :: [Text] -> Shelley 'RootK XPrv
rootKeyFromMnemonic mnemonicWords =
    genMasterKeyFromMnemonic (someMnemonic mnemonicWords) mempty

icarusRootKeyFromMnemonic :: [Text] -> Icarus.Icarus 'RootK XPrv
icarusRootKeyFromMnemonic mnemonicWords =
    Icarus.genMasterKeyFromMnemonic (someMnemonic mnemonicWords) mempty

byronRootKeyFromMnemonic :: [Text] -> Byron.Byron 'RootK XPrv
byronRootKeyFromMnemonic mnemonicWords =
    Byron.genMasterKeyFromMnemonic (someMnemonic mnemonicWords)

sharedRootKeyFromMnemonic :: [Text] -> Shared.Shared 'RootK XPrv
sharedRootKeyFromMnemonic mnemonicWords =
    Shared.genMasterKeyFromMnemonic (someMnemonic mnemonicWords) mempty

accountKey :: Shelley 'RootK XPrv -> Int -> Shelley 'AccountK XPrv
accountKey rootKey ix =
    deriveAccountPrivateKey rootKey (hardenedAccountIndex ix)

sharedAccountKey :: Shared.Shared 'RootK XPrv -> Int -> Shared.Shared 'AccountK XPrv
sharedAccountKey rootKey ix =
    Shared.deriveAccountPrivateKey rootKey (hardenedAccountIndex ix)

addressKey ::
    Shelley 'AccountK XPrv ->
    Cardano.Address.Style.Shelley.Role ->
    Int ->
    Shelley 'PaymentK XPrv
addressKey account role ix =
    deriveAddressPrivateKey account role (softPaymentIndex ix)

delegationKey :: Shelley 'AccountK XPrv -> Shelley 'DelegationK XPrv
delegationKey = deriveDelegationPrivateKey

icarusAccountKey :: Icarus.Icarus 'RootK XPrv -> Int -> Icarus.Icarus 'AccountK XPrv
icarusAccountKey rootKey ix =
    Icarus.deriveAccountPrivateKey rootKey (hardenedAccountIndex ix)

icarusAddressKey ::
    Icarus.Icarus 'AccountK XPrv ->
    Icarus.Role ->
    Int ->
    Icarus.Icarus 'PaymentK XPrv
icarusAddressKey account role ix =
    Icarus.deriveAddressPrivateKey account role (softPaymentIndex ix)

byronAccountKey :: Byron.Byron 'RootK XPrv -> Int -> Byron.Byron 'AccountK XPrv
byronAccountKey rootKey ix =
    Byron.deriveAccountPrivateKey rootKey (wholeDomainAccountIndex ix)

byronAddressKey ::
    Byron.Byron 'AccountK XPrv ->
    Int ->
    Byron.Byron 'PaymentK XPrv
byronAddressKey account ix =
    Byron.deriveAddressPrivateKey account (wholeDomainPaymentIndex ix)

inspectShelleyAddress :: Address -> AddressInfo
inspectShelleyAddress address =
    case eitherInspectAddress Nothing address of
        Right (InspectAddressShelley info) -> info
        _ -> error "Expected a Shelley address"

unsafeNetworkDiscriminant :: Integer -> NetworkDiscriminant Shelley
unsafeNetworkDiscriminant tag =
    unsafeRight (mkNetworkDiscriminant tag)

hardenedAccountIndex :: Int -> Index 'Hardened 'AccountK
hardenedAccountIndex ix =
    fromMaybe (error "Invalid hardened index") $
        indexFromWord32 @(Index 'Hardened 'AccountK) (0x80000000 + fromIntegral ix)

softPaymentIndex :: Int -> Index 'Soft 'PaymentK
softPaymentIndex ix =
    fromMaybe (error "Invalid soft index") $
        indexFromWord32 @(Index 'Soft 'PaymentK) (fromIntegral ix)

wholeDomainAccountIndex :: Int -> Index 'WholeDomain 'AccountK
wholeDomainAccountIndex ix =
    fromMaybe (error "Invalid whole-domain account index") $
        indexFromWord32 @(Index 'WholeDomain 'AccountK) (0x80000000 + fromIntegral ix)

wholeDomainPaymentIndex :: Int -> Index 'WholeDomain 'PaymentK
wholeDomainPaymentIndex ix =
    fromMaybe (error "Invalid whole-domain payment index") $
        indexFromWord32 @(Index 'WholeDomain 'PaymentK) (fromIntegral ix)

someMnemonic :: [Text] -> SomeMnemonic
someMnemonic words' =
    case mkSomeMnemonic @'[9, 12, 15, 18, 21, 24] words' of
        Right mnemonic -> mnemonic
        Left err -> error ("Invalid mnemonic fixture: " <> show err)

xprvAddress :: Shelley depth XPrv -> Address
xprvAddress = unsafeMkAddress . xprvToBytes . getKey

xpubAddress :: Shelley depth XPub -> Address
xpubAddress = unsafeMkAddress . xpubToBytes . getKey

icarusXPubAddress :: Icarus.Icarus depth XPub -> Address
icarusXPubAddress = unsafeMkAddress . xpubToBytes . Icarus.getKey

byronXPubAddress :: Byron.Byron depth XPub -> Address
byronXPubAddress = unsafeMkAddress . xpubToBytes . Byron.getKey

scriptHashHex :: ScriptHash -> Text
scriptHashHex (ScriptHash bytes) = hexText bytes

mnemonicStem :: [Text] -> Text
mnemonicStem mnemonicWords =
    case mnemonicWords of
        firstWord : _ -> firstWord
        [] -> "empty"

unsafeRight :: Either err a -> a
unsafeRight = \case
    Right value -> value
    Left _ -> error "Unexpected Left"

inspectLegacyPayload :: Address -> (BS.ByteString, [(Word8, BS.ByteString)], Maybe NetworkTag)
inspectLegacyPayload address =
    let payload =
            unsafeRight $
                CBOR.deserialiseCbor CBOR.decodeAddressPayload (unAddress address)
        networkTag =
            unsafeRight $
                CBOR.deserialiseCbor CBOR.decodeProtocolMagicAttr payload
        (addressRoot, attrs) =
            unsafeRight $
                CBOR.deserialiseCbor decodeLegacyPayload payload
     in (addressRoot, attrs, fmap NetworkTag networkTag)
  where
    decodeLegacyPayload :: forall s. CBORDec.Decoder s (BS.ByteString, [(Word8, BS.ByteString)])
    decodeLegacyPayload = do
        _ <- CBORDec.decodeListLenCanonicalOf 3
        addressRoot <- CBORDec.decodeBytes
        attrs <- CBOR.decodeAllAttributes
        _ <- CBORDec.decodeWord8
        pure (addressRoot, attrs)

legacyNetworkTagValue :: Maybe NetworkTag -> Int
legacyNetworkTagValue = \case
    Nothing -> -1
    Just (NetworkTag value) -> fromIntegral value

legacyNetworkTagLabelFor :: Int -> Text
legacyNetworkTagLabelFor = \case
    n | n < 0 -> "No network tag"
    1 -> "Preprod"
    2 -> "Preview"
    633343913 -> "Legacy staging"
    1097911063 -> "Legacy testnet"
    other -> "Custom legacy network (" <> toText other <> ")"

toText :: Int -> Text
toText = fromString . show

addressTypeLabelFor :: Int -> Text
addressTypeLabelFor value =
    case value of
        0 -> "Base address (key / key)"
        1 -> "Base address (script / key)"
        2 -> "Base address (key / script)"
        3 -> "Base address (script / script)"
        4 -> "Pointer address (key)"
        5 -> "Pointer address (script)"
        6 -> "Enterprise address (key)"
        7 -> "Enterprise address (script)"
        14 -> "Reward address (key)"
        15 -> "Reward address (script)"
        _ -> error ("Unsupported address type: " <> show value)

networkTagLabelFor :: Int -> Text
networkTagLabelFor value =
    case value of
        0 -> "Testnet-compatible (preview / preprod / custom)"
        1 -> "Mainnet"
        _ -> "Custom network (" <> toText value <> ")"

networkTagToInt :: NetworkTag -> Int
networkTagToInt (NetworkTag tag) = fromIntegral tag

payloadBytesFor :: Text -> Text -> BS.ByteString
payloadBytesFor payloadMode payloadInput =
    case payloadMode of
        "text" -> Text.encodeUtf8 payloadInput
        "hex" -> decodeHexText payloadInput
        other -> error ("Unsupported signing payload mode: " <> show other)

decodeHexText :: Text -> BS.ByteString
decodeHexText value
    | odd (Text.length value) = error "Hex payload fixtures must have an even number of characters."
    | otherwise = BS.pack (go (Text.unpack value))
  where
    go [] = []
    go (hi : lo : rest) =
        let byte = fromIntegral ((hexNibble hi `shiftL` 4) + hexNibble lo)
         in byte : go rest
    go _ = error "Unexpected odd-length hex payload."

    hexNibble ch
        | isDigit ch = fromEnum ch - fromEnum '0'
        | 'a' <= ch && ch <= 'f' = 10 + fromEnum ch - fromEnum 'a'
        | 'A' <= ch && ch <= 'F' = 10 + fromEnum ch - fromEnum 'A'
        | otherwise = error ("Invalid hex character in signing fixture: " <> [ch])

hexText :: BS.ByteString -> Text
hexText =
    Text.decodeUtf8
        . Encoding.encode Encoding.EBase16

jsonText :: (ToJSON a) => a -> Text
jsonText =
    Text.decodeUtf8
        . BL.toStrict
        . encode
