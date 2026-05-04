module Cardano.Address.Hash
  ( CredentialHash
  , hashCredential
  , hashCredentialHex
  , unCredentialHash
  ) where

import Prelude

import Cardano.Address.Hex as Hex
import Data.ArrayBuffer.Types (Uint8Array)

newtype CredentialHash = CredentialHash Uint8Array

foreign import blake2b224 :: Uint8Array -> Uint8Array

unCredentialHash :: CredentialHash -> Uint8Array
unCredentialHash (CredentialHash bytes) = bytes

hashCredential :: Uint8Array -> CredentialHash
hashCredential = CredentialHash <<< blake2b224

hashCredentialHex :: Uint8Array -> String
hashCredentialHex = Hex.toHex <<< unCredentialHash <<< hashCredential
