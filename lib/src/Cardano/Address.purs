module Cardano.Address
  ( Address
  , unsafeMkAddress
  , unAddress
  , bech32
  , bech32With
  , fromBech32
  , base58
  , fromBase58
  ) where

import Cardano.Address.Base58 as Base58
import Cardano.Address.Bech32 as Bech32
import Cardano.Codec.Bech32.Prefixes as Prefixes
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))

newtype Address = Address Uint8Array

unsafeMkAddress :: Uint8Array -> Address
unsafeMkAddress = Address

unAddress :: Address -> Uint8Array
unAddress (Address bytes) = bytes

bech32 :: Address -> String
bech32 = bech32With Prefixes.addr

bech32With :: String -> Address -> String
bech32With hrp (Address bytes) = Bech32.encode hrp bytes

fromBech32 :: String -> Maybe Address
fromBech32 value = case Bech32.decode value of
  Left _ -> Nothing
  Right { bytes } -> Just (Address bytes)

base58 :: Address -> String
base58 (Address bytes) = Base58.encode bytes

fromBase58 :: String -> Maybe Address
fromBase58 value = case Base58.decode value of
  Left _ -> Nothing
  Right bytes -> Just (Address bytes)
