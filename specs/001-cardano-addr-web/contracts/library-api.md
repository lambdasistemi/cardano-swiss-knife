# Library API Contract: cardano-addresses

The `cardano-addresses` PureScript library exposes the following public modules and functions. This is the contract for consumers (including the browser app).

## Cardano.Address

```purescript
-- Core type
newtype Address
unsafeMkAddress :: Uint8Array -> Address
unAddress :: Address -> Uint8Array

-- Encoding
bech32 :: Address -> String
bech32With :: String -> Address -> String
fromBech32 :: String -> Maybe Address
base58 :: Address -> String
fromBase58 :: String -> Maybe Address
```

## Cardano.Address.Style.Shelley

```purescript
-- Network
newtype NetworkTag
shelleyMainnet :: NetworkTag  -- 1
shelleyTestnet :: NetworkTag  -- 0
mkNetworkTag :: Int -> Maybe NetworkTag

-- Credentials
data Credential
  = FromKeyHash CredentialHash
  | FromScriptHash CredentialHash

-- Address construction
paymentAddress :: NetworkTag -> Credential -> Address
delegationAddress :: NetworkTag -> Credential -> Credential -> Address
pointerAddress :: NetworkTag -> Credential -> ChainPointer -> Address
stakeAddress :: NetworkTag -> Credential -> Either String Address
```

## Cardano.Address.Inspect

```purescript
type AddressInfo =
  { addressStyle :: String        -- "Shelley" | "Byron" | "Icarus"
  , addressType :: Int            -- Header nibble
  , networkTag :: Int
  , stakeReference :: String      -- "by value" | "by pointer" | "none"
  , spendingKeyHash :: Maybe String    -- hex
  , stakeKeyHash :: Maybe String       -- hex
  , spendingScriptHash :: Maybe String -- hex
  , stakeScriptHash :: Maybe String    -- hex
  }

inspectAddress :: Address -> Either String AddressInfo
```

## Cardano.Address.Derivation

```purescript
-- Key types (opaque, backed by Uint8Array)
newtype XPrv
newtype XPub
newtype Pub

-- Conversion
toXPub :: XPrv -> XPub
xpubPublicKey :: XPub -> Uint8Array  -- 32 bytes
xpubToPub :: XPub -> Pub

-- Derivation
deriveRootKey :: Array String -> Uint8Array -> XPrv
deriveAccountKey :: XPrv -> Int -> XPrv
deriveAddressKey :: XPrv -> Role -> Int -> XPrv
deriveStakeKey :: XPrv -> XPrv
deriveAddressPublicKey :: XPub -> Role -> Int -> XPub

data Role = UTxOExternal | UTxOInternal | Stake | DRep | CCCold | CCHot
```

## Cardano.Address.Hash

```purescript
hashCredential :: Uint8Array -> CredentialHash  -- Blake2b-224
newtype CredentialHash
unCredentialHash :: CredentialHash -> Uint8Array  -- 28 bytes
```

## Cardano.Mnemonic

```purescript
generateMnemonic :: Int -> Effect (Array String)  -- word count: 9,12,15,18,21,24
validateMnemonic :: Array String -> Boolean
mnemonicToEntropy :: Array String -> Maybe Uint8Array
```

## Cardano.Address.Script

```purescript
data NativeScript
  = ScriptPubkey String          -- key hash hex
  | ScriptAll (Array NativeScript)
  | ScriptAny (Array NativeScript)
  | ScriptNOfK Int (Array NativeScript)
  | TimelockBefore Int
  | TimelockAfter Int

parseScript :: String -> Either String NativeScript
scriptHash :: NativeScript -> CredentialHash
scriptPreimage :: NativeScript -> Uint8Array  -- CBOR bytes
validateScript :: NativeScript -> Either String Unit
```

## Cardano.Address.Bech32

```purescript
encode :: String -> Uint8Array -> String
decode :: String -> Either String { hrp :: String, bytes :: Uint8Array }
```

## Cardano.Codec.Bech32.Prefixes

```purescript
-- CIP-5 human-readable prefixes
addr :: String
addr_test :: String
stake :: String
stake_test :: String
addr_vkh :: String
stake_vkh :: String
script :: String
-- ... (all CIP-5 prefixes)
```
