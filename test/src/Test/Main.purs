module Test.Main where

import Prelude

import Cardano.Address.Bootstrap as Bootstrap
import Cardano.Address.Derivation (Role(..), derivePipeline)
import Cardano.Address.Inspect as Inspect
import Cardano.Address.Inspect (eitherInspectAddress)
import Cardano.Address.Shelley as Shelley
import Cardano.Address.Signing as Signing
import Cardano.Address.Script (analyzeNativeScriptHex, analyzeNativeScriptJson, analyzeScriptTemplateJson)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Traversable (traverse_)
import Effect (Effect)
import Effect.Aff (Aff, launchAff_, try)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Effect.Exception (throw)
import Partial.Unsafe (unsafeCrashWith)
import Test.Vectors (BootstrapVector, DerivationVector, FamilyRestoreVector, InspectionVector, ScriptHashVector, ScriptTemplateVector, ShelleyRestoreVector, SigningVector, bootstrapVectors, derivationVectors, familyRestoreVectors, inspectionVectors, scriptHashVectors, scriptTemplateVectors, shelleyRestoreVectors, signingVectors)

main :: Effect Unit
main = launchAff_ do
  wasmAvailable <- tryWasm
  when wasmAvailable do
    traverse_ assertDerivationVector derivationVectors
    traverse_ assertInspectionVector inspectionVectors
    traverse_ assertBootstrapVector bootstrapVectors
    traverse_ assertFamilyRestoreVector familyRestoreVectors
    traverse_ assertShelleyRestoreVector shelleyRestoreVectors
    traverse_ assertSigningVector signingVectors
  liftEffect (traverse_ assertScriptHashVector scriptHashVectors)
  liftEffect (traverse_ assertScriptTemplateVector scriptTemplateVectors)

tryWasm :: Aff Boolean
tryWasm = do
  result <- try (Inspect.eitherInspectAddress "addr1vyeq0sedsphv9j4u0rlhakrfh5cf3d7mj0zrej92jw44n6c0fpycd")
  case result of
    Right (Right _) -> pure true
    _ -> do
      liftEffect (log "WASM not available, skipping WASM-dependent tests")
      pure false

assertDerivationVector :: DerivationVector -> Aff Unit
assertDerivationVector vector = do
  actual <- derivePipeline vector.mnemonic vector.accountIndex (parseRole vector.role) vector.addressIndex
  when (actual /= vector.expected) do
    liftEffect $
      throw ("Derivation vector mismatch: " <> vector.label)

assertInspectionVector :: InspectionVector -> Aff Unit
assertInspectionVector vector = do
  result <- eitherInspectAddress vector.address
  case result of
    Right actual | actual == vector.expected -> pure unit
    Right _ ->
      liftEffect (throw ("Inspection vector mismatch: " <> vector.label))
    Left err ->
      liftEffect (throw ("Inspection unexpectedly failed for " <> vector.label <> ": " <> err))

parseRole :: String -> Role
parseRole = case _ of
  "external" -> UTxOExternal
  "internal" -> UTxOInternal
  "stake" -> Stake
  other -> unsafeCrashWith ("Unsupported test role: " <> other)

assertBootstrapVector :: BootstrapVector -> Aff Unit
assertBootstrapVector vector = do
  addressXPub <- liftEffect (parseXPub vector.addressXPubBech32)
  actual <- case vector.style of
    "Icarus" ->
      Bootstrap.constructIcarusAddress (parseLegacyNetwork vector.protocolMagic) addressXPub
    "Byron" -> do
      rootXPub <- case vector.rootXPubBech32 of
        Just value -> liftEffect (parseXPub value)
        Nothing -> liftEffect (throw ("Missing root xpub for Byron vector: " <> vector.label))
      derivationPath <- case vector.derivationPath of
        Just value -> pure value
        Nothing -> liftEffect (throw ("Missing derivation path for Byron vector: " <> vector.label))
      Bootstrap.constructByronAddress
        (parseLegacyNetwork vector.protocolMagic)
        addressXPub
        rootXPub
        derivationPath
    other ->
      liftEffect (throw ("Unsupported bootstrap style: " <> other))

  when (actual /= vector.expectedAddressBase58) do
    liftEffect (throw ("Bootstrap vector mismatch: " <> vector.label))

assertFamilyRestoreVector :: FamilyRestoreVector -> Aff Unit
assertFamilyRestoreVector vector = do
  actual <- case vector.style of
    "Icarus" ->
      Bootstrap.constructIcarusAddressFromMnemonic
        (parseLegacyNetwork vector.protocolMagic)
        vector.mnemonic
        vector.accountIndex
        (parseIcarusRole vector.role)
        vector.addressIndex
    "Byron" ->
      Bootstrap.constructByronAddressFromMnemonic
        (parseLegacyNetwork vector.protocolMagic)
        vector.mnemonic
        vector.accountIndex
        vector.addressIndex
    other ->
      liftEffect (throw ("Unsupported family restore style: " <> other))

  when (actual /= vector.expectedAddressBase58) do
    liftEffect (throw ("Family restore vector mismatch: " <> vector.label))

assertShelleyRestoreVector :: ShelleyRestoreVector -> Aff Unit
assertShelleyRestoreVector vector = do
  derivedKeys <- case vector.role of
    "external" -> launchDerivation vector UTxOExternal
    "internal" -> launchDerivation vector UTxOInternal
    "stake" -> launchDerivation vector Stake
    other -> liftEffect (throw ("Unsupported Shelley restore role: " <> other))

  let
    paymentXPub =
      case vector.role of
        "stake" -> Nothing
        _ -> Just derivedKeys.addressPublicKeyBech32

  case
    Shelley.constructShelleyAddresses
      (parseShelleyNetwork vector.networkTag)
      paymentXPub
      derivedKeys.stakePublicKeyBech32
    of
    Right actual | actual == expectedShelleyAddresses vector -> pure unit
    Right _ ->
      liftEffect (throw ("Shelley restore vector mismatch: " <> vector.label))
    Left err ->
      liftEffect (throw ("Shelley restore unexpectedly failed for " <> vector.label <> ": " <> err))

launchDerivation :: ShelleyRestoreVector -> Role -> Aff { rootKeyBech32 :: String, accountKeyBech32 :: String, addressKeyBech32 :: String, addressPublicKeyBech32 :: String, stakeKeyBech32 :: String, stakePublicKeyBech32 :: String }
launchDerivation vector role =
  derivePipeline vector.mnemonic vector.accountIndex role vector.addressIndex

expectedShelleyAddresses :: ShelleyRestoreVector -> Shelley.ShelleyAddresses
expectedShelleyAddresses vector =
  { paymentAddressBech32: vector.paymentAddressBech32
  , delegationAddressBech32: vector.delegationAddressBech32
  , rewardAddressBech32: vector.rewardAddressBech32
  }

parseShelleyNetwork :: Int -> Shelley.ShelleyNetwork
parseShelleyNetwork = case _ of
  1 -> Shelley.ShelleyMainnet
  0 -> Shelley.ShelleyPreprod
  tag -> Shelley.ShelleyCustom tag

parseXPub :: String -> Effect Uint8Array
parseXPub value = case Bootstrap.parseBootstrapXPub value of
  Right parsed -> pure parsed
  Left err -> throw err

parseLegacyNetwork :: Int -> Bootstrap.LegacyNetwork
parseLegacyNetwork = case _ of
  764824073 -> Bootstrap.LegacyMainnet
  633343913 -> Bootstrap.LegacyStaging
  1097911063 -> Bootstrap.LegacyTestnet
  2 -> Bootstrap.LegacyPreview
  1 -> Bootstrap.LegacyPreprod
  magic -> Bootstrap.LegacyCustom magic

parseIcarusRole :: Maybe String -> Bootstrap.IcarusRole
parseIcarusRole = case _ of
  Just "external" -> Bootstrap.IcarusExternal
  Just "internal" -> Bootstrap.IcarusInternal
  Just other -> unsafeCrashWith ("Unsupported Icarus role: " <> other)
  Nothing -> unsafeCrashWith "Missing Icarus role"

assertSigningVector :: SigningVector -> Aff Unit
assertSigningVector vector = do
  signResult <- Signing.signPayload
    (parsePayloadMode vector.payloadMode)
    vector.payloadInput
    vector.signingKeyBech32
  case signResult of
    Right actual | actual.signatureHex == vector.signatureHex && actual.verificationKeyBech32 == vector.verificationKeyBech32 -> do
      verifyResult <- Signing.verifySignature
        (parsePayloadMode vector.payloadMode)
        vector.payloadInput
        vector.verificationKeyBech32
        vector.signatureHex
      case verifyResult of
        Right true -> pure unit
        Right false ->
          liftEffect (throw ("Signing verification returned false for " <> vector.label))
        Left err ->
          liftEffect (throw ("Signing verification failed for " <> vector.label <> ": " <> err))
    Right _ ->
      liftEffect (throw ("Signing vector mismatch: " <> vector.label))
    Left err ->
      liftEffect (throw ("Signing unexpectedly failed for " <> vector.label <> ": " <> err))

parsePayloadMode :: String -> Signing.PayloadMode
parsePayloadMode = case _ of
  "text" -> Signing.PayloadText
  "hex" -> Signing.PayloadHex
  other -> unsafeCrashWith ("Unsupported signing payload mode: " <> other)

assertScriptHashVector :: ScriptHashVector -> Effect Unit
assertScriptHashVector vector = do
  case analyzeNativeScriptHex vector.scriptCborHex of
    Right actual | actual == vector.expected -> pure unit
    Right _ ->
      throw ("Script hash vector mismatch: " <> vector.label)
    Left err ->
      throw ("Script hash unexpectedly failed for " <> vector.label <> ": " <> err)

  case analyzeNativeScriptJson vector.scriptJson of
    Right actual | actual == vector.expected -> pure unit
    Right _ ->
      throw ("Script JSON vector mismatch: " <> vector.label)
    Left err ->
      throw ("Script JSON unexpectedly failed for " <> vector.label <> ": " <> err)

assertScriptTemplateVector :: ScriptTemplateVector -> Effect Unit
assertScriptTemplateVector vector =
  case analyzeScriptTemplateJson vector.templateJson of
    Right actual | actual == vector.expected -> pure unit
    Right _ ->
      throw ("ScriptTemplate vector mismatch: " <> vector.label)
    Left err ->
      throw ("ScriptTemplate unexpectedly failed for " <> vector.label <> ": " <> err)
