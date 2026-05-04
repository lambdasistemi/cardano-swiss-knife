module Cardano.Address.Bootstrap
  ( LegacyStyle(..)
  , LegacyNetwork(..)
  , IcarusRole(..)
  , legacyNetworkLabel
  , parseBootstrapXPub
  , constructIcarusAddress
  , constructByronAddress
  , constructIcarusAddressFromMnemonic
  , constructByronAddressFromMnemonic
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Codec.Bech32.Prefixes as Prefixes
import Control.Promise (Promise, toAffE)
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Aff (Aff)

data LegacyStyle
  = LegacyIcarus
  | LegacyByron

derive instance eqLegacyStyle :: Eq LegacyStyle

data IcarusRole
  = IcarusExternal
  | IcarusInternal

derive instance eqIcarusRole :: Eq IcarusRole

data LegacyNetwork
  = LegacyMainnet
  | LegacyStaging
  | LegacyTestnet
  | LegacyPreview
  | LegacyPreprod
  | LegacyCustom Int

derive instance eqLegacyNetwork :: Eq LegacyNetwork

foreign import constructIcarusAddressImpl
  :: Int
  -> Uint8Array
  -> Effect (Promise String)

foreign import constructByronAddressImpl
  :: Int
  -> Uint8Array
  -> Uint8Array
  -> String
  -> Effect (Promise String)

foreign import constructIcarusAddressFromMnemonicImpl
  :: Int
  -> String
  -> Int
  -> Int
  -> Int
  -> Effect (Promise String)

foreign import constructByronAddressFromMnemonicImpl
  :: Int
  -> String
  -> Int
  -> Int
  -> Effect (Promise String)

parseBootstrapXPub :: String -> Either String Uint8Array
parseBootstrapXPub value = do
  decoded <- Bech32.decode value
  if decoded.hrp == Prefixes.addr_xvk || decoded.hrp == Prefixes.root_xvk then
    Right decoded.bytes
  else
    Left "Expected a bech32 extended public key with addr_xvk or root_xvk prefix."

constructIcarusAddress :: LegacyNetwork -> Uint8Array -> Aff String
constructIcarusAddress network xpub =
  toAffE (constructIcarusAddressImpl (legacyProtocolMagic network) xpub)

constructByronAddress
  :: LegacyNetwork
  -> Uint8Array
  -> Uint8Array
  -> String
  -> Aff String
constructByronAddress network addressXPub rootXPub derivationPath =
  toAffE
    ( constructByronAddressImpl
        (legacyProtocolMagic network)
        addressXPub
        rootXPub
        derivationPath
    )

constructIcarusAddressFromMnemonic
  :: LegacyNetwork
  -> Array String
  -> Int
  -> IcarusRole
  -> Int
  -> Aff String
constructIcarusAddressFromMnemonic network words accountIndex role addressIndex =
  toAffE
    ( constructIcarusAddressFromMnemonicImpl
        (legacyProtocolMagic network)
        (joinMnemonic words)
        accountIndex
        (icarusRoleIndex role)
        addressIndex
    )

constructByronAddressFromMnemonic
  :: LegacyNetwork
  -> Array String
  -> Int
  -> Int
  -> Aff String
constructByronAddressFromMnemonic network words accountIndex addressIndex =
  toAffE
    ( constructByronAddressFromMnemonicImpl
        (legacyProtocolMagic network)
        (joinMnemonic words)
        accountIndex
        addressIndex
    )

legacyProtocolMagic :: LegacyNetwork -> Int
legacyProtocolMagic = case _ of
  LegacyMainnet -> 764824073
  LegacyStaging -> 633343913
  LegacyTestnet -> 1097911063
  LegacyPreview -> 2
  LegacyPreprod -> 1
  LegacyCustom magic -> magic

legacyNetworkLabel :: LegacyNetwork -> String
legacyNetworkLabel = case _ of
  LegacyMainnet -> "Mainnet"
  LegacyStaging -> "Legacy staging"
  LegacyTestnet -> "Legacy testnet"
  LegacyPreview -> "Preview"
  LegacyPreprod -> "Preprod"
  LegacyCustom magic -> "Custom (" <> show magic <> ")"

icarusRoleIndex :: IcarusRole -> Int
icarusRoleIndex = case _ of
  IcarusExternal -> 0
  IcarusInternal -> 1

joinMnemonic :: Array String -> String
joinMnemonic = joinWith " "
