module Cardano.Address.Inspect
  ( AddressInfo
  , DetailRow
  , eitherInspectAddress
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Either (Either(..))
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff)

type DetailRow =
  { label :: String
  , value :: String
  }

type RawAddressInfo =
  { addressStyle :: String
  , addressType :: Int
  , addressTypeLabel :: String
  , networkTag :: Int
  , networkTagLabel :: String
  , stakeReference :: String
  , spendingKeyHash :: Nullable String
  , stakeKeyHash :: Nullable String
  , spendingScriptHash :: Nullable String
  , stakeScriptHash :: Nullable String
  , extraDetails :: Array DetailRow
  }

type AddressInfo =
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

foreign import inspectAddressWasmImpl
  :: (String -> Either String RawAddressInfo)
  -> (RawAddressInfo -> Either String RawAddressInfo)
  -> String
  -> Effect (Promise (Either String RawAddressInfo))

toAddressInfo :: RawAddressInfo -> AddressInfo
toAddressInfo raw =
  { addressStyle: raw.addressStyle
  , addressType: raw.addressType
  , addressTypeLabel: raw.addressTypeLabel
  , networkTag: raw.networkTag
  , networkTagLabel: raw.networkTagLabel
  , stakeReference: raw.stakeReference
  , spendingKeyHash: toMaybe raw.spendingKeyHash
  , stakeKeyHash: toMaybe raw.stakeKeyHash
  , spendingScriptHash: toMaybe raw.spendingScriptHash
  , stakeScriptHash: toMaybe raw.stakeScriptHash
  , extraDetails: raw.extraDetails
  }

eitherInspectAddress :: String -> Aff (Either String AddressInfo)
eitherInspectAddress value = do
  result <- toAffE (inspectAddressWasmImpl Left Right value)
  pure (map toAddressInfo result)
