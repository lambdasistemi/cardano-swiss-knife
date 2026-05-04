module Cardano.Address.ScriptHash
  ( ScriptHashResult
  , hashNativeScript
  , hashNativeScriptHex
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hash (hashCredential, unCredentialHash)
import Cardano.Address.Hex as Hex
import Cardano.Codec.Bech32.Prefixes as Prefixes
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either)

type ScriptHashResult =
  { hashHex :: String
  , hashBech32 :: String
  }

hashNativeScript :: Uint8Array -> ScriptHashResult
hashNativeScript bytes =
  let
    hash = hashCredential bytes
    hashBytes = unCredentialHash hash
  in
    { hashHex: Hex.toHex hashBytes
    , hashBech32: Bech32.encode Prefixes.script hashBytes
    }

hashNativeScriptHex :: String -> Either String ScriptHashResult
hashNativeScriptHex value = do
  bytes <- Hex.fromHex value
  pure (hashNativeScript bytes)
