module Cardano.Address.Shelley
  ( ShelleyNetwork(..)
  , ShelleyAddresses
  , constructShelleyAddresses
  , shelleyNetworkLabel
  , shelleyNetworkTag
  ) where

import Prelude

import Cardano.Address (bech32With, unsafeMkAddress)
import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hash (hashCredential, unCredentialHash)
import Cardano.Codec.Bech32.Prefixes as Prefixes
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))

data ShelleyNetwork
  = ShelleyMainnet
  | ShelleyPreprod
  | ShelleyPreview
  | ShelleyCustom Int

derive instance eqShelleyNetwork :: Eq ShelleyNetwork

type ShelleyAddresses =
  { paymentAddressBech32 :: Maybe String
  , delegationAddressBech32 :: Maybe String
  , rewardAddressBech32 :: String
  }

foreign import xpubPublicKeyBytesImpl :: Uint8Array -> Uint8Array

foreign import enterpriseAddressBytesImpl :: Int -> Uint8Array -> Uint8Array

foreign import delegationAddressBytesImpl :: Int -> Uint8Array -> Uint8Array -> Uint8Array

foreign import rewardAddressBytesImpl :: Int -> Uint8Array -> Uint8Array

constructShelleyAddresses :: ShelleyNetwork -> Maybe String -> String -> Either String ShelleyAddresses
constructShelleyAddresses network paymentXPubBech32 stakeXPubBech32 = do
  stakeCredential <- xpubCredentialHash "stake_xvk" stakeXPubBech32
  paymentCredential <- case paymentXPubBech32 of
    Nothing -> pure Nothing
    Just value -> Just <$> xpubCredentialHash "addr_xvk" value
  let
    rewardAddressBech32 =
      bech32With (shelleyAddressPrefix network)
        (unsafeMkAddress (rewardAddressBytesImpl (shelleyNetworkTag network) stakeCredential))
  pure
    { paymentAddressBech32: map (bech32With (shelleyAddressPrefix network) <<< unsafeMkAddress <<< enterpriseAddressBytesImpl (shelleyNetworkTag network)) paymentCredential
    , delegationAddressBech32: map (bech32With (shelleyAddressPrefix network) <<< unsafeMkAddress <<< flip (delegationAddressBytesImpl (shelleyNetworkTag network)) stakeCredential) paymentCredential
    , rewardAddressBech32
    }

xpubCredentialHash :: String -> String -> Either String Uint8Array
xpubCredentialHash expectedHrp value = do
  decoded <- Bech32.decode value
  if decoded.hrp == expectedHrp then
    Right (unCredentialHash (hashCredential (xpubPublicKeyBytesImpl decoded.bytes)))
  else
    Left ("Expected " <> expectedHrp <> " bech32 key, got " <> decoded.hrp <> ".")

shelleyNetworkTag :: ShelleyNetwork -> Int
shelleyNetworkTag = case _ of
  ShelleyMainnet -> 1
  ShelleyPreprod -> 0
  ShelleyPreview -> 0
  ShelleyCustom networkTag -> networkTag

shelleyNetworkLabel :: ShelleyNetwork -> String
shelleyNetworkLabel = case _ of
  ShelleyMainnet -> "Mainnet"
  ShelleyPreprod -> "Preprod"
  ShelleyPreview -> "Preview"
  ShelleyCustom networkTag -> "Custom (" <> show networkTag <> ")"

shelleyAddressPrefix :: ShelleyNetwork -> String
shelleyAddressPrefix network =
  if shelleyNetworkTag network == 0 then
    Prefixes.addr_test
  else
    Prefixes.addr
