module App where

import Prelude

import App.Vault as Vault
import Cardano.Address.Bootstrap as Bootstrap
import Cardano.Address.Derivation as Derivation
import Cardano.Address.Inspect as Inspect
import Cardano.Address.Shelley as Shelley
import Cardano.Address.Signing as Signing
import Cardano.Address.Script as Script
import Cardano.Codec.Bech32.Prefixes as Prefixes
import Cardano.Mnemonic as Mnemonic
import Data.Array (filter, length, mapWithIndex, reverse, uncons)
import Data.Either (Either(..))
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.String as String
import Data.String (joinWith)
import Effect (Effect)
import Effect.Aff (try)
import Effect.Aff.Class (class MonadAff, liftAff)
import Effect.Class (liftEffect)
import Effect.Exception (message)
import Halogen as H
import Halogen.HTML as HH
import Halogen.HTML.Events as HE
import Halogen.HTML.Properties as HP
import TxInspector.Blockfrost as TxBlockfrost
import TxInspector.Inspector as TxInspector
import TxInspector.Json as TxJson
import TxInspector.Provider as TxProvider
import TxInspector.Signing as TxSigning

data Page
  = Overview
  | Inspect
  | Mnemonic
  | Derivation
  | Legacy
  | Signing
  | Transactions
  | Scripts
  | Vault
  | Library

derive instance eqPage :: Eq Page

data RestoreFamily
  = RestoreShelley
  | RestoreIcarus
  | RestoreByron

derive instance eqRestoreFamily :: Eq RestoreFamily

data ScriptInputMode
  = ScriptInputCbor
  | ScriptInputJson
  | ScriptInputTemplate

derive instance eqScriptInputMode :: Eq ScriptInputMode

data TxInputMode
  = TxByHash
  | TxByHex

derive instance eqTxInputMode :: Eq TxInputMode

data Action
  = SelectPage Page
  | SetInspectInput String
  | RunInspect
  | SetMnemonicWordCount Int
  | GenerateMnemonic
  | CopyMnemonic
  | CopyValue String
  | ToggleStatePanel
  | ToggleRestorePhraseVisibility
  | ToggleDerivedKeysVisibility
  | ToggleSigningKeyVisibility
  | SetDerivationInput String
  | UseGeneratedMnemonic
  | SetRestoreFamily RestoreFamily
  | SetShelleyNetwork Shelley.ShelleyNetwork
  | SelectShelleyCustomNetwork
  | SetShelleyCustomNetworkTagInput String
  | SetAccountIndexInput String
  | SetAddressIndexInput String
  | SetDerivationRole Derivation.Role
  | RunDerivation
  | SetLegacyStyle Bootstrap.LegacyStyle
  | SetLegacyNetwork Bootstrap.LegacyNetwork
  | SelectLegacyCustomNetwork
  | SetLegacyAddressXPubInput String
  | SetLegacyRootXPubInput String
  | SetLegacyDerivationPathInput String
  | SetLegacyCustomMagicInput String
  | SetSigningPayloadMode Signing.PayloadMode
  | SetSigningPayloadInput String
  | SetSigningKeyInput String
  | UseSigningResultForVerification
  | SetVerifyPayloadMode Signing.PayloadMode
  | SetVerifyPayloadInput String
  | SetVerificationKeyInput String
  | SetSignatureInput String
  | SetScriptInputMode ScriptInputMode
  | SetScriptInput String
  | SetVaultPassphraseInput String
  | ToggleVaultPassphraseVisibility
  | SetMnemonicVaultLabelInput String
  | SetRestoreVaultLabelInput String
  | SetSigningVaultLabelInput String
  | SetTxVaultLabelInput String
  | SetTxProvider TxProvider.Provider
  | SetTxInputMode TxInputMode
  | SetTxNetwork TxBlockfrost.Network
  | SetTxHashInput String
  | SetTxHexInput String
  | SetTxBlockfrostKey String
  | SetTxKoiosBearer String
  | ToggleTxCredentialVisibility
  | SetTxSigningKeyInput String
  | ToggleTxSigningKeyVisibility
  | RunTxSign
  | RunTxInspect
  | BrowseTxPath String
  | CreateVault
  | ImportVault
  | ExportVault
  | LockVault
  | SaveGeneratedMnemonicToVault
  | SaveRestorePhraseToVault
  | SaveSigningKeyToVault
  | SaveShelleyRootKeyToVault
  | SaveShelleyAccountKeyToVault
  | SaveShelleyAddressKeyToVault
  | SaveShelleyStakeKeyToVault
  | UseVaultEntryInRestore String
  | PopVaultEntryInRestore String
  | UseVaultEntryInSigning String
  | PopVaultEntryInSigning String
  | SaveTxCredentialToVault
  | UseVaultEntryInTransactions String
  | PopVaultEntryInTransactions String
  | DeleteVaultEntry String

type State =
  { activePage :: Page
  , inspectInput :: String
  , inspectResult :: Maybe (Either String Inspect.AddressInfo)
  , mnemonicWordCount :: Int
  , generatedMnemonic :: Maybe (Array String)
  , showStatePanel :: Boolean
  , showRestorePhrase :: Boolean
  , showDerivedKeys :: Boolean
  , showSigningKey :: Boolean
  , derivationInput :: String
  , restoreFamily :: RestoreFamily
  , shelleyNetwork :: Shelley.ShelleyNetwork
  , shelleyCustomNetworkTagInput :: String
  , accountIndexInput :: String
  , addressIndexInput :: String
  , derivationRole :: Derivation.Role
  , previousDerivedKeys :: Maybe Derivation.DerivedKeys
  , derivationResult :: Maybe (Either String Derivation.DerivedKeys)
  , shelleyAddressesResult :: Maybe (Either String Shelley.ShelleyAddresses)
  , familyRestoreResult :: Maybe (Either String String)
  , legacyStyle :: Bootstrap.LegacyStyle
  , legacyNetwork :: Bootstrap.LegacyNetwork
  , legacyAddressXPubInput :: String
  , legacyRootXPubInput :: String
  , legacyDerivationPathInput :: String
  , legacyCustomMagicInput :: String
  , legacyResult :: Maybe (Either String String)
  , signingPayloadMode :: Signing.PayloadMode
  , signingPayloadInput :: String
  , signingKeyInput :: String
  , signingResult :: Maybe (Either String Signing.SignResult)
  , verifyPayloadMode :: Signing.PayloadMode
  , verifyPayloadInput :: String
  , verificationKeyInput :: String
  , signatureInput :: String
  , verificationResult :: Maybe (Either String Boolean)
  , scriptInputMode :: ScriptInputMode
  , scriptInput :: String
  , scriptAnalysisResult :: Maybe (Either String Script.ScriptAnalysis)
  , scriptTemplateAnalysisResult :: Maybe (Either String Script.ScriptTemplateAnalysis)
  , txProvider :: TxProvider.Provider
  , txInputMode :: TxInputMode
  , txNetwork :: TxBlockfrost.Network
  , txHashInput :: String
  , txHexInput :: String
  , txBlockfrostKey :: String
  , txKoiosBearer :: String
  , showTxCredential :: Boolean
  , txRunning :: Boolean
  , txSigningRunning :: Boolean
  , txSigningKeyInput :: String
  , showTxSigningKey :: Boolean
  , txCbor :: Maybe String
  , txInspectResult :: Maybe TxInspector.InspectorResult
  , txIdentification :: Maybe TxJson.Identification
  , txIntentSummary :: Maybe TxJson.IntentSummary
  , txWitnessPlan :: Maybe TxJson.WitnessPlan
  , txBrowser :: Maybe TxJson.Browser
  , txErrorMessage :: Maybe String
  , txSigningResult :: Maybe (Either String TxSigning.WitnessMaterial)
  , vaultPassphraseInput :: String
  , showVaultPassphrase :: Boolean
  , mnemonicVaultLabelInput :: String
  , restoreVaultLabelInput :: String
  , signingVaultLabelInput :: String
  , txVaultLabelInput :: String
  , vaultUnlocked :: Boolean
  , vaultEntries :: Array Vault.VaultEntry
  , vaultDirty :: Boolean
  , vaultStatusMessage :: Maybe String
  , vaultErrorMessage :: Maybe String
  }

initialState :: State
initialState =
  { activePage: Overview
  , inspectInput: ""
  , inspectResult: Nothing
  , mnemonicWordCount: 24
  , generatedMnemonic: Nothing
  , showStatePanel: false
  , showRestorePhrase: false
  , showDerivedKeys: false
  , showSigningKey: false
  , derivationInput: ""
  , restoreFamily: RestoreShelley
  , shelleyNetwork: Shelley.ShelleyMainnet
  , shelleyCustomNetworkTagInput: "3"
  , accountIndexInput: "0"
  , addressIndexInput: "0"
  , derivationRole: Derivation.UTxOExternal
  , previousDerivedKeys: Nothing
  , derivationResult: Nothing
  , shelleyAddressesResult: Nothing
  , familyRestoreResult: Nothing
  , legacyStyle: Bootstrap.LegacyIcarus
  , legacyNetwork: Bootstrap.LegacyMainnet
  , legacyAddressXPubInput: ""
  , legacyRootXPubInput: ""
  , legacyDerivationPathInput: "0H/0"
  , legacyCustomMagicInput: "4242"
  , legacyResult: Nothing
  , signingPayloadMode: Signing.PayloadText
  , signingPayloadInput: ""
  , signingKeyInput: ""
  , signingResult: Nothing
  , verifyPayloadMode: Signing.PayloadText
  , verifyPayloadInput: ""
  , verificationKeyInput: ""
  , signatureInput: ""
  , verificationResult: Nothing
  , scriptInputMode: ScriptInputCbor
  , scriptInput: ""
  , scriptAnalysisResult: Nothing
  , scriptTemplateAnalysisResult: Nothing
  , txProvider: TxProvider.Blockfrost
  , txInputMode: TxByHash
  , txNetwork: TxBlockfrost.Mainnet
  , txHashInput: ""
  , txHexInput: ""
  , txBlockfrostKey: ""
  , txKoiosBearer: ""
  , showTxCredential: false
  , txRunning: false
  , txSigningRunning: false
  , txSigningKeyInput: ""
  , showTxSigningKey: false
  , txCbor: Nothing
  , txInspectResult: Nothing
  , txIdentification: Nothing
  , txIntentSummary: Nothing
  , txWitnessPlan: Nothing
  , txBrowser: Nothing
  , txErrorMessage: Nothing
  , txSigningResult: Nothing
  , vaultPassphraseInput: ""
  , showVaultPassphrase: false
  , mnemonicVaultLabelInput: ""
  , restoreVaultLabelInput: ""
  , signingVaultLabelInput: ""
  , txVaultLabelInput: ""
  , vaultUnlocked: false
  , vaultEntries: []
  , vaultDirty: false
  , vaultStatusMessage: Nothing
  , vaultErrorMessage: Nothing
  }

component :: forall query input output monad. MonadAff monad => H.Component query input output monad
component =
  H.mkComponent
    { initialState: const initialState
    , render
    , eval: H.mkEval H.defaultEval { handleAction = handleAction }
    }

foreign import copyToClipboard :: String -> Effect Unit
foreign import normalizeMnemonicInput :: String -> Array String
foreign import normalizeHexInput :: String -> String
foreign import parseIndexInput :: String -> Int

handleAction :: forall output monad. MonadAff monad => Action -> H.HalogenM State Action () output monad Unit
handleAction = case _ of
  SelectPage page ->
    H.modify_ _ { activePage = page }
  SetInspectInput value ->
    H.modify_ _ { inspectInput = value, inspectResult = Nothing }
  RunInspect -> do
    state <- H.get
    if state.inspectInput == "" then
      H.modify_ _ { inspectResult = Just (Left "Paste a Cardano address to inspect.") }
    else do
      outcome <- H.liftAff (try (Inspect.eitherInspectAddress state.inspectInput))
      H.modify_ _
        { inspectResult = Just case outcome of
            Right result -> result
            Left err -> Left (message err)
        }
  SetMnemonicWordCount value ->
    H.modify_ _ { mnemonicWordCount = value }
  GenerateMnemonic -> do
    state <- H.get
    words <- liftEffect (Mnemonic.generateMnemonic state.mnemonicWordCount)
    H.modify_ _
      { generatedMnemonic = Just words
      }
  CopyMnemonic -> do
    state <- H.get
    let
      normalizedPhrase = case state.generatedMnemonic of
        Nothing -> ""
        Just words -> joinWith " " words
    if normalizedPhrase == "" then
      pure unit
    else
      liftEffect (copyToClipboard normalizedPhrase)
  CopyValue value ->
    liftEffect (copyToClipboard value)
  ToggleStatePanel ->
    H.modify_ \state -> state { showStatePanel = not state.showStatePanel }
  ToggleRestorePhraseVisibility ->
    H.modify_ \state -> state { showRestorePhrase = not state.showRestorePhrase }
  ToggleDerivedKeysVisibility ->
    H.modify_ \state -> state { showDerivedKeys = not state.showDerivedKeys }
  ToggleSigningKeyVisibility ->
    H.modify_ \state -> state { showSigningKey = not state.showSigningKey }
  SetShelleyNetwork network ->
    H.modify_ _ { shelleyNetwork = network }
      *> refreshDerivation
  SelectShelleyCustomNetwork -> do
    state <- H.get
    let
      nextNetwork = case parseShelleyCustomNetworkTag state.shelleyCustomNetworkTagInput of
        Right networkTag -> Shelley.ShelleyCustom networkTag
        Left _ -> Shelley.ShelleyCustom 3
    H.modify_ _ { shelleyNetwork = nextNetwork }
      *> refreshDerivation
  SetShelleyCustomNetworkTagInput value -> do
    state <- H.get
    let
      nextNetwork =
        if isShelleyCustomNetwork state.shelleyNetwork then
          case parseShelleyCustomNetworkTag value of
            Right networkTag -> Shelley.ShelleyCustom networkTag
            Left _ -> state.shelleyNetwork
        else
          state.shelleyNetwork
    H.modify_ _ { shelleyCustomNetworkTagInput = value, shelleyNetwork = nextNetwork }
      *> refreshDerivation
  SetDerivationInput value ->
    H.modify_ _ { derivationInput = value }
      *> refreshDerivation
  UseGeneratedMnemonic -> do
    state <- H.get
    case state.generatedMnemonic of
      Nothing -> pure unit
      Just words ->
        H.modify_ _
          { derivationInput = joinWith " " words
          }
          *> refreshDerivation
  SetRestoreFamily family -> do
    state <- H.get
    H.modify_ _ { restoreFamily = family, derivationRole = normalizeRoleForFamily family state.derivationRole }
      *> refreshDerivation
  SetAccountIndexInput value ->
    H.modify_ _ { accountIndexInput = normalizeIndexInput value }
      *> refreshDerivation
  SetAddressIndexInput value ->
    H.modify_ _ { addressIndexInput = normalizeIndexInput value }
      *> refreshDerivation
  SetDerivationRole role ->
    H.modify_ _ { derivationRole = role }
      *> refreshDerivation
  RunDerivation ->
    refreshDerivation
  SetLegacyStyle style ->
    H.modify_ _ { legacyStyle = style }
      *> refreshLegacyConstruction
  SetLegacyNetwork network ->
    H.modify_ _ { legacyNetwork = network }
      *> refreshDerivation
      *> refreshLegacyConstruction
  SelectLegacyCustomNetwork -> do
    state <- H.get
    let
      nextNetwork = case parseLegacyCustomMagic state.legacyCustomMagicInput of
        Right magic -> Bootstrap.LegacyCustom magic
        Left _ -> Bootstrap.LegacyCustom 4242
    H.modify_ _ { legacyNetwork = nextNetwork }
      *> refreshDerivation
      *> refreshLegacyConstruction
  SetLegacyAddressXPubInput value ->
    H.modify_ _ { legacyAddressXPubInput = value }
      *> refreshLegacyConstruction
  SetLegacyRootXPubInput value ->
    H.modify_ _ { legacyRootXPubInput = value }
      *> refreshLegacyConstruction
  SetLegacyDerivationPathInput value ->
    H.modify_ _ { legacyDerivationPathInput = value }
      *> refreshLegacyConstruction
  SetLegacyCustomMagicInput value -> do
    state <- H.get
    let
      nextNetwork =
        if isLegacyCustomNetwork state.legacyNetwork then
          case parseLegacyCustomMagic value of
            Right magic -> Bootstrap.LegacyCustom magic
            Left _ -> state.legacyNetwork
        else
          state.legacyNetwork
    H.modify_ _ { legacyCustomMagicInput = value, legacyNetwork = nextNetwork }
      *> refreshDerivation
      *> refreshLegacyConstruction
  SetSigningPayloadMode mode ->
    H.modify_ _ { signingPayloadMode = mode }
      *> refreshSigning
  SetSigningPayloadInput value ->
    H.modify_ _ { signingPayloadInput = value }
      *> refreshSigning
  SetSigningKeyInput value ->
    H.modify_ _ { signingKeyInput = value }
      *> refreshSigning
  UseSigningResultForVerification -> do
    state <- H.get
    case state.signingResult of
      Just (Right result) ->
        H.modify_ _
          { verifyPayloadMode = state.signingPayloadMode
          , verifyPayloadInput = state.signingPayloadInput
          , verificationKeyInput = result.verificationKeyBech32
          , signatureInput = result.signatureHex
          }
          *> refreshVerification
      _ ->
        pure unit
  SetVerifyPayloadMode mode ->
    H.modify_ _ { verifyPayloadMode = mode }
      *> refreshVerification
  SetVerifyPayloadInput value ->
    H.modify_ _ { verifyPayloadInput = value }
      *> refreshVerification
  SetVerificationKeyInput value ->
    H.modify_ _ { verificationKeyInput = value }
      *> refreshVerification
  SetSignatureInput value ->
    H.modify_ _ { signatureInput = value }
      *> refreshVerification
  SetScriptInputMode mode -> do
    state <- H.get
    H.modify_ _
      { scriptInputMode = mode
      , scriptAnalysisResult = scriptAnalysisStatus mode state.scriptInput
      , scriptTemplateAnalysisResult = scriptTemplateAnalysisStatus mode state.scriptInput
      }
  SetScriptInput value ->
    H.modify_ \state ->
      state
        { scriptInput = value
        , scriptAnalysisResult = scriptAnalysisStatus state.scriptInputMode value
        , scriptTemplateAnalysisResult = scriptTemplateAnalysisStatus state.scriptInputMode value
        }
  SetTxProvider provider ->
    H.modify_ \state -> resetTxInspectorState (state { txProvider = provider })
  SetTxInputMode mode ->
    H.modify_ \state -> resetTxInspectorState (state { txInputMode = mode })
  SetTxNetwork network ->
    H.modify_ \state -> resetTxInspectorState (state { txNetwork = network })
  SetTxHashInput value ->
    H.modify_ \state -> resetTxInspectorState (state { txHashInput = value })
  SetTxHexInput value ->
    H.modify_ \state -> resetTxInspectorState (state { txHexInput = value })
  SetTxBlockfrostKey value ->
    H.modify_ \state -> resetTxInspectorState (state { txBlockfrostKey = value })
  SetTxKoiosBearer value ->
    H.modify_ \state -> resetTxInspectorState (state { txKoiosBearer = value })
  ToggleTxCredentialVisibility ->
    H.modify_ \state -> state { showTxCredential = not state.showTxCredential }
  SetTxSigningKeyInput value ->
    H.modify_ _ { txSigningKeyInput = value, txSigningResult = Nothing }
  ToggleTxSigningKeyVisibility ->
    H.modify_ \state -> state { showTxSigningKey = not state.showTxSigningKey }
  RunTxInspect -> do
    state <- H.get
    let
      txHash = String.trim state.txHashInput
      txHex = normalizeHexInput state.txHexInput
      credential = txProviderCredential state
    case state.txInputMode of
      TxByHash | txHash == "" ->
        H.modify_ \st -> resetTxInspectorState (st { txErrorMessage = Just "Paste a transaction hash to inspect." })
      TxByHash | state.txProvider == TxProvider.Blockfrost && String.trim credential == "" ->
        H.modify_ \st -> resetTxInspectorState (st { txErrorMessage = Just "Enter a Blockfrost project ID before fetching a transaction." })
      TxByHex | txHex == "" ->
        H.modify_ \st -> resetTxInspectorState (st { txErrorMessage = Just "Paste transaction CBOR hex to inspect." })
      _ -> do
        H.modify_ \st ->
          st
            { txRunning = true
            , txErrorMessage = Nothing
            , txCbor = Nothing
            , txInspectResult = Nothing
            , txIdentification = Nothing
            , txIntentSummary = Nothing
            , txWitnessPlan = Nothing
            , txBrowser = Nothing
            }
        outcome <- H.liftAff
          ( try do
              txCbor <- case state.txInputMode of
                TxByHash ->
                  TxProvider.fetchTxCbor state.txProvider state.txNetwork credential txHash
                TxByHex ->
                  pure txHex
              inspectResult <- TxInspector.runLedgerOperation txCbor "tx.inspect" "{}"
              identifyResult <- TxInspector.runLedgerOperation txCbor "tx.identify" "{}"
              intentResult <- TxInspector.runLedgerOperation txCbor "tx.intent" "{}"
              witnessPlanResult <- TxInspector.runLedgerOperation txCbor "tx.witness.plan" "{}"
              pure
                { txCbor
                , inspectResult
                , identification: TxJson.operationIdentification identifyResult.stdout
                , intentSummary: TxJson.operationIntentSummary intentResult.stdout
                , witnessPlan: TxJson.operationWitnessPlan witnessPlanResult.stdout
                , browser: TxJson.operationBrowser inspectResult.stdout
                }
          )
        case outcome of
          Left err ->
            H.modify_ _
              { txRunning = false
              , txErrorMessage = Just ("Transaction inspection failed: " <> message err)
              }
          Right result ->
            H.modify_ _
              { txRunning = false
              , txCbor = Just result.txCbor
              , txInspectResult = Just result.inspectResult
              , txIdentification =
                  if result.identification.valid then Just result.identification else Nothing
              , txIntentSummary =
                  if result.intentSummary.valid then Just result.intentSummary else Nothing
              , txWitnessPlan =
                  if result.witnessPlan.valid then Just result.witnessPlan else Nothing
              , txBrowser =
                  if result.browser.valid then Just result.browser else Nothing
              , txErrorMessage =
                  if result.inspectResult.exitOk then Nothing
                  else Just
                    (if result.inspectResult.stderr == "" then "Ledger inspector returned no structured output." else result.inspectResult.stderr)
              }
  RunTxSign -> do
    state <- H.get
    case txBodyHash state of
      Nothing ->
        H.modify_ _
          { txSigningRunning = false
          , txSigningResult = Just (Left "Inspect a transaction first to derive its body hash.")
          }
      Just bodyHashHex ->
        if String.trim state.txSigningKeyInput == "" then
          H.modify_ _
            { txSigningRunning = false
            , txSigningResult = Just (Left "Paste an extended signing key to produce witness material.")
            }
        else do
          case state.txCbor of
            Nothing ->
              H.modify_ _
                { txSigningRunning = false
                , txSigningResult = Just (Left "Inspect a transaction first to load its CBOR.")
                }
            Just txCbor -> do
              H.modify_ _ { txSigningRunning = true, txSigningResult = Nothing }
              result <- H.liftAff (TxSigning.signTransaction txCbor bodyHashHex state.txSigningKeyInput)
              H.modify_ _
                { txSigningRunning = false
                , txSigningResult = Just result
                }
  BrowseTxPath path -> do
    state <- H.get
    case state.txCbor of
      Nothing ->
        pure unit
      Just txCbor -> do
        H.modify_ _ { txRunning = true, txErrorMessage = Nothing }
        operationResult <- H.liftAff
          (TxInspector.runLedgerOperation txCbor "tx.browse" (TxJson.operationArgsWithPath "{}" path))
        let
          browser = TxJson.operationBrowser operationResult.stdout
        H.modify_ _
          { txRunning = false
          , txBrowser =
              if operationResult.exitOk && browser.valid then Just browser else state.txBrowser
          , txErrorMessage =
              if operationResult.exitOk && browser.valid then Nothing
              else Just
                (if operationResult.stderr == "" then "Transaction browse failed." else operationResult.stderr)
          }
  SetVaultPassphraseInput value ->
    H.modify_ _ { vaultPassphraseInput = value, vaultErrorMessage = Nothing, vaultStatusMessage = Nothing }
  ToggleVaultPassphraseVisibility ->
    H.modify_ \state -> state { showVaultPassphrase = not state.showVaultPassphrase }
  SetMnemonicVaultLabelInput value ->
    H.modify_ _ { mnemonicVaultLabelInput = value, vaultErrorMessage = Nothing, vaultStatusMessage = Nothing }
  SetRestoreVaultLabelInput value ->
    H.modify_ _ { restoreVaultLabelInput = value, vaultErrorMessage = Nothing, vaultStatusMessage = Nothing }
  SetSigningVaultLabelInput value ->
    H.modify_ _ { signingVaultLabelInput = value, vaultErrorMessage = Nothing, vaultStatusMessage = Nothing }
  SetTxVaultLabelInput value ->
    H.modify_ _ { txVaultLabelInput = value, vaultErrorMessage = Nothing, vaultStatusMessage = Nothing }
  CreateVault -> do
    state <- H.get
    if String.trim state.vaultPassphraseInput == "" then
      H.modify_ _ { vaultErrorMessage = Just "Enter a vault passphrase before creating a vault.", vaultStatusMessage = Nothing }
    else do
      let
        fileName = defaultVaultFileName
      result <- liftAff (try (Vault.createVaultFile fileName state.vaultPassphraseInput []))
      case result of
        Left err ->
          H.modify_ _ { vaultErrorMessage = Just ("Vault creation failed: " <> message err), vaultStatusMessage = Nothing }
        Right persistedFileName ->
          H.modify_ _
            { vaultUnlocked = true
            , vaultEntries = []
            , vaultDirty = false
            , vaultErrorMessage = Nothing
            , vaultStatusMessage = Just ("Created encrypted vault " <> persistedFileName <> ".")
            }
  ImportVault -> do
    state <- H.get
    if String.trim state.vaultPassphraseInput == "" then
      H.modify_ _ { vaultErrorMessage = Just "Enter the vault passphrase before importing a vault file.", vaultStatusMessage = Nothing }
    else do
      result <- liftAff (try (Vault.importVaultFile state.vaultPassphraseInput))
      case result of
        Left err ->
          H.modify_ _ { vaultErrorMessage = Just ("Vault import failed: " <> message err), vaultStatusMessage = Nothing }
        Right imported ->
          if imported.canceled then
            H.modify_ _ { vaultErrorMessage = Nothing, vaultStatusMessage = Just "Vault import canceled." }
          else
            H.modify_ _
              { vaultUnlocked = true
              , vaultEntries = imported.entries
              , vaultDirty = false
              , vaultErrorMessage = Nothing
              , vaultStatusMessage = Just ("Opened encrypted vault " <> imported.fileName <> ".")
              }
  ExportVault -> do
    state <- H.get
    if not state.vaultUnlocked then
      H.modify_ _ { vaultErrorMessage = Just "Create or open the vault before downloading a backup.", vaultStatusMessage = Nothing }
    else if String.trim state.vaultPassphraseInput == "" then
      H.modify_ _ { vaultErrorMessage = Just "Enter the vault passphrase before downloading the encrypted backup.", vaultStatusMessage = Nothing }
    else do
      let
        fileName = defaultVaultFileName
      result <- liftAff (try (Vault.exportVaultFile fileName state.vaultPassphraseInput state.vaultEntries))
      case result of
        Left err ->
          H.modify_ _ { vaultErrorMessage = Just ("Vault export failed: " <> message err), vaultStatusMessage = Nothing }
        Right _ ->
          H.modify_ _
            { vaultDirty = false
            , vaultErrorMessage = Nothing
            , vaultStatusMessage = Just ("Downloaded encrypted vault backup " <> fileName <> ".")
            }
  LockVault ->
    H.modify_ _
      { vaultUnlocked = false
      , vaultEntries = []
      , vaultDirty = false
      , vaultErrorMessage = Nothing
      , vaultStatusMessage = Just "Vault locked. Decrypted entries were cleared from memory."
      }
  SaveGeneratedMnemonicToVault -> do
    state <- H.get
    case state.generatedMnemonic of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Generate a mnemonic before saving it to the vault.", vaultStatusMessage = Nothing }
      Just words ->
        saveVaultEntry
          Vault.VaultMnemonic
          (normalizedEntryLabel state.mnemonicVaultLabelInput (show (length words) <> "-word mnemonic"))
          (joinWith " " words)
  SaveRestorePhraseToVault -> do
    state <- H.get
    let
      phrase = joinWith " " (normalizeMnemonicInput state.derivationInput)
    if phrase == "" then
      H.modify_ _ { vaultErrorMessage = Just "Paste or hand off a recovery phrase before saving it to the vault.", vaultStatusMessage = Nothing }
    else
      saveVaultEntry
        Vault.VaultMnemonic
        (normalizedEntryLabel state.restoreVaultLabelInput (restoreFamilyLabel state.restoreFamily <> " restore phrase"))
        phrase
  SaveSigningKeyToVault -> do
    state <- H.get
    let
      key = String.trim state.signingKeyInput
    if key == "" then
      H.modify_ _ { vaultErrorMessage = Just "Paste a signing key before saving it to the vault.", vaultStatusMessage = Nothing }
    else
      saveVaultEntry Vault.VaultSigningKey (normalizedEntryLabel state.signingVaultLabelInput "Signing key") key
  SaveShelleyRootKeyToVault -> do
    state <- H.get
    case state.derivationResult of
      Just (Right keys) ->
        saveVaultEntry Vault.VaultRootPrivateKey (shelleyRootKeyLabel state) keys.rootKeyBech32
      _ ->
        H.modify_ _ { vaultErrorMessage = Just "Derive Shelley keys before saving the root key to the vault.", vaultStatusMessage = Nothing }
  SaveShelleyAccountKeyToVault -> do
    state <- H.get
    case state.derivationResult of
      Just (Right keys) ->
        saveVaultEntry Vault.VaultAccountPrivateKey (shelleyAccountKeyLabel state) keys.accountKeyBech32
      _ ->
        H.modify_ _ { vaultErrorMessage = Just "Derive Shelley keys before saving the account key to the vault.", vaultStatusMessage = Nothing }
  SaveShelleyAddressKeyToVault -> do
    state <- H.get
    case state.derivationResult of
      Just (Right keys) ->
        saveVaultEntry Vault.VaultAddressPrivateKey (shelleyAddressKeyLabel state) keys.addressKeyBech32
      _ ->
        H.modify_ _ { vaultErrorMessage = Just "Derive Shelley keys before saving the address key to the vault.", vaultStatusMessage = Nothing }
  SaveShelleyStakeKeyToVault -> do
    state <- H.get
    case state.derivationResult of
      Just (Right keys) ->
        saveVaultEntry Vault.VaultStakePrivateKey (shelleyStakeKeyLabel state) keys.stakeKeyBech32
      _ ->
        H.modify_ _ { vaultErrorMessage = Just "Derive Shelley keys before saving the stake key to the vault.", vaultStatusMessage = Nothing }
  UseVaultEntryInRestore entryId -> do
    state <- H.get
    case lookupVaultEntry entryId state.vaultEntries of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Selected vault entry was not found.", vaultStatusMessage = Nothing }
      Just entry ->
        if not (acceptsVaultEntry restoreAcceptedKinds entry) then
          H.modify_ _ { vaultErrorMessage = Just "Selected vault entry is not compatible with Restore.", vaultStatusMessage = Nothing }
        else
          H.modify_ _ { derivationInput = entry.value, vaultErrorMessage = Nothing, vaultStatusMessage = Just ("Loaded " <> entry.label <> " into Restore.") }
            *> refreshDerivation
  PopVaultEntryInRestore entryId -> do
    state <- H.get
    case lookupVaultEntry entryId state.vaultEntries of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Selected vault entry was not found.", vaultStatusMessage = Nothing }
      Just entry -> do
        if not (acceptsVaultEntry restoreAcceptedKinds entry) then
          H.modify_ _ { vaultErrorMessage = Just "Selected vault entry is not compatible with Restore.", vaultStatusMessage = Nothing }
        else do
          let
            nextEntries = filter (\candidate -> candidate.id /= entryId) state.vaultEntries
          persistVaultEntries nextEntries ("Popped " <> entry.label <> " from the vault stack.")
          H.modify_ _ { derivationInput = entry.value }
          refreshDerivation
  UseVaultEntryInSigning entryId -> do
    state <- H.get
    case lookupVaultEntry entryId state.vaultEntries of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Selected vault entry was not found.", vaultStatusMessage = Nothing }
      Just entry ->
        if not (acceptsVaultEntry signingAcceptedKinds entry) then
          H.modify_ _ { vaultErrorMessage = Just "Selected vault entry is not compatible with Signing.", vaultStatusMessage = Nothing }
        else
          H.modify_ _ { signingKeyInput = entry.value, vaultErrorMessage = Nothing, vaultStatusMessage = Just ("Loaded " <> entry.label <> " into Signing.") }
            *> refreshSigning
  PopVaultEntryInSigning entryId -> do
    state <- H.get
    case lookupVaultEntry entryId state.vaultEntries of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Selected vault entry was not found.", vaultStatusMessage = Nothing }
      Just entry -> do
        if not (acceptsVaultEntry signingAcceptedKinds entry) then
          H.modify_ _ { vaultErrorMessage = Just "Selected vault entry is not compatible with Signing.", vaultStatusMessage = Nothing }
        else do
          let
            nextEntries = filter (\candidate -> candidate.id /= entryId) state.vaultEntries
          persistVaultEntries nextEntries ("Popped " <> entry.label <> " from the vault stack.")
          H.modify_ _ { signingKeyInput = entry.value }
          refreshSigning
  SaveTxCredentialToVault -> do
    state <- H.get
    let
      credential = String.trim (txProviderCredential state)
    if credential == "" then
      H.modify_ _ { vaultErrorMessage = Just ("Enter a " <> txCredentialLabel state.txProvider <> " before saving it into the vault."), vaultStatusMessage = Nothing }
    else
      saveVaultEntry
        (txCredentialVaultKind state.txProvider)
        (normalizedEntryLabel state.txVaultLabelInput (txCredentialDefaultVaultLabel state.txProvider))
        credential
  UseVaultEntryInTransactions entryId -> do
    state <- H.get
    case lookupVaultEntry entryId state.vaultEntries of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Selected vault entry was not found.", vaultStatusMessage = Nothing }
      Just entry ->
        if not (acceptsVaultEntry (txCredentialAcceptedKinds state.txProvider) entry) then
          H.modify_ _ { vaultErrorMessage = Just ("Selected vault entry is not compatible with " <> TxProvider.providerName state.txProvider <> "."), vaultStatusMessage = Nothing }
        else
          H.modify_ \st ->
            let
              nextState = resetTxInspectorState (setTxProviderCredentialValue st.txProvider entry.value st)
            in
              nextState
                { vaultErrorMessage = Nothing
                , vaultStatusMessage = Just ("Loaded " <> entry.label <> " into " <> TxProvider.providerName st.txProvider <> ".")
                }
  PopVaultEntryInTransactions entryId -> do
    state <- H.get
    case lookupVaultEntry entryId state.vaultEntries of
      Nothing ->
        H.modify_ _ { vaultErrorMessage = Just "Selected vault entry was not found.", vaultStatusMessage = Nothing }
      Just entry ->
        if not (acceptsVaultEntry (txCredentialAcceptedKinds state.txProvider) entry) then
          H.modify_ _ { vaultErrorMessage = Just ("Selected vault entry is not compatible with " <> TxProvider.providerName state.txProvider <> "."), vaultStatusMessage = Nothing }
        else do
          let
            nextEntries = filter (\candidate -> candidate.id /= entryId) state.vaultEntries
          persistVaultEntries nextEntries ("Popped " <> entry.label <> " from the vault stack.")
          H.modify_ \st -> resetTxInspectorState (setTxProviderCredentialValue st.txProvider entry.value st)
  DeleteVaultEntry entryId ->
    do
      state <- H.get
      let
        nextEntries = filter (\entry -> entry.id /= entryId) state.vaultEntries
      persistVaultEntries nextEntries "Removed entry from the vault."

saveVaultEntry :: forall output monad. MonadAff monad => Vault.VaultKind -> String -> String -> H.HalogenM State Action () output monad Unit
saveVaultEntry kind label value = do
  state <- H.get
  if not state.vaultUnlocked then
    H.modify_ _ { vaultErrorMessage = Just "Unlock or create a vault before saving secrets into it.", vaultStatusMessage = Nothing }
  else do
    entry <- liftEffect (Vault.createVaultEntry kind label value)
    persistVaultEntries (state.vaultEntries <> [ entry ]) ("Saved " <> entry.label <> " into the vault.")

persistVaultEntries :: forall output monad. MonadAff monad => Array Vault.VaultEntry -> String -> H.HalogenM State Action () output monad Unit
persistVaultEntries entries successMessage = do
  state <- H.get
  if not state.vaultUnlocked then
    H.modify_ _ { vaultErrorMessage = Just "Unlock or create a vault before saving secrets into it.", vaultStatusMessage = Nothing }
  else if String.trim state.vaultPassphraseInput == "" then
    H.modify_ _ { vaultErrorMessage = Just "Enter the vault passphrase before saving changes.", vaultStatusMessage = Nothing }
  else
    do
      let
        fileName = defaultVaultFileName
      result <- liftAff (try (Vault.persistVaultFile fileName state.vaultPassphraseInput entries))
      case result of
        Left err ->
          H.modify_ _
            { vaultEntries = entries
            , vaultDirty = true
            , vaultErrorMessage = Just ("Vault save failed: " <> message err)
            , vaultStatusMessage = Nothing
            }
        Right _ ->
          H.modify_ _
            { vaultEntries = entries
            , vaultDirty = false
            , vaultErrorMessage = Nothing
            , vaultStatusMessage = Just successMessage
            }

refreshDerivation :: forall output monad. MonadAff monad => H.HalogenM State Action () output monad Unit
refreshDerivation = do
  state <- H.get
  let
    words = normalizeMnemonicInput state.derivationInput
    accountIndex = parseIndexInput state.accountIndexInput
    addressIndex = parseIndexInput state.addressIndexInput
  if length words == 0 then
    H.modify_ _ { derivationResult = Nothing, shelleyAddressesResult = Nothing, familyRestoreResult = Nothing }
  else if not (Mnemonic.validateMnemonic words) then
    H.modify_ _
      { derivationResult = invalidMnemonicResult state.restoreFamily
      , shelleyAddressesResult = Nothing
      , familyRestoreResult = invalidMnemonicAddressResult state.restoreFamily
      }
  else do
    case state.restoreFamily of
      RestoreShelley -> do
        result <- liftAff (try (Derivation.derivePipeline words accountIndex state.derivationRole addressIndex))
        let
          shelleyAddressesResult = case result of
            Left _ -> Nothing
            Right value -> Just (constructShelleyAddressesForState state value)
        H.modify_ _
          { previousDerivedKeys = latestSuccessfulDerivation state
          , derivationResult = Just case result of
              Left err -> Left ("Key derivation failed: " <> message err)
              Right value -> Right value
          , shelleyAddressesResult = shelleyAddressesResult
          , familyRestoreResult = Nothing
          }
      RestoreIcarus -> do
        let
          selectedNetwork = resolveLegacyNetwork state
          role = icarusRoleFor state.derivationRole
          result = case selectedNetwork of
            Left err -> pure (Left err)
            Right network -> do
              addressBase58 <- Bootstrap.constructIcarusAddressFromMnemonic network words accountIndex role addressIndex
              pure (Right addressBase58)
        actual <- liftAff (try result)
        H.modify_ _
          { derivationResult = Nothing
          , shelleyAddressesResult = Nothing
          , familyRestoreResult = Just case actual of
              Left err -> Left ("Restore failed: " <> message err)
              Right value -> value
          }
      RestoreByron -> do
        let
          selectedNetwork = resolveLegacyNetwork state
          result = case selectedNetwork of
            Left err -> pure (Left err)
            Right network -> do
              addressBase58 <- Bootstrap.constructByronAddressFromMnemonic network words accountIndex addressIndex
              pure (Right addressBase58)
        actual <- liftAff (try result)
        H.modify_ _
          { derivationResult = Nothing
          , shelleyAddressesResult = Nothing
          , familyRestoreResult = Just case actual of
              Left err -> Left ("Restore failed: " <> message err)
              Right value -> value
          }

latestSuccessfulDerivation :: State -> Maybe Derivation.DerivedKeys
latestSuccessfulDerivation state = case state.derivationResult of
  Just (Right keys) -> Just keys
  _ -> state.previousDerivedKeys

constructShelleyAddressesForState :: State -> Derivation.DerivedKeys -> Either String Shelley.ShelleyAddresses
constructShelleyAddressesForState state keys = do
  network <- resolveShelleyNetwork state
  Shelley.constructShelleyAddresses
    network
    (paymentXPubFor state.derivationRole keys)
    keys.stakePublicKeyBech32

paymentXPubFor :: Derivation.Role -> Derivation.DerivedKeys -> Maybe String
paymentXPubFor role keys = case role of
  Derivation.Stake -> Nothing
  _ -> Just keys.addressPublicKeyBech32

refreshLegacyConstruction :: forall output monad. MonadAff monad => H.HalogenM State Action () output monad Unit
refreshLegacyConstruction = do
  state <- H.get
  if String.trim state.legacyAddressXPubInput == "" then
    H.modify_ _ { legacyResult = Nothing }
  else do
    let
      selectedNetwork = resolveLegacyNetwork state
      result = case selectedNetwork of
        Left err ->
          pure (Left err)
        Right network ->
          case Bootstrap.parseBootstrapXPub state.legacyAddressXPubInput of
            Left err ->
              pure (Left err)
            Right addressXPub -> case state.legacyStyle of
              Bootstrap.LegacyIcarus -> do
                addressBase58 <- Bootstrap.constructIcarusAddress network addressXPub
                pure (Right addressBase58)
              Bootstrap.LegacyByron ->
                if String.trim state.legacyRootXPubInput == "" then
                  pure (Left "Paste the root_xvk key for Byron bootstrap addresses.")
                else case Bootstrap.parseBootstrapXPub state.legacyRootXPubInput of
                  Left err ->
                    pure (Left err)
                  Right rootXPub ->
                    if String.trim state.legacyDerivationPathInput == "" then
                      pure (Left "Enter a 2-segment Byron path like 0H/0.")
                    else do
                      addressBase58 <- Bootstrap.constructByronAddress
                        network
                        addressXPub
                        rootXPub
                        state.legacyDerivationPathInput
                      pure (Right addressBase58)
    actual <- liftAff (try result)
    H.modify_ _
      { legacyResult = Just case actual of
          Left err -> Left ("Legacy construction failed: " <> message err)
          Right value -> value
      }

refreshSigning :: forall output monad. MonadAff monad => H.HalogenM State Action () output monad Unit
refreshSigning = do
  state <- H.get
  if signingInputIsBlank state.signingPayloadMode state.signingPayloadInput || String.trim state.signingKeyInput == "" then
    H.modify_ _ { signingResult = Nothing }
  else do
    result <- H.liftAff (Signing.signPayload state.signingPayloadMode state.signingPayloadInput state.signingKeyInput)
    H.modify_ _ { signingResult = Just result }

refreshVerification :: forall output monad. MonadAff monad => H.HalogenM State Action () output monad Unit
refreshVerification = do
  state <- H.get
  if signingInputIsBlank state.verifyPayloadMode state.verifyPayloadInput || String.trim state.verificationKeyInput == "" || String.trim state.signatureInput == "" then
    H.modify_ _ { verificationResult = Nothing }
  else do
    result <- H.liftAff (Signing.verifySignature state.verifyPayloadMode state.verifyPayloadInput state.verificationKeyInput state.signatureInput)
    H.modify_ _ { verificationResult = Just result }

scriptAnalysisStatus :: ScriptInputMode -> String -> Maybe (Either String Script.ScriptAnalysis)
scriptAnalysisStatus mode value =
  let
    trimmed = String.trim value
    normalizedHex = normalizeHexInput value
  in
    case mode of
      ScriptInputCbor ->
        if normalizedHex == "" then
          Nothing
        else
          Just (Script.analyzeNativeScriptHex normalizedHex)
      ScriptInputJson ->
        if trimmed == "" then
          Nothing
        else
          Just (Script.analyzeNativeScriptJson trimmed)
      ScriptInputTemplate ->
        Nothing

scriptTemplateAnalysisStatus :: ScriptInputMode -> String -> Maybe (Either String Script.ScriptTemplateAnalysis)
scriptTemplateAnalysisStatus mode value =
  let
    trimmed = String.trim value
  in
    case mode of
      ScriptInputTemplate ->
        if trimmed == "" then
          Nothing
        else
          Just (Script.analyzeScriptTemplateJson trimmed)
      _ ->
        Nothing

render :: forall monad. State -> H.ComponentHTML Action () monad
render state =
  HH.div
    [ HP.class_ (HH.ClassName "shell") ]
    [ renderSidebar state.activePage
    , HH.main
        [ HP.class_ (HH.ClassName "main-panel") ]
        [ renderTopbar state
        , renderActivePage state
        , renderStatePanel state
        ]
    ]

renderSidebar :: forall w. Page -> HH.HTML w Action
renderSidebar activePage =
  HH.aside
    [ HP.class_ (HH.ClassName "sidebar") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "sidebar-brand") ]
        [ HH.p [ HP.class_ (HH.ClassName "sidebar-kicker") ] [ HH.text "Cardano workbench" ]
        , HH.h1 [ HP.class_ (HH.ClassName "sidebar-title") ] [ HH.text "Swiss Knife" ]
        , HH.p
            [ HP.class_ (HH.ClassName "sidebar-copy") ]
            [ HH.text "A browser-native workspace for inspecting addresses and transactions, deriving keys, and patching signed transaction witnesses locally." ]
        ]
    , HH.nav
        [ HP.class_ (HH.ClassName "nav-list") ]
        (map (renderNavItem activePage) navItems)
    , HH.div
        [ HP.class_ (HH.ClassName "sidebar-footer") ]
        [ statTile "Host" "Browser"
        , statTile "Scope" "Address + tx"
        , statTile "Next" "CLI parity"
        ]
    ]

renderTopbar :: forall w. State -> HH.HTML w Action
renderTopbar state =
  HH.header
    [ HP.class_ (HH.ClassName "topbar") ]
    [ HH.div_
        [ HH.p [ HP.class_ (HH.ClassName "eyebrow") ] [ HH.text "Workspace status" ]
        , HH.h2 [ HP.class_ (HH.ClassName "page-title") ] [ HH.text (pageTitle state.activePage) ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "topbar-badges") ]
        [ badge "Browser-first"
        , badge "WASM cores"
        , badge "Offline-first"
        , HH.button
            [ HP.class_
                (HH.ClassName ("secondary-btn" <> if state.showStatePanel then " active" else ""))
            , HE.onClick \_ -> ToggleStatePanel
            ]
            [ HH.text (if state.showStatePanel then "Hide state" else "Show state") ]
        ]
    ]

renderActivePage :: forall w. State -> HH.HTML w Action
renderActivePage state = case state.activePage of
  Overview -> renderOverview
  Inspect -> renderInspectPage state
  Mnemonic -> renderMnemonicPage state
  Derivation -> renderDerivationPage state
  Legacy -> renderLegacyPage state
  Signing -> renderSigningPage state
  Transactions -> renderTransactionsPage state
  Scripts -> renderScriptsPage state
  Vault -> renderVaultPage state
  Library -> renderLibraryPage

renderOverview :: forall w. HH.HTML w Action
renderOverview =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ heroCard
        "Browser-first workbench"
        "Cardano Swiss Knife keeps the current address-app ergonomics while widening the scope to transaction diagnosis and signed transaction assembly."
        [ "just build"
        , "just bundle"
        , "nix develop -c just build"
        ]
    , heroCard
        "Two WASM engines"
        "Address and signing primitives come from cardano-addresses; transaction decoding comes from the ledger inspector."
        [ "cardano-addresses.wasm"
        , "wasm-tx-inspector.wasm"
        , "Halogen shell"
        ]
    , sectionCard
        "Current workflow"
        [ roadmapStep "1" "Inspect addresses" "Decode Shelley and Byron payloads into structured fields."
        , roadmapStep "2" "Inspect transactions" "Decode CBOR, identify body hashes, signer intent, and witness gaps."
        , roadmapStep "3" "Assemble signed txs" "Produce body-hash signatures, inspect detached witness details, and patch vkey witnesses back into transaction CBOR."
        ]
    , sectionCard
        "Current bundles"
        [ keyValue "App bundle" "dist/app.js"
        , keyValue "Library bundle" "dist/cardano-addresses.js"
        , keyValue "Published shell" "GitHub Pages / static hosting"
        ]
    ]

renderInspectPage :: forall w. State -> HH.HTML w Action
renderInspectPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Address inspection panel"
        [ HH.p_
            [ HH.text "Paste a Cardano address and inspect its decoded structure locally in the browser." ]
        , HH.textarea
            [ HP.class_ (HH.ClassName "text-input inspector-input")
            , HP.rows 6
            , HP.placeholder "addr1... or DdzFF..."
            , HP.value state.inspectInput
            , HE.onValueInput SetInspectInput
            ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "primary-btn")
                , HE.onClick \_ -> RunInspect
                ]
                [ HH.text "Inspect address" ]
            ]
        ]
    , sectionCard
        "Inspection result"
        [ renderInspectResult state.inspectResult ]
    ]

renderMnemonicPage :: forall w. State -> HH.HTML w Action
renderMnemonicPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Mnemonic generation"
        [ HH.p_
            [ HH.text "Generate and validate a recovery phrase independently, then hand it off into restore or other key-driven flows." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            (map (renderWordCountButton state.mnemonicWordCount) mnemonicWordCounts)
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "primary-btn")
                , HE.onClick \_ -> GenerateMnemonic
                ]
                [ HH.text "Generate phrase" ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> ToggleRestorePhraseVisibility
                ]
                [ HH.text (if state.showRestorePhrase then "Hide phrase" else "Show phrase") ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyMnemonic
                ]
                [ HH.text "Copy phrase" ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> UseGeneratedMnemonic
                ]
                [ HH.text "Use in Restore" ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HP.disabled (not state.vaultUnlocked || state.generatedMnemonic == Nothing)
                , HE.onClick \_ -> SaveGeneratedMnemonicToVault
                ]
                [ HH.text "Save to vault" ]
            ]
        , HH.label
            [ HP.class_ (HH.ClassName "field-group") ]
            [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Vault item name" ]
            , HH.input
                [ HP.class_ (HH.ClassName "inline-input")
                , HP.placeholder "12-word mnemonic"
                , HP.value state.mnemonicVaultLabelInput
                , HE.onValueInput SetMnemonicVaultLabelInput
                ]
            ]
        , renderVaultInlineStatus state
        ]
    , sectionCard
        "Generated phrase"
        [ renderGeneratedMnemonicResult state.showRestorePhrase state.generatedMnemonic ]
    ]

renderDerivationPage :: forall w. State -> HH.HTML w Action
renderDerivationPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Restore and build"
        [ HH.p_
            [ HH.text "Choose the wallet family first, then restore or build from the recovery phrase you actually have." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderRestoreFamilyButton state.restoreFamily RestoreShelley
            , renderRestoreFamilyButton state.restoreFamily RestoreIcarus
            , renderRestoreFamilyButton state.restoreFamily RestoreByron
            ]
        , HH.div
            [ HP.class_ (HH.ClassName "privacy-note") ]
            [ HH.p_
                [ HH.text "Mnemonic generation is separate again. Use the Mnemonic page when you want to create or review a phrase, then paste or hand it off here." ]
            ]
        , renderVaultMnemonicShelf state
        , renderDerivationInput state
        , HH.div
            [ HP.class_ (HH.ClassName "derivation-controls") ]
            [ HH.label
                [ HP.class_ (HH.ClassName "field-group") ]
                [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Account index" ]
                , HH.input
                    [ HP.class_ (HH.ClassName "inline-input")
                    , HP.type_ HP.InputNumber
                    , HP.min 0.0
                    , HP.value state.accountIndexInput
                    , HE.onValueInput SetAccountIndexInput
                    ]
                ]
            , HH.label
                [ HP.class_ (HH.ClassName "field-group") ]
                [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Address index" ]
                , HH.input
                    [ HP.class_ (HH.ClassName "inline-input")
                    , HP.type_ HP.InputNumber
                    , HP.min 0.0
                    , HP.value state.addressIndexInput
                    , HE.onValueInput SetAddressIndexInput
                    ]
                ]
            ]
        , if familyUsesRole state.restoreFamily then
            HH.div
              [ HP.class_ (HH.ClassName "action-row") ]
              (map (renderRoleButton state.derivationRole) (rolesForFamily state.restoreFamily))
          else
            HH.text ""
        , if state.restoreFamily == RestoreShelley then
            HH.div
              [ HP.class_ (HH.ClassName "action-row") ]
              (map (renderShelleyNetworkButton state.shelleyNetwork) shelleyNetworks)
          else
            HH.text ""
        , if state.restoreFamily == RestoreShelley then
            HH.div
              [ HP.class_ (HH.ClassName "action-row") ]
              [ renderShelleyCustomNetworkButton state.shelleyNetwork ]
          else
            HH.text ""
        , if state.restoreFamily == RestoreShelley && isShelleyCustomNetwork state.shelleyNetwork then
            HH.label
              [ HP.class_ (HH.ClassName "field-group") ]
              [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Network tag" ]
              , HH.input
                  [ HP.class_ (HH.ClassName "inline-input")
                  , HP.type_ HP.InputNumber
                  , HP.min 0.0
                  , HP.max 15.0
                  , HP.placeholder "3"
                  , HP.value state.shelleyCustomNetworkTagInput
                  , HE.onValueInput SetShelleyCustomNetworkTagInput
                  ]
              ]
          else
            HH.text ""
        , if familyUsesNetwork state.restoreFamily then
            HH.div
              [ HP.class_ (HH.ClassName "action-row") ]
              (map (renderLegacyNetworkButton state.legacyNetwork) legacyNetworks)
          else
            HH.text ""
        , if familyUsesNetwork state.restoreFamily then
            HH.div
              [ HP.class_ (HH.ClassName "action-row") ]
              [ renderLegacyCustomNetworkButton state.legacyNetwork ]
          else
            HH.text ""
        , if familyUsesCustomNetwork state then
            HH.label
              [ HP.class_ (HH.ClassName "field-group") ]
              [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Protocol magic" ]
              , HH.input
                  [ HP.class_ (HH.ClassName "inline-input")
                  , HP.type_ HP.InputNumber
                  , HP.placeholder "4242"
                  , HP.value state.legacyCustomMagicInput
                  , HE.onValueInput SetLegacyCustomMagicInput
                  ]
              ]
          else
            HH.text ""
        , keyValue "Family" (restoreFamilyLabel state.restoreFamily)
        , if state.restoreFamily == RestoreShelley then
            keyValue "Network" (shelleyNetworkSummary state)
          else
            HH.text ""
        , keyValue "Mode" (restoreModeSummary state.restoreFamily)
        , keyValue "Path" (restorePathSummary state)
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HP.disabled (not state.vaultUnlocked || joinWith " " (normalizeMnemonicInput state.derivationInput) == "")
                , HE.onClick \_ -> SaveRestorePhraseToVault
                ]
                [ HH.text "Save phrase to vault" ]
            ]
        , HH.label
            [ HP.class_ (HH.ClassName "field-group") ]
            [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Vault item name" ]
            , HH.input
                [ HP.class_ (HH.ClassName "inline-input")
                , HP.placeholder (restoreFamilyLabel state.restoreFamily <> " restore phrase")
                , HP.value state.restoreVaultLabelInput
                , HE.onValueInput SetRestoreVaultLabelInput
                ]
            ]
        , renderVaultInlineStatus state
        ]
    , sectionCard
        (restoreOutputTitle state.restoreFamily)
        [ case state.restoreFamily of
            RestoreShelley ->
              renderShelleyRestoreResult
                state.showDerivedKeys
                state.previousDerivedKeys
                state.derivationResult
                state.shelleyAddressesResult
            _ ->
              renderFamilyRestoreResult state.familyRestoreResult
        ]
    ]

renderLegacyPage :: forall w. State -> HH.HTML w Action
renderLegacyPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Manual bootstrap construction"
        [ HH.p_
            [ HH.text "Expert mode: construct bootstrap addresses directly from explicit xpub material. The default restore flow now starts from the mnemonic on the Restore page." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            (map (renderLegacyStyleButton state.legacyStyle) legacyStyles)
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            (map (renderLegacyNetworkButton state.legacyNetwork) legacyNetworks)
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderLegacyCustomNetworkButton state.legacyNetwork ]
        , if isLegacyCustomSelected state then
            HH.label
              [ HP.class_ (HH.ClassName "field-group") ]
              [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Protocol magic" ]
              , HH.input
                  [ HP.class_ (HH.ClassName "inline-input")
                  , HP.type_ HP.InputNumber
                  , HP.placeholder "4242"
                  , HP.value state.legacyCustomMagicInput
                  , HE.onValueInput SetLegacyCustomMagicInput
                  ]
              ]
          else
            HH.text ""
        , HH.label
            [ HP.class_ (HH.ClassName "field-group") ]
            [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Address xpub" ]
            , HH.textarea
                [ HP.class_ (HH.ClassName "text-input inspector-input")
                , HP.rows 4
                , HP.placeholder "addr_xvk1..."
                , HP.value state.legacyAddressXPubInput
                , HE.onValueInput SetLegacyAddressXPubInput
                ]
            ]
        , if state.legacyStyle == Bootstrap.LegacyByron then
            HH.div
              [ HP.class_ (HH.ClassName "legacy-extra-fields") ]
              [ HH.label
                  [ HP.class_ (HH.ClassName "field-group") ]
                  [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Root xpub" ]
                  , HH.textarea
                      [ HP.class_ (HH.ClassName "text-input inspector-input")
                      , HP.rows 4
                      , HP.placeholder "root_xvk1..."
                      , HP.value state.legacyRootXPubInput
                      , HE.onValueInput SetLegacyRootXPubInput
                      ]
                  ]
              , HH.label
                  [ HP.class_ (HH.ClassName "field-group") ]
                  [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Byron path" ]
                  , HH.input
                      [ HP.class_ (HH.ClassName "inline-input")
                      , HP.placeholder "0H/0"
                      , HP.value state.legacyDerivationPathInput
                      , HE.onValueInput SetLegacyDerivationPathInput
                      ]
                  ]
              ]
          else
            HH.text ""
        , keyValue "Network" (legacyNetworkSummary state)
        , keyValue "Style" (legacyStyleLabel state.legacyStyle)
        ]
    , sectionCard
        "Bootstrap address"
        [ renderLegacyResult state.legacyResult ]
    ]

renderDerivationInput :: forall w. State -> HH.HTML w Action
renderDerivationInput state =
  if not state.showRestorePhrase then
    HH.div_
      [ HH.input
          [ HP.class_ (HH.ClassName "text-input derivation-secret-input")
          , HP.type_ HP.InputPassword
          , HP.placeholder "abandon abandon ... or use the generated phrase"
          , HP.value state.derivationInput
          , HE.onValueInput SetDerivationInput
          ]
      , HH.div
          [ HP.class_ (HH.ClassName "privacy-note") ]
          [ HH.p_ [ HH.text "This card is hidden while keeping paste and derivation available." ] ]
      ]
  else
    HH.div_
      [ HH.textarea
          [ HP.class_ (HH.ClassName "text-input derivation-input")
          , HP.rows 6
          , HP.placeholder "abandon abandon ... or use the generated phrase"
          , HP.value state.derivationInput
          , HE.onValueInput SetDerivationInput
          ]
      ]

renderSigningPage :: forall w. State -> HH.HTML w Action
renderSigningPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Sign payload"
        [ HH.p_
            [ HH.text "Sign arbitrary text or hex payloads with an extended signing key. This tool signs raw bytes only; it does not build or sign Cardano transactions." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderSigningModeButton state.signingPayloadMode Signing.PayloadText
            , renderSigningModeButton state.signingPayloadMode Signing.PayloadHex
            ]
        , HH.textarea
            [ HP.class_ (HH.ClassName "text-input script-input")
            , HP.rows 5
            , HP.placeholder (signingPayloadPlaceholder state.signingPayloadMode)
            , HP.value state.signingPayloadInput
            , HE.onValueInput SetSigningPayloadInput
            ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> ToggleSigningKeyVisibility
                ]
                [ HH.text (if state.showSigningKey then "Hide signing key" else "Show signing key") ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HP.disabled (not state.vaultUnlocked || String.trim state.signingKeyInput == "")
                , HE.onClick \_ -> SaveSigningKeyToVault
                ]
                [ HH.text "Save signing key to vault" ]
            ]
        , HH.label
            [ HP.class_ (HH.ClassName "field-group") ]
            [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Vault item name" ]
            , HH.input
                [ HP.class_ (HH.ClassName "inline-input")
                , HP.placeholder "Signing key"
                , HP.value state.signingVaultLabelInput
                , HE.onValueInput SetSigningVaultLabelInput
                ]
            ]
        , renderVaultSigningShelf state
        , if state.showSigningKey then
            HH.textarea
              [ HP.class_ (HH.ClassName "text-input inspector-input")
              , HP.rows 4
              , HP.placeholder "addr_xsk1... or stake_xsk1..."
              , HP.value state.signingKeyInput
              , HE.onValueInput SetSigningKeyInput
              ]
          else
            HH.input
              [ HP.class_ (HH.ClassName "text-input derivation-secret-input")
              , HP.type_ HP.InputPassword
              , HP.placeholder "addr_xsk1... or stake_xsk1..."
              , HP.value state.signingKeyInput
              , HE.onValueInput SetSigningKeyInput
              ]
        , keyValue "Accepted signing keys" "root_xsk, acct_xsk, addr_xsk, stake_xsk"
        , renderVaultInlineStatus state
        ]
    , sectionCard
        "Signature"
        [ renderSigningResult state.signingResult ]
    , sectionCard
        "Verify signature"
        [ HH.p_
            [ HH.text "Verify a 64-byte Ed25519 signature against an extended verification key using the same payload bytes." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderVerifyModeButton state.verifyPayloadMode Signing.PayloadText
            , renderVerifyModeButton state.verifyPayloadMode Signing.PayloadHex
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> UseSigningResultForVerification
                ]
                [ HH.text "Use signed payload" ]
            ]
        , HH.textarea
            [ HP.class_ (HH.ClassName "text-input script-input")
            , HP.rows 5
            , HP.placeholder (signingPayloadPlaceholder state.verifyPayloadMode)
            , HP.value state.verifyPayloadInput
            , HE.onValueInput SetVerifyPayloadInput
            ]
        , HH.textarea
            [ HP.class_ (HH.ClassName "text-input inspector-input")
            , HP.rows 3
            , HP.placeholder "addr_xvk1... or stake_xvk1..."
            , HP.value state.verificationKeyInput
            , HE.onValueInput SetVerificationKeyInput
            ]
        , HH.textarea
            [ HP.class_ (HH.ClassName "text-input inspector-input")
            , HP.rows 3
            , HP.placeholder "64-byte signature as hex"
            , HP.value state.signatureInput
            , HE.onValueInput SetSignatureInput
            ]
        , renderVerificationResult state.verificationResult
        ]
    ]

renderTransactionsPage :: forall w. State -> HH.HTML w Action
renderTransactionsPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Inspect transaction"
        [ HH.p_
            [ HH.text "Fetch by hash or paste CBOR hex, then run the ledger inspector locally in the browser." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderTxProviderButton state.txProvider TxProvider.Blockfrost
            , renderTxProviderButton state.txProvider TxProvider.Koios
            ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderTxNetworkButton state.txNetwork TxBlockfrost.Mainnet
            , renderTxNetworkButton state.txNetwork TxBlockfrost.Preprod
            , renderTxNetworkButton state.txNetwork TxBlockfrost.Preview
            ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderTxInputModeButton state.txInputMode TxByHash "Transaction hash"
            , renderTxInputModeButton state.txInputMode TxByHex "CBOR hex"
            ]
        , case state.txInputMode of
            TxByHash ->
              HH.div_
                [ HH.div
                    [ HP.class_ (HH.ClassName "action-row") ]
                    [ HH.button
                        [ HP.class_ (HH.ClassName "secondary-btn")
                        , HE.onClick \_ -> ToggleTxCredentialVisibility
                        ]
                        [ HH.text (if state.showTxCredential then "Hide credential" else "Show credential") ]
                    , HH.button
                        [ HP.class_ (HH.ClassName "secondary-btn")
                        , HP.disabled (not state.vaultUnlocked || String.trim (txProviderCredential state) == "")
                        , HE.onClick \_ -> SaveTxCredentialToVault
                        ]
                        [ HH.text "Save secret to vault" ]
                    ]
                , HH.label
                    [ HP.class_ (HH.ClassName "field-group") ]
                    [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text (txCredentialLabel state.txProvider) ]
                    , HH.input
                        [ HP.class_ (HH.ClassName "inline-input")
                        , HP.type_ (if state.showTxCredential then HP.InputText else HP.InputPassword)
                        , HP.placeholder (txCredentialPlaceholder state.txProvider)
                        , HP.value (txProviderCredential state)
                        , HE.onValueInput (txCredentialAction state.txProvider)
                        ]
                    ]
                , HH.label
                    [ HP.class_ (HH.ClassName "field-group") ]
                    [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Vault item name" ]
                    , HH.input
                        [ HP.class_ (HH.ClassName "inline-input")
                        , HP.placeholder (txCredentialDefaultVaultLabel state.txProvider)
                        , HP.value state.txVaultLabelInput
                        , HE.onValueInput SetTxVaultLabelInput
                        ]
                    ]
                , renderTxCredentialVaultShelf state
                , HH.div
                    [ HP.class_ (HH.ClassName "privacy-note") ]
                    [ HH.p_ [ HH.text (txCredentialNote state.txProvider) ] ]
                , renderVaultInlineStatus state
                , HH.input
                    [ HP.class_ (HH.ClassName "text-input")
                    , HP.placeholder "64-character transaction hash"
                    , HP.value state.txHashInput
                    , HE.onValueInput SetTxHashInput
                    ]
                ]
            TxByHex ->
              HH.textarea
                [ HP.class_ (HH.ClassName "text-input inspector-input")
                , HP.rows 9
                , HP.placeholder "84a40081825820..."
                , HP.value state.txHexInput
                , HE.onValueInput SetTxHexInput
                ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "primary-btn")
                , HP.disabled state.txRunning
                , HE.onClick \_ -> RunTxInspect
                ]
                [ HH.text (if state.txRunning then "Inspecting..." else "Inspect transaction") ]
            ]
        , keyValue "Source mode" (txInputModeLabel state.txInputMode)
        , keyValue "Provider" (TxProvider.providerName state.txProvider)
        , keyValue "Network" (txNetworkLabel state.txNetwork)
        , renderTxInlineStatus state.txErrorMessage
        ]
    , sectionCard
        "Sign transaction body"
        [ HH.p_
            [ HH.text "This signs the transaction body hash locally, keeps the detached witness details visible, and patches the vkey witness back into the transaction CBOR." ]
        , keyValue "Body hash" (txBodyHashLabel state)
        , keyValue "Witness plan match" (txSigningMatchLabel state)
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> ToggleTxSigningKeyVisibility
                ]
                [ HH.text (if state.showTxSigningKey then "Hide signing key" else "Show signing key") ]
            ]
        , if state.showTxSigningKey then
            HH.textarea
              [ HP.class_ (HH.ClassName "text-input inspector-input")
              , HP.rows 4
              , HP.placeholder "addr_xsk1... or stake_xsk1..."
              , HP.value state.txSigningKeyInput
              , HE.onValueInput SetTxSigningKeyInput
              ]
          else
            HH.input
              [ HP.class_ (HH.ClassName "text-input derivation-secret-input")
              , HP.type_ HP.InputPassword
              , HP.placeholder "addr_xsk1... or stake_xsk1..."
              , HP.value state.txSigningKeyInput
              , HE.onValueInput SetTxSigningKeyInput
              ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "primary-btn")
                , HP.disabled state.txSigningRunning
                , HE.onClick \_ -> RunTxSign
                ]
                [ HH.text (if state.txSigningRunning then "Signing..." else "Create signed transaction") ]
            ]
        , keyValue "Accepted signing keys" "root_xsk, acct_xsk, addr_xsk, stake_xsk"
        , renderTxSigningResult state
        ]
    , sectionCard
        "Decoded overview"
        [ renderTxInspection state ]
    , sectionCard
        "Transaction identity"
        [ renderTxIdentification state ]
    , sectionCard
        "Signing intent"
        [ renderTxIntentSummary state ]
    , sectionCard
        "Witness plan"
        [ renderTxWitnessPlan state ]
    , sectionCard
        "Transaction browser"
        [ renderTxBrowser state ]
    ]

renderScriptsPage :: forall w. State -> HH.HTML w Action
renderScriptsPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Native script tools"
        [ HH.p_
            [ HH.text "Author native scripts as canonical JSON or paste existing CBOR preimages. The browser reserializes the script, computes the ledger hash, and validates the result locally." ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ renderScriptModeButton state.scriptInputMode ScriptInputCbor "CBOR hex"
            , renderScriptModeButton state.scriptInputMode ScriptInputJson "JSON"
            , renderScriptModeButton state.scriptInputMode ScriptInputTemplate "Template JSON"
            ]
        , HH.textarea
            [ HP.class_ (HH.ClassName "text-input script-input")
            , HP.rows 6
            , HP.placeholder (scriptInputPlaceholder state.scriptInputMode)
            , HP.value state.scriptInput
            , HE.onValueInput SetScriptInput
            ]
        , keyValue "Accepted input" (scriptInputModeLabel state.scriptInputMode)
        , keyValue "Output" (scriptOutputLabel state.scriptInputMode)
        ]
    , sectionCard
        "Script analysis"
        [ case state.scriptInputMode of
            ScriptInputTemplate -> renderScriptTemplateAnalysisResult state.scriptTemplateAnalysisResult
            _ -> renderScriptAnalysisResult state.scriptAnalysisResult
        ]
    ]

renderVaultPage :: forall w. State -> HH.HTML w Action
renderVaultPage state =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Encrypted vault"
        [ HH.p_
            [ HH.text "Use one encrypted vault as the shared secret stack for the app. Open it with the passphrase, push material from tools, then peek or pop compatible entries where you need them." ]
        , HH.label
            [ HP.class_ (HH.ClassName "field-group") ]
            [ HH.span [ HP.class_ (HH.ClassName "field-label") ] [ HH.text "Vault passphrase" ]
            , HH.input
                [ HP.class_ (HH.ClassName "text-input derivation-secret-input")
                , HP.type_ (if state.showVaultPassphrase then HP.InputText else HP.InputPassword)
                , HP.placeholder "Strong passphrase for the vault file"
                , HP.value state.vaultPassphraseInput
                , HE.onValueInput SetVaultPassphraseInput
                ]
            ]
        , HH.div
            [ HP.class_ (HH.ClassName "action-row") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> ToggleVaultPassphraseVisibility
                ]
                [ HH.text (if state.showVaultPassphrase then "Hide passphrase" else "Show passphrase") ]
            , HH.button
                [ HP.class_ (HH.ClassName "primary-btn")
                , HE.onClick \_ -> CreateVault
                ]
                [ HH.text "Create vault" ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> ImportVault
                ]
                [ HH.text "Open vault" ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HP.disabled (not state.vaultUnlocked)
                , HE.onClick \_ -> ExportVault
                ]
                [ HH.text "Download backup" ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HP.disabled (not state.vaultUnlocked)
                , HE.onClick \_ -> LockVault
                ]
                [ HH.text "Lock vault" ]
            ]
        , keyValue "State" (vaultStateLabel state)
        , keyValue "Entries" (show (length state.vaultEntries))
        , keyValue "Vault file" defaultVaultFileName
        , keyValue "Persisted" (if state.vaultDirty then "No, write failed" else "Yes")
        , renderVaultInlineStatus state
        ]
    , sectionCard
        "Clipboard stack"
        [ renderVaultEntries state ]
    ]

renderLibraryPage :: forall w. HH.HTML w Action
renderLibraryPage =
  HH.div
    [ HP.class_ (HH.ClassName "page-grid") ]
    [ sectionCard
        "Exported today"
        [ keyValue "Address prefix" Prefixes.addr
        , keyValue "Stake prefix" Prefixes.stake
        , keyValue "Address type" "opaque Uint8Array wrapper"
        ]
    , sectionCard
        "Useful imports"
        [ codeBlock "import Cardano.Address (bech32, fromBech32, base58, fromBase58)"
        , codeBlock "import Cardano.Address.Hash (hashCredentialHex)"
        , codeBlock "import Cardano.Address.Bech32 as Bech32"
        ]
    ]

renderStatePanel :: forall w. State -> HH.HTML w Action
renderStatePanel state =
  if state.showStatePanel then
    HH.section
      [ HP.class_ (HH.ClassName "card state-card") ]
      [ HH.h3 [ HP.class_ (HH.ClassName "card-title") ] [ HH.text "App state" ]
      , HH.div
          [ HP.class_ (HH.ClassName "result-grid") ]
          [ keyValue "Active page" (pageTitle state.activePage)
          , keyValue "Inspect input length" (show (String.length state.inspectInput))
          , keyValue "Inspect result" (inspectStatus state.inspectResult)
          , keyValue "Mnemonic word count" (show state.mnemonicWordCount)
          , keyValue "Mnemonic phrase" (mnemonicStatus state.showRestorePhrase state.derivationInput)
          , keyValue "Restore family" (restoreFamilyLabel state.restoreFamily)
          , keyValue "Derivation role" (Derivation.roleLabel state.derivationRole)
          , keyValue "Restore path" (restorePathSummary state)
          , keyValue "Derivation result" (derivationStatus state.derivationResult)
          , keyValue "Family restore result" (familyRestoreStatus state.familyRestoreResult)
          , keyValue "Signing result" (signingStatus state.signingResult)
          , keyValue "Verification result" (verificationStatus state.verificationResult)
          , keyValue "Tx source mode" (txInputModeLabel state.txInputMode)
          , keyValue "Tx provider" (TxProvider.providerName state.txProvider)
          , keyValue "Tx body hash" (txBodyHashLabel state)
          , keyValue "Tx witness signing" (txSigningMatchLabel state)
          ]
      ]
  else
    HH.text ""

heroCard :: forall w. String -> String -> Array String -> HH.HTML w Action
heroCard title body bullets =
  HH.section
    [ HP.class_ (HH.ClassName "card card-hero") ]
    [ HH.h3 [ HP.class_ (HH.ClassName "card-title") ] [ HH.text title ]
    , HH.p [ HP.class_ (HH.ClassName "card-copy") ] [ HH.text body ]
    , HH.ul [ HP.class_ (HH.ClassName "bullet-list") ] (map renderBullet bullets)
    ]

sectionCard :: forall w. String -> Array (HH.HTML w Action) -> HH.HTML w Action
sectionCard title contents =
  HH.section
    [ HP.class_ (HH.ClassName "card") ]
    ([ HH.h3 [ HP.class_ (HH.ClassName "card-title") ] [ HH.text title ] ] <> contents)

renderNavItem :: forall w. Page -> NavItem -> HH.HTML w Action
renderNavItem activePage item =
  HH.button
    [ HP.class_
        (HH.ClassName ("nav-item" <> if activePage == item.page then " active" else ""))
    , HE.onClick \_ -> SelectPage item.page
    ]
    [ HH.span [ HP.class_ (HH.ClassName "nav-label") ] [ HH.text item.label ]
    , HH.span [ HP.class_ (HH.ClassName "nav-note") ] [ HH.text item.note ]
    ]

renderBullet :: forall w. String -> HH.HTML w Action
renderBullet value =
  HH.li_ [ HH.text value ]

roadmapStep :: forall w. String -> String -> String -> HH.HTML w Action
roadmapStep number title body =
  HH.div
    [ HP.class_ (HH.ClassName "roadmap-step") ]
    [ HH.div [ HP.class_ (HH.ClassName "roadmap-number") ] [ HH.text number ]
    , HH.div_
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text title ]
        , HH.p [ HP.class_ (HH.ClassName "roadmap-copy") ] [ HH.text body ]
        ]
    ]

keyValue :: forall w. String -> String -> HH.HTML w Action
keyValue label value =
  HH.div
    [ HP.class_ (HH.ClassName "kv-row") ]
    [ HH.span [ HP.class_ (HH.ClassName "kv-label") ] [ HH.text label ]
    , HH.code [ HP.class_ (HH.ClassName "kv-value") ] [ HH.text value ]
    ]

codeBlock :: forall w. String -> HH.HTML w Action
codeBlock value =
  HH.pre
    [ HP.class_ (HH.ClassName "code-block") ]
    [ HH.code_ [ HH.text value ] ]

badge :: forall w. String -> HH.HTML w Action
badge value =
  HH.span [ HP.class_ (HH.ClassName "badge") ] [ HH.text value ]

statTile :: forall w. String -> String -> HH.HTML w Action
statTile label value =
  HH.div
    [ HP.class_ (HH.ClassName "stat-tile") ]
    [ HH.p [ HP.class_ (HH.ClassName "stat-label") ] [ HH.text label ]
    , HH.p [ HP.class_ (HH.ClassName "stat-value") ] [ HH.text value ]
    ]

renderInspectResult :: forall w. Maybe (Either String Inspect.AddressInfo) -> HH.HTML w Action
renderInspectResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "No address inspected yet. Supported today: Shelley bech32 plus Byron and Icarus base58 inspection." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right info) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-grid") ]
      ( [ keyValue "Style" info.addressStyle
        , keyValue "Header type" info.addressTypeLabel
        , keyValue "Header type code" (show info.addressType)
        , keyValue "Network" info.networkTagLabel
        , keyValue "Network tag" (networkTagValue info.networkTag)
        , keyValue "Stake reference" info.stakeReference
        , maybeRow "Spending key hash" info.spendingKeyHash
        , maybeRow "Spending script hash" info.spendingScriptHash
        , maybeRow "Stake key hash" info.stakeKeyHash
        , maybeRow "Stake script hash" info.stakeScriptHash
        ]
          <> map renderDetailRow info.extraDetails
      )

renderDetailRow :: forall w. Inspect.DetailRow -> HH.HTML w Action
renderDetailRow detail =
  keyValue detail.label detail.value

networkTagValue :: Int -> String
networkTagValue tag
  | tag < 0 = "-"
networkTagValue tag = show tag

maybeRow :: forall w. String -> Maybe String -> HH.HTML w Action
maybeRow label value =
  keyValue label case value of
    Just content -> content
    Nothing -> "-"

txInputModeLabel :: TxInputMode -> String
txInputModeLabel = case _ of
  TxByHash -> "Transaction hash"
  TxByHex -> "CBOR hex"

txNetworkLabel :: TxBlockfrost.Network -> String
txNetworkLabel = case _ of
  TxBlockfrost.Mainnet -> "Mainnet"
  TxBlockfrost.Preprod -> "Preprod"
  TxBlockfrost.Preview -> "Preview"

txCredentialLabel :: TxProvider.Provider -> String
txCredentialLabel = case _ of
  TxProvider.Blockfrost -> "Blockfrost project ID"
  TxProvider.Koios -> "Koios bearer token"

txCredentialPlaceholder :: TxProvider.Provider -> String
txCredentialPlaceholder = case _ of
  TxProvider.Blockfrost -> "mainnet..."
  TxProvider.Koios -> "Optional bearer token"

txCredentialNote :: TxProvider.Provider -> String
txCredentialNote = case _ of
  TxProvider.Blockfrost -> "Project IDs belong in the encrypted vault. Load one here only when you need to fetch a transaction by hash."
  TxProvider.Koios -> "Bearer tokens belong in the encrypted vault. Load one here only when you need to fetch a transaction by hash."

txCredentialAction :: TxProvider.Provider -> String -> Action
txCredentialAction = case _ of
  TxProvider.Blockfrost -> SetTxBlockfrostKey
  TxProvider.Koios -> SetTxKoiosBearer

renderWordCountButton :: forall w. Int -> Int -> HH.HTML w Action
renderWordCountButton activeCount wordCount =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeCount == wordCount then " active" else ""))
    , HE.onClick \_ -> SetMnemonicWordCount wordCount
    ]
    [ HH.text (show wordCount <> " words") ]

renderRoleButton :: forall w. Derivation.Role -> Derivation.Role -> HH.HTML w Action
renderRoleButton activeRole role =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeRole == role then " active" else ""))
    , HE.onClick \_ -> SetDerivationRole role
    ]
    [ HH.text (Derivation.roleLabel role) ]

renderRestoreFamilyButton :: forall w. RestoreFamily -> RestoreFamily -> HH.HTML w Action
renderRestoreFamilyButton activeFamily family =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeFamily == family then " active" else ""))
    , HE.onClick \_ -> SetRestoreFamily family
    ]
    [ HH.text (restoreFamilyLabel family) ]

renderShelleyNetworkButton :: forall w. Shelley.ShelleyNetwork -> Shelley.ShelleyNetwork -> HH.HTML w Action
renderShelleyNetworkButton activeNetwork network =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeNetwork == network then " active" else ""))
    , HE.onClick \_ -> SetShelleyNetwork network
    ]
    [ HH.text (Shelley.shelleyNetworkLabel network) ]

renderShelleyCustomNetworkButton :: forall w. Shelley.ShelleyNetwork -> HH.HTML w Action
renderShelleyCustomNetworkButton activeNetwork =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if isShelleyCustomNetwork activeNetwork then " active" else ""))
    , HE.onClick \_ -> SelectShelleyCustomNetwork
    ]
    [ HH.text "Custom" ]

renderLegacyStyleButton :: forall w. Bootstrap.LegacyStyle -> Bootstrap.LegacyStyle -> HH.HTML w Action
renderLegacyStyleButton activeStyle style =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeStyle == style then " active" else ""))
    , HE.onClick \_ -> SetLegacyStyle style
    ]
    [ HH.text (legacyStyleLabel style) ]

renderLegacyNetworkButton :: forall w. Bootstrap.LegacyNetwork -> Bootstrap.LegacyNetwork -> HH.HTML w Action
renderLegacyNetworkButton activeNetwork network =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeNetwork == network then " active" else ""))
    , HE.onClick \_ -> SetLegacyNetwork network
    ]
    [ HH.text (legacyNetworkShortLabel network) ]

renderLegacyCustomNetworkButton :: forall w. Bootstrap.LegacyNetwork -> HH.HTML w Action
renderLegacyCustomNetworkButton activeNetwork =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if isLegacyCustomNetwork activeNetwork then " active" else ""))
    , HE.onClick \_ -> SelectLegacyCustomNetwork
    ]
    [ HH.text "Custom" ]

renderSigningModeButton :: forall w. Signing.PayloadMode -> Signing.PayloadMode -> HH.HTML w Action
renderSigningModeButton activeMode mode =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeMode == mode then " active" else ""))
    , HE.onClick \_ -> SetSigningPayloadMode mode
    ]
    [ HH.text (Signing.payloadModeLabel mode) ]

renderVerifyModeButton :: forall w. Signing.PayloadMode -> Signing.PayloadMode -> HH.HTML w Action
renderVerifyModeButton activeMode mode =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeMode == mode then " active" else ""))
    , HE.onClick \_ -> SetVerifyPayloadMode mode
    ]
    [ HH.text (Signing.payloadModeLabel mode) ]

renderScriptModeButton :: forall w. ScriptInputMode -> ScriptInputMode -> String -> HH.HTML w Action
renderScriptModeButton activeMode mode label =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeMode == mode then " active" else ""))
    , HE.onClick \_ -> SetScriptInputMode mode
    ]
    [ HH.text label ]

renderTxProviderButton :: forall w. TxProvider.Provider -> TxProvider.Provider -> HH.HTML w Action
renderTxProviderButton activeProvider provider =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeProvider == provider then " active" else ""))
    , HE.onClick \_ -> SetTxProvider provider
    ]
    [ HH.text (TxProvider.providerName provider) ]

renderTxInputModeButton :: forall w. TxInputMode -> TxInputMode -> String -> HH.HTML w Action
renderTxInputModeButton activeMode mode label =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeMode == mode then " active" else ""))
    , HE.onClick \_ -> SetTxInputMode mode
    ]
    [ HH.text label ]

renderTxNetworkButton :: forall w. TxBlockfrost.Network -> TxBlockfrost.Network -> HH.HTML w Action
renderTxNetworkButton activeNetwork network =
  HH.button
    [ HP.class_
        (HH.ClassName ("secondary-btn" <> if activeNetwork == network then " active" else ""))
    , HE.onClick \_ -> SetTxNetwork network
    ]
    [ HH.text (txNetworkLabel network) ]

renderMnemonicResult :: forall w. Boolean -> String -> HH.HTML w Action
renderMnemonicResult isVisible derivationInput =
  let
    words = normalizeMnemonicInput derivationInput
  in
    if length words == 0 then
      HH.div
        [ HP.class_ (HH.ClassName "empty-state") ]
        [ HH.p_
            [ HH.text "No recovery phrase loaded yet. Generate one here or paste one below." ]
        ]
    else
      HH.div
        [ HP.class_ (HH.ClassName "mnemonic-result") ]
        [ if not isVisible then
            HH.div
              [ HP.class_ (HH.ClassName "privacy-note") ]
              [ HH.p_
                  [ HH.text ("Phrase hidden. " <> show (length words) <> " words are available for clipboard copy.") ]
              ]
          else
            HH.div
              [ HP.class_ (HH.ClassName "mnemonic-grid") ]
              (map renderMnemonicWord (zipWithIndex words))
        ]

renderGeneratedMnemonicResult :: forall w. Boolean -> Maybe (Array String) -> HH.HTML w Action
renderGeneratedMnemonicResult isVisible maybeWords = case maybeWords of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "No recovery phrase generated yet. Choose a word count and generate one here." ]
      ]
  Just words ->
    HH.div
      [ HP.class_ (HH.ClassName "mnemonic-result") ]
      [ if not isVisible then
          HH.div
            [ HP.class_ (HH.ClassName "privacy-note") ]
            [ HH.p_
                [ HH.text ("Phrase hidden. " <> show (length words) <> " words are available for clipboard copy.") ]
            ]
        else
          HH.div
            [ HP.class_ (HH.ClassName "mnemonic-grid") ]
            (map renderMnemonicWord (zipWithIndex words))
      ]

renderMnemonicWord :: forall w. { index :: Int, word :: String } -> HH.HTML w Action
renderMnemonicWord item =
  HH.div
    [ HP.class_ (HH.ClassName "mnemonic-word") ]
    [ HH.span [ HP.class_ (HH.ClassName "mnemonic-index") ] [ HH.text (show item.index <> ".") ]
    , HH.code [ HP.class_ (HH.ClassName "mnemonic-value") ] [ HH.text item.word ]
    ]

zipWithIndex :: Array String -> Array { index :: Int, word :: String }
zipWithIndex = mapWithIndex \index word -> { index: index + 1, word }

mnemonicWordCounts :: Array Int
mnemonicWordCounts = [ 12, 15, 18, 21, 24 ]

derivationRoles :: Array Derivation.Role
derivationRoles = [ Derivation.UTxOExternal, Derivation.UTxOInternal, Derivation.Stake ]

legacyStyles :: Array Bootstrap.LegacyStyle
legacyStyles = [ Bootstrap.LegacyIcarus, Bootstrap.LegacyByron ]

legacyNetworks :: Array Bootstrap.LegacyNetwork
legacyNetworks =
  [ Bootstrap.LegacyMainnet
  , Bootstrap.LegacyStaging
  , Bootstrap.LegacyTestnet
  , Bootstrap.LegacyPreview
  , Bootstrap.LegacyPreprod
  ]

shelleyNetworks :: Array Shelley.ShelleyNetwork
shelleyNetworks =
  [ Shelley.ShelleyMainnet
  , Shelley.ShelleyPreprod
  , Shelley.ShelleyPreview
  ]

isLegacyCustomNetwork :: Bootstrap.LegacyNetwork -> Boolean
isLegacyCustomNetwork = case _ of
  Bootstrap.LegacyCustom _ -> true
  _ -> false

isLegacyCustomSelected :: State -> Boolean
isLegacyCustomSelected state = isLegacyCustomNetwork state.legacyNetwork

parseLegacyCustomMagic :: String -> Either String Int
parseLegacyCustomMagic rawValue =
  let
    trimmed = String.trim rawValue
  in
    if trimmed == "" then
      Left "Enter a custom protocol magic."
    else case Int.fromString trimmed of
      Just magic | magic >= 0 -> Right magic
      _ -> Left "Enter a non-negative integer for the custom protocol magic."

resolveLegacyNetwork :: State -> Either String Bootstrap.LegacyNetwork
resolveLegacyNetwork state = case state.legacyNetwork of
  Bootstrap.LegacyCustom _ -> Bootstrap.LegacyCustom <$> parseLegacyCustomMagic state.legacyCustomMagicInput
  network -> Right network

parseShelleyCustomNetworkTag :: String -> Either String Int
parseShelleyCustomNetworkTag rawValue =
  let
    trimmed = String.trim rawValue
  in
    if trimmed == "" then
      Left "Enter a custom Shelley network tag."
    else case Int.fromString trimmed of
      Just networkTag | networkTag >= 0 && networkTag <= 15 -> Right networkTag
      _ -> Left "Enter a Shelley network tag between 0 and 15."

resolveShelleyNetwork :: State -> Either String Shelley.ShelleyNetwork
resolveShelleyNetwork state = case state.shelleyNetwork of
  Shelley.ShelleyCustom _ -> Shelley.ShelleyCustom <$> parseShelleyCustomNetworkTag state.shelleyCustomNetworkTagInput
  network -> Right network

isShelleyCustomNetwork :: Shelley.ShelleyNetwork -> Boolean
isShelleyCustomNetwork = case _ of
  Shelley.ShelleyCustom _ -> true
  _ -> false

shelleyNetworkSummary :: State -> String
shelleyNetworkSummary state = case resolveShelleyNetwork state of
  Right network -> Shelley.shelleyNetworkLabel network
  Left err -> "Custom (" <> err <> ")"

legacyNetworkSummary :: State -> String
legacyNetworkSummary state = case resolveLegacyNetwork state of
  Right network -> Bootstrap.legacyNetworkLabel network
  Left err -> "Custom (" <> err <> ")"

inspectStatus :: Maybe (Either String Inspect.AddressInfo) -> String
inspectStatus = case _ of
  Nothing -> "idle"
  Just (Left _) -> "error"
  Just (Right info) -> "decoded: " <> info.addressStyle

derivationStatus :: Maybe (Either String Derivation.DerivedKeys) -> String
derivationStatus = case _ of
  Nothing -> "idle"
  Just (Left _) -> "error"
  Just (Right _) -> "derived"

invalidMnemonicResult :: RestoreFamily -> Maybe (Either String Derivation.DerivedKeys)
invalidMnemonicResult = case _ of
  RestoreShelley -> Just (Left "Mnemonic is invalid. Check the word list and checksum.")
  _ -> Nothing

invalidMnemonicAddressResult :: RestoreFamily -> Maybe (Either String String)
invalidMnemonicAddressResult = case _ of
  RestoreShelley -> Nothing
  _ -> Just (Left "Mnemonic is invalid. Check the word list and checksum.")

familyRestoreStatus :: Maybe (Either String String) -> String
familyRestoreStatus = case _ of
  Nothing -> "idle"
  Just (Left _) -> "error"
  Just (Right _) -> "derived"

signingStatus :: Maybe (Either String Signing.SignResult) -> String
signingStatus = case _ of
  Nothing -> "idle"
  Just (Left _) -> "error"
  Just (Right _) -> "signed"

verificationStatus :: Maybe (Either String Boolean) -> String
verificationStatus = case _ of
  Nothing -> "idle"
  Just (Left _) -> "error"
  Just (Right true) -> "valid"
  Just (Right false) -> "invalid"

mnemonicStatus :: Boolean -> String -> String
mnemonicStatus isVisible derivationInput =
  let
    words = normalizeMnemonicInput derivationInput
  in
    if length words == 0 then
      "empty"
    else if not isVisible then
      show (length words) <> " words loaded, hidden"
    else
      show (length words) <> " words loaded"

restoreFamilyLabel :: RestoreFamily -> String
restoreFamilyLabel = case _ of
  RestoreShelley -> "Shelley"
  RestoreIcarus -> "Icarus"
  RestoreByron -> "Byron"

restoreModeSummary :: RestoreFamily -> String
restoreModeSummary = case _ of
  RestoreShelley -> "Derive keys and build Shelley payment, base, and reward addresses from mnemonic"
  RestoreIcarus -> "Build a bootstrap address from mnemonic using Icarus semantics"
  RestoreByron -> "Build a bootstrap address from mnemonic using Byron semantics"

scriptInputModeLabel :: ScriptInputMode -> String
scriptInputModeLabel = case _ of
  ScriptInputCbor -> "Native script CBOR hex"
  ScriptInputJson -> "Native script JSON"
  ScriptInputTemplate -> "ScriptTemplate JSON"

scriptInputPlaceholder :: ScriptInputMode -> String
scriptInputPlaceholder = case _ of
  ScriptInputCbor -> "8200581c..."
  ScriptInputJson -> "{\"all\":[\"addr_vkh1...\",{\"active_from\":120}]}"
  ScriptInputTemplate -> "{\"cosigners\":{\"cosigner#0\":\"<xpub-hex>\"},\"template\":\"cosigner#0\"}"

signingPayloadPlaceholder :: Signing.PayloadMode -> String
signingPayloadPlaceholder = case _ of
  Signing.PayloadText -> "hello cardano"
  Signing.PayloadHex -> "deadbeef00ff11"

scriptOutputLabel :: ScriptInputMode -> String
scriptOutputLabel = case _ of
  ScriptInputTemplate -> "Template validation, canonical template JSON, and derived script details"
  _ -> "Hash, validation status, canonical JSON, and script preimage CBOR"

legacyStyleLabel :: Bootstrap.LegacyStyle -> String
legacyStyleLabel = case _ of
  Bootstrap.LegacyIcarus -> "Icarus"
  Bootstrap.LegacyByron -> "Byron"

legacyNetworkShortLabel :: Bootstrap.LegacyNetwork -> String
legacyNetworkShortLabel = case _ of
  Bootstrap.LegacyMainnet -> "Mainnet"
  Bootstrap.LegacyStaging -> "Staging"
  Bootstrap.LegacyTestnet -> "Testnet"
  Bootstrap.LegacyPreview -> "Preview"
  Bootstrap.LegacyPreprod -> "Preprod"
  Bootstrap.LegacyCustom magic -> "Custom " <> show magic

derivationPathSummary :: State -> String
derivationPathSummary state =
  "m / 1852' / 1815' / " <> state.accountIndexInput <> "' / "
    <> rolePathSegment state.derivationRole
    <> " / "
    <> state.addressIndexInput

restorePathSummary :: State -> String
restorePathSummary state = case state.restoreFamily of
  RestoreShelley -> derivationPathSummary state
  RestoreIcarus ->
    "m / 44' / 1815' / " <> state.accountIndexInput <> "' / "
      <> rolePathSegment (normalizeRoleForFamily RestoreIcarus state.derivationRole)
      <> " / "
      <> state.addressIndexInput
  RestoreByron ->
    "m / " <> state.accountIndexInput <> "' / " <> state.addressIndexInput

restoreOutputTitle :: RestoreFamily -> String
restoreOutputTitle = case _ of
  RestoreShelley -> "Derived addresses and keys"
  _ -> "Derived address"

familyUsesRole :: RestoreFamily -> Boolean
familyUsesRole = case _ of
  RestoreShelley -> true
  RestoreIcarus -> true
  RestoreByron -> false

familyUsesNetwork :: RestoreFamily -> Boolean
familyUsesNetwork = case _ of
  RestoreShelley -> false
  _ -> true

familyUsesCustomNetwork :: State -> Boolean
familyUsesCustomNetwork state =
  familyUsesNetwork state.restoreFamily && isLegacyCustomSelected state

rolesForFamily :: RestoreFamily -> Array Derivation.Role
rolesForFamily = case _ of
  RestoreShelley -> derivationRoles
  RestoreIcarus -> [ Derivation.UTxOExternal, Derivation.UTxOInternal ]
  RestoreByron -> []

normalizeRoleForFamily :: RestoreFamily -> Derivation.Role -> Derivation.Role
normalizeRoleForFamily family role = case family of
  RestoreShelley -> role
  RestoreIcarus -> case role of
    Derivation.Stake -> Derivation.UTxOExternal
    other -> other
  RestoreByron -> Derivation.UTxOExternal

icarusRoleFor :: Derivation.Role -> Bootstrap.IcarusRole
icarusRoleFor role = case normalizeRoleForFamily RestoreIcarus role of
  Derivation.UTxOExternal -> Bootstrap.IcarusExternal
  Derivation.UTxOInternal -> Bootstrap.IcarusInternal
  Derivation.Stake -> Bootstrap.IcarusExternal

rolePathSegment :: Derivation.Role -> String
rolePathSegment = case _ of
  Derivation.UTxOExternal -> "0"
  Derivation.UTxOInternal -> "1"
  Derivation.Stake -> "2"

normalizeIndexInput :: String -> String
normalizeIndexInput value = show (parseIndexInput value)

signingInputIsBlank :: Signing.PayloadMode -> String -> Boolean
signingInputIsBlank payloadMode value = case payloadMode of
  Signing.PayloadText -> String.trim value == ""
  Signing.PayloadHex -> normalizeHexInput value == ""

renderDerivationResult
  :: forall w
   . Boolean
  -> Maybe Derivation.DerivedKeys
  -> Maybe (Either String Derivation.DerivedKeys)
  -> HH.HTML w Action
renderDerivationResult isVisible previousKeys = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "No derivation run yet. Paste a mnemonic or reuse the generated phrase, then derive the pipeline." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right keys) ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "action-row") ]
          [ HH.button
              [ HP.class_ (HH.ClassName "secondary-btn")
              , HE.onClick \_ -> ToggleDerivedKeysVisibility
              ]
              [ HH.text (if isVisible then "Hide private keys" else "Show private keys") ]
          ]
      , renderDerivedSecretValue isVisible (hasChanged previousKeys _.rootKeyBech32 keys) "Root private key" keys.rootKeyBech32
      , renderDerivedSecretValue isVisible (hasChanged previousKeys _.accountKeyBech32 keys) "Account private key" keys.accountKeyBech32
      , renderDerivedSecretValue isVisible (hasChanged previousKeys _.addressKeyBech32 keys) "Address private key" keys.addressKeyBech32
      , renderDerivedPublicValue (hasChanged previousKeys _.addressPublicKeyBech32 keys) "Address public key" keys.addressPublicKeyBech32
      , renderDerivedSecretValue isVisible (hasChanged previousKeys _.stakeKeyBech32 keys) "Stake private key" keys.stakeKeyBech32
      , renderDerivedPublicValue (hasChanged previousKeys _.stakePublicKeyBech32 keys) "Stake public key" keys.stakePublicKeyBech32
      ]

hasChanged
  :: Maybe Derivation.DerivedKeys
  -> (Derivation.DerivedKeys -> String)
  -> Derivation.DerivedKeys
  -> Boolean
hasChanged previousKeys project currentKeys = case previousKeys of
  Nothing -> false
  Just oldKeys -> project oldKeys /= project currentKeys

renderDerivedSecretValue :: forall w. Boolean -> Boolean -> String -> String -> HH.HTML w Action
renderDerivedSecretValue isVisible changed label value =
  HH.div
    [ HP.class_ (HH.ClassName ("output-card" <> if changed then " changed" else "")) ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyValue value
                ]
                [ HH.text "Copy" ]
            ]
        ]
    , if not isVisible then
        HH.div
          [ HP.class_ (HH.ClassName "privacy-note") ]
          [ HH.p_ [ HH.text "Private key hidden for this card. Use Show or Copy." ] ]
      else
        HH.div
          [ HP.class_ (HH.ClassName "output-value")
          , HP.title value
          ]
          [ HH.text value ]
    ]

renderDerivedPublicValue :: forall w. Boolean -> String -> String -> HH.HTML w Action
renderDerivedPublicValue changed label value =
  HH.div
    [ HP.class_ (HH.ClassName ("output-card" <> if changed then " changed" else "")) ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyValue value
                ]
                [ HH.text "Copy" ]
            ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "output-value")
        , HP.title value
        ]
        [ HH.text value ]
    ]

renderShelleyRestoreResult
  :: forall w
   . Boolean
  -> Maybe Derivation.DerivedKeys
  -> Maybe (Either String Derivation.DerivedKeys)
  -> Maybe (Either String Shelley.ShelleyAddresses)
  -> HH.HTML w Action
renderShelleyRestoreResult showPrivateKeys previousKeys derivationResult shelleyAddressesResult = case derivationResult of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "No Shelley restore run yet. Paste a mnemonic to derive keys and build addresses." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right keys) ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      ( renderShelleyAddressSection shelleyAddressesResult
          <>
            [ HH.div
                [ HP.class_ (HH.ClassName "action-row") ]
                [ HH.button
                    [ HP.class_ (HH.ClassName "secondary-btn")
                    , HE.onClick \_ -> ToggleDerivedKeysVisibility
                    ]
                    [ HH.text (if showPrivateKeys then "Hide private keys" else "Show private keys") ]
                ]
            , renderDerivedSecretValueWithVaultAction
                showPrivateKeys
                (hasChanged previousKeys _.rootKeyBech32 keys)
                "Root private key"
                keys.rootKeyBech32
                "Push to stack"
                SaveShelleyRootKeyToVault
            , renderDerivedSecretValueWithVaultAction
                showPrivateKeys
                (hasChanged previousKeys _.accountKeyBech32 keys)
                "Account private key"
                keys.accountKeyBech32
                "Push to stack"
                SaveShelleyAccountKeyToVault
            , renderDerivedSecretValueWithVaultAction
                showPrivateKeys
                (hasChanged previousKeys _.addressKeyBech32 keys)
                "Address private key"
                keys.addressKeyBech32
                "Push to stack"
                SaveShelleyAddressKeyToVault
            , renderDerivedPublicValue (hasChanged previousKeys _.addressPublicKeyBech32 keys) "Address public key" keys.addressPublicKeyBech32
            , renderDerivedSecretValueWithVaultAction
                showPrivateKeys
                (hasChanged previousKeys _.stakeKeyBech32 keys)
                "Stake private key"
                keys.stakeKeyBech32
                "Push to stack"
                SaveShelleyStakeKeyToVault
            , renderDerivedPublicValue (hasChanged previousKeys _.stakePublicKeyBech32 keys) "Stake public key" keys.stakePublicKeyBech32
            ]
      )

renderDerivedSecretValueWithVaultAction :: forall w. Boolean -> Boolean -> String -> String -> String -> Action -> HH.HTML w Action
renderDerivedSecretValueWithVaultAction isVisible changed label value vaultActionLabel vaultAction =
  HH.div
    [ HP.class_ (HH.ClassName ("output-card" <> if changed then " changed" else "")) ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> vaultAction
                ]
                [ HH.text vaultActionLabel ]
            , HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyValue value
                ]
                [ HH.text "Copy" ]
            ]
        ]
    , if not isVisible then
        HH.div
          [ HP.class_ (HH.ClassName "privacy-note") ]
          [ HH.p_ [ HH.text "Private key hidden for this card. Use Show or Copy." ] ]
      else
        HH.div
          [ HP.class_ (HH.ClassName "output-value")
          , HP.title value
          ]
          [ HH.text value ]
    ]

renderShelleyAddressSection
  :: forall w
   . Maybe (Either String Shelley.ShelleyAddresses)
  -> Array (HH.HTML w Action)
renderShelleyAddressSection = case _ of
  Nothing ->
    []
  Just (Left err) ->
    [ HH.div
        [ HP.class_ (HH.ClassName "result-error") ]
        [ HH.text err ]
    ]
  Just (Right addresses) ->
    [ maybeAddressCard "Payment address" addresses.paymentAddressBech32
    , maybeAddressCard "Base address" addresses.delegationAddressBech32
    , addressCard "Reward address" addresses.rewardAddressBech32
    ]

maybeAddressCard :: forall w. String -> Maybe String -> HH.HTML w Action
maybeAddressCard label = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "output-card") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "output-meta") ]
          [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text label ] ]
      , HH.div
          [ HP.class_ (HH.ClassName "privacy-note") ]
          [ HH.p_ [ HH.text "Unavailable when the selected role does not derive a payment credential." ] ]
      ]
  Just value ->
    addressCard label value

addressCard :: forall w. String -> String -> HH.HTML w Action
addressCard label value =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyValue value
                ]
                [ HH.text "Copy" ]
            ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "output-value")
        , HP.title value
        ]
        [ HH.text value ]
    ]

renderFamilyRestoreResult :: forall w. Maybe (Either String String) -> HH.HTML w Action
renderFamilyRestoreResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Choose a family, paste a recovery phrase, and the browser will derive the matching address locally." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right address) ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "output-card") ]
          [ HH.div
              [ HP.class_ (HH.ClassName "output-meta") ]
              [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text "Base58 address" ]
              , HH.div
                  [ HP.class_ (HH.ClassName "output-actions") ]
                  [ HH.button
                      [ HP.class_ (HH.ClassName "secondary-btn")
                      , HE.onClick \_ -> CopyValue address
                      ]
                      [ HH.text "Copy" ]
                  ]
              ]
          , HH.div
              [ HP.class_ (HH.ClassName "output-value")
              , HP.title address
              ]
              [ HH.text address ]
          ]
      ]

renderSigningResult :: forall w. Maybe (Either String Signing.SignResult) -> HH.HTML w Action
renderSigningResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Paste a supported xsk key and a payload to derive a signature." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right result) ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ addressCard "Verification key" result.verificationKeyBech32
      , addressCard "Signature (hex)" result.signatureHex
      , addressCard "Payload bytes (hex)" result.payloadHex
      ]

renderVerificationResult :: forall w. Maybe (Either String Boolean) -> HH.HTML w Action
renderVerificationResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Provide a payload, xvk, and signature to verify them locally in the browser." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right true) ->
    HH.div
      [ HP.class_ (HH.ClassName "output-card") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "output-meta") ]
          [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text "Verification" ] ]
      , HH.div [ HP.class_ (HH.ClassName "output-value") ] [ HH.text "Valid signature" ]
      ]
  Just (Right false) ->
    HH.div
      [ HP.class_ (HH.ClassName "output-card") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "output-meta") ]
          [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text "Verification" ] ]
      , HH.div [ HP.class_ (HH.ClassName "output-value") ] [ HH.text "Invalid signature" ]
      ]

renderTxInlineStatus :: forall w. Maybe String -> HH.HTML w Action
renderTxInlineStatus = case _ of
  Nothing ->
    HH.text ""
  Just err ->
    HH.div [ HP.class_ (HH.ClassName "result-error") ] [ HH.text err ]

renderTxInspection :: forall w. State -> HH.HTML w Action
renderTxInspection state = case state.txInspectResult of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Inspect a transaction to load the decoder summary, IO previews, and ledger-shaped JSON browser." ]
      ]
  Just result ->
    let
      summary = TxJson.inspect result.stdout
    in
      if result.exitOk && summary.valid then
        HH.div
          [ HP.class_ (HH.ClassName "derivation-result") ]
          ( [ HH.div
                [ HP.class_ (HH.ClassName "result-grid") ]
                (map renderTxMetric summary.metrics)
            ]
              <> map renderTxOutputRow summary.outputs
              <> renderTxInputPreview "Inputs" summary.inputs summary.inputNote
              <> renderTxInputPreview "Reference inputs" summary.referenceInputs summary.inputNote
          )
      else
        HH.div
          [ HP.class_ (HH.ClassName "result-error") ]
          [ HH.text (if result.stderr == "" then "Transaction decode failed." else result.stderr) ]

renderTxIdentification :: forall w. State -> HH.HTML w Action
renderTxIdentification state = case state.txIdentification of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "Body hash, transaction id, fee, and witness counts appear here after inspection." ] ]
  Just identification ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "result-grid") ]
          (map renderTxIdentificationRow identification.primary)
      , HH.div
          [ HP.class_ (HH.ClassName "result-grid") ]
          (map renderTxIdentificationRow identification.witnesses)
      ]

renderTxIntentSummary :: forall w. State -> HH.HTML w Action
renderTxIntentSummary state = case state.txIntentSummary of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "Signer-oriented claims and visible transaction effects appear here after inspection." ] ]
  Just intent ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      ( [ HH.div
            [ HP.class_ (HH.ClassName "result-grid") ]
            (map renderTxMetric intent.metrics)
        ]
          <> map renderTxClaim intent.claims
          <> map renderTxWarning intent.warnings
          <> map renderTxWitnessPlanSection intent.sections
      )

renderTxWitnessPlan :: forall w. State -> HH.HTML w Action
renderTxWitnessPlan state = case state.txWitnessPlan of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "Required signers, present witnesses, and missing signer hashes appear here after inspection." ] ]
  Just witnessPlan ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      ( [ HH.div
            [ HP.class_ (HH.ClassName "result-grid") ]
            (map renderTxMetric witnessPlan.metrics)
        ]
          <> map renderTxWarning witnessPlan.warnings
          <> map renderTxWitnessPlanSection witnessPlan.sections
      )

renderTxBrowser :: forall w. State -> HH.HTML w Action
renderTxBrowser state = case state.txBrowser of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "Browse the decoded transaction tree after inspection." ] ]
  Just browser ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "action-row") ]
          (map renderTxBreadcrumb browser.breadcrumbs)
      , codeBlock browser.currentJson
      , HH.div
          [ HP.class_ (HH.ClassName "derivation-result") ]
          (map renderTxBrowserRow browser.rows)
      ]

renderTxMetric :: forall w. TxJson.Metric -> HH.HTML w Action
renderTxMetric metric =
  keyValue metric.label metric.value

renderTxOutputRow :: forall w. TxJson.OutputRow -> HH.HTML w Action
renderTxOutputRow row =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text ("Output " <> row.index) ] ]
    , HH.div
        [ HP.class_ (HH.ClassName "result-grid") ]
        [ keyValue "Address" row.address
        , keyValue "Lovelace" row.coin
        , keyValue "Assets" row.assets
        , keyValue "Datum" row.datum
        ]
    ]

renderTxInputPreview :: forall w. String -> Array String -> String -> Array (HH.HTML w Action)
renderTxInputPreview title rows note =
  if length rows == 0 then
    []
  else
    [ HH.div
        [ HP.class_ (HH.ClassName "output-card") ]
        [ HH.div
            [ HP.class_ (HH.ClassName "output-meta") ]
            [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text title ] ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-value") ]
            [ HH.text (joinWith "\n" rows) ]
        , if note == "" then HH.text "" else HH.div [ HP.class_ (HH.ClassName "privacy-note") ] [ HH.p_ [ HH.text note ] ]
        ]
    ]

renderTxIdentificationRow :: forall w. TxJson.IdentificationRow -> HH.HTML w Action
renderTxIdentificationRow row =
  keyValue row.label row.value

renderTxClaim :: forall w. TxJson.IntentClaim -> HH.HTML w Action
renderTxClaim claim =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text claim.label ] ]
    , HH.div [ HP.class_ (HH.ClassName "output-value") ] [ HH.text claim.value ]
    , if claim.detail == "" then HH.text "" else HH.div [ HP.class_ (HH.ClassName "privacy-note") ] [ HH.p_ [ HH.text claim.detail ] ]
    ]

renderTxWarning :: forall w. String -> HH.HTML w Action
renderTxWarning warningText =
  HH.div
    [ HP.class_ (HH.ClassName "result-error") ]
    [ HH.text warningText ]

renderTxWitnessPlanSection :: forall w. TxJson.WitnessPlanSection -> HH.HTML w Action
renderTxWitnessPlanSection section =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text section.title ] ]
    , if length section.rows == 0 then
        HH.div [ HP.class_ (HH.ClassName "privacy-note") ] [ HH.p_ [ HH.text section.empty ] ]
      else
        HH.div
          [ HP.class_ (HH.ClassName "derivation-result") ]
          (map renderTxWitnessPlanRow section.rows)
    ]

renderTxWitnessPlanRow :: forall w. TxJson.WitnessPlanRow -> HH.HTML w Action
renderTxWitnessPlanRow row =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text row.label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyValue row.copyValue
                ]
                [ HH.text "Copy" ]
            ]
        ]
    , HH.div [ HP.class_ (HH.ClassName "output-value") ] [ HH.text row.value ]
    , if row.detail == "" then HH.text "" else HH.div [ HP.class_ (HH.ClassName "privacy-note") ] [ HH.p_ [ HH.text row.detail ] ]
    ]

renderTxBreadcrumb :: forall w. TxJson.Breadcrumb -> HH.HTML w Action
renderTxBreadcrumb crumb =
  HH.button
    [ HP.class_ (HH.ClassName "secondary-btn")
    , HE.onClick \_ -> BrowseTxPath crumb.path
    ]
    [ HH.text crumb.label ]

renderTxBrowserRow :: forall w. TxJson.BrowserRow -> HH.HTML w Action
renderTxBrowserRow row =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text row.label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> CopyValue row.copyValue
                ]
                [ HH.text "Copy" ]
            , if row.canDive then
                HH.button
                  [ HP.class_ (HH.ClassName "secondary-btn")
                  , HE.onClick \_ -> BrowseTxPath row.path
                  ]
                  [ HH.text "Open" ]
              else
                HH.text ""
            ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "result-grid") ]
        [ keyValue "Kind" row.kind
        , keyValue "Summary" row.summary
        ]
    ]

renderTxSigningResult :: forall w. State -> HH.HTML w Action
renderTxSigningResult state = case state.txSigningResult of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "Inspect a transaction, load a body hash, and produce a signed transaction artifact here." ] ]
  Just (Left err) ->
    HH.div [ HP.class_ (HH.ClassName "result-error") ] [ HH.text err ]
  Just (Right result) ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ addressCard "Signer hash" result.signerHashHex
      , addressCard "Patch action" result.witnessPatchAction
      , addressCard "Verification key" result.verificationKeyBech32
      , addressCard "Signature (hex)" result.signatureHex
      , addressCard "VKey witness CBOR" result.vkeyWitnessCborHex
      , addressCard "Signed transaction CBOR" result.signedTxCborHex
      ]

renderScriptAnalysisResult :: forall w. Maybe (Either String Script.ScriptAnalysis) -> HH.HTML w Action
renderScriptAnalysisResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Paste native script CBOR or JSON to see the derived policy hash, canonical JSON, and script preimage." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right result) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-grid") ]
      ( [ keyValue "Script type" result.scriptType
        , keyValue "Validation" result.validationStatus
        , keyValue "Hash hex" result.hashHex
        , keyValue "Hash bech32" result.hashBech32
        , keyValue "Canonical JSON" result.canonicalJson
        , keyValue "Script preimage (CBOR hex)" result.canonicalCborHex
        ]
          <> map renderScriptIssue result.issues
      )

renderScriptIssue :: forall w. Script.ValidationIssue -> HH.HTML w Action
renderScriptIssue issue =
  keyValue
    ("Issue (" <> issue.level <> " / " <> issue.code <> ")")
    issue.message

renderScriptTemplateAnalysisResult :: forall w. Maybe (Either String Script.ScriptTemplateAnalysis) -> HH.HTML w Action
renderScriptTemplateAnalysisResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Paste ScriptTemplate JSON to validate cosigners, normalize the template, and derive the underlying native script." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right result) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-grid") ]
      ( [ keyValue "Template validation" result.templateValidationStatus
        , keyValue "Canonical template JSON" result.canonicalTemplateJson
        ]
          <> map renderScriptIssue result.templateIssues
          <>
            if result.hasDerivedScript then
              [ keyValue "Derived script type" result.derivedScript.scriptType
              , keyValue "Derived validation" result.derivedScript.validationStatus
              , keyValue "Derived hash hex" result.derivedScript.hashHex
              , keyValue "Derived hash bech32" result.derivedScript.hashBech32
              , keyValue "Derived canonical JSON" result.derivedScript.canonicalJson
              , keyValue "Derived script preimage (CBOR hex)" result.derivedScript.canonicalCborHex
              ]
                <> map renderScriptIssue result.derivedScript.issues
            else
              [ keyValue "Derived script" "Unavailable until the template validates." ]
      )

renderLegacyResult :: forall w. Maybe (Either String String) -> HH.HTML w Action
renderLegacyResult = case _ of
  Nothing ->
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_
          [ HH.text "Paste an addr_xvk to start. Byron additionally needs a root_xvk and a path like 0H/14." ]
      ]
  Just (Left err) ->
    HH.div
      [ HP.class_ (HH.ClassName "result-error") ]
      [ HH.text err ]
  Just (Right address) ->
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      [ HH.div
          [ HP.class_ (HH.ClassName "output-card") ]
          [ HH.div
              [ HP.class_ (HH.ClassName "output-meta") ]
              [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text "Base58 bootstrap address" ]
              , HH.div
                  [ HP.class_ (HH.ClassName "output-actions") ]
                  [ HH.button
                      [ HP.class_ (HH.ClassName "secondary-btn")
                      , HE.onClick \_ -> CopyValue address
                      ]
                      [ HH.text "Copy" ]
                  ]
              ]
          , HH.div
              [ HP.class_ (HH.ClassName "output-value")
              , HP.title address
              ]
              [ HH.text address ]
          ]
      ]

renderVaultInlineStatus :: forall w. State -> HH.HTML w Action
renderVaultInlineStatus state = case state.vaultErrorMessage, state.vaultStatusMessage of
  Just err, _ ->
    HH.div [ HP.class_ (HH.ClassName "result-error") ] [ HH.text err ]
  Nothing, Just messageText ->
    HH.div [ HP.class_ (HH.ClassName "privacy-note") ] [ HH.p_ [ HH.text messageText ] ]
  Nothing, Nothing ->
    HH.text ""

renderVaultMnemonicShelf :: forall w. State -> HH.HTML w Action
renderVaultMnemonicShelf state =
  let
    entries = stackEntries (vaultEntriesForKinds restoreAcceptedKinds state.vaultEntries)
  in
    if not state.vaultUnlocked then
      HH.div
        [ HP.class_ (HH.ClassName "privacy-note") ]
        [ HH.p_ [ HH.text "Unlock a vault to reuse stored recovery phrases without copy and paste." ] ]
    else if length entries == 0 then
      HH.div
        [ HP.class_ (HH.ClassName "privacy-note") ]
        [ HH.p_ [ HH.text "No mnemonic entries in the unlocked vault yet." ] ]
    else
      HH.div_
        [ renderVaultAcceptanceNote "Accepts" restoreAcceptedKinds
        , HH.div
            [ HP.class_ (HH.ClassName "vault-shelf") ]
            (map renderRestoreVaultEntry entries)
        ]

renderVaultSigningShelf :: forall w. State -> HH.HTML w Action
renderVaultSigningShelf state =
  let
    entries = stackEntries (vaultEntriesForKinds signingAcceptedKinds state.vaultEntries)
  in
    if not state.vaultUnlocked then
      HH.div
        [ HP.class_ (HH.ClassName "privacy-note") ]
        [ HH.p_ [ HH.text "Unlock a vault to load signing keys directly into this tool." ] ]
    else if length entries == 0 then
      HH.div
        [ HP.class_ (HH.ClassName "privacy-note") ]
        [ HH.p_ [ HH.text "No signing-compatible entries in the unlocked vault yet. Push a root, account, address, stake, or explicit signing key into the stack." ] ]
    else
      HH.div_
        [ renderVaultAcceptanceNote "Accepts" signingAcceptedKinds
        , HH.div
            [ HP.class_ (HH.ClassName "vault-shelf") ]
            (map renderSigningVaultEntry entries)
        ]

renderTxCredentialVaultShelf :: forall w. State -> HH.HTML w Action
renderTxCredentialVaultShelf state =
  let
    acceptedKinds = txCredentialAcceptedKinds state.txProvider
    entries = stackEntries (vaultEntriesForKinds acceptedKinds state.vaultEntries)
  in
    if not state.vaultUnlocked then
      HH.div
        [ HP.class_ (HH.ClassName "privacy-note") ]
        [ HH.p_ [ HH.text "Unlock a vault to load provider credentials directly into transaction inspection." ] ]
    else if length entries == 0 then
      HH.div
        [ HP.class_ (HH.ClassName "privacy-note") ]
        [ HH.p_ [ HH.text ("No " <> txCredentialLabel state.txProvider <> " entries in the unlocked vault yet.") ] ]
    else
      HH.div_
        [ renderVaultAcceptanceNote "Accepts" acceptedKinds
        , HH.div
            [ HP.class_ (HH.ClassName "vault-shelf") ]
            (map renderTxCredentialVaultEntry entries)
        ]

renderVaultEntries :: forall w. State -> HH.HTML w Action
renderVaultEntries state =
  if not state.vaultUnlocked then
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "Create or unlock a vault to inspect its entries." ] ]
  else if length state.vaultEntries == 0 then
    HH.div
      [ HP.class_ (HH.ClassName "empty-state") ]
      [ HH.p_ [ HH.text "The unlocked vault is empty. Save a mnemonic, signing key, or provider credential from the feature pages." ] ]
  else
    HH.div
      [ HP.class_ (HH.ClassName "derivation-result") ]
      (map renderVaultEntryCard (stackEntries state.vaultEntries))

renderVaultEntryCard :: forall w. Vault.VaultEntry -> HH.HTML w Action
renderVaultEntryCard entry =
  HH.div
    [ HP.class_ (HH.ClassName "output-card") ]
    [ HH.div
        [ HP.class_ (HH.ClassName "output-meta") ]
        [ HH.h4 [ HP.class_ (HH.ClassName "roadmap-title") ] [ HH.text entry.label ]
        , HH.div
            [ HP.class_ (HH.ClassName "output-actions") ]
            [ HH.button
                [ HP.class_ (HH.ClassName "secondary-btn")
                , HE.onClick \_ -> DeleteVaultEntry entry.id
                ]
                [ HH.text "Delete" ]
            ]
        ]
    , HH.div [ HP.class_ (HH.ClassName "result-grid") ]
        [ keyValue "Kind" (vaultEntryKindLabel entry.kind)
        , keyValue "Created" entry.createdAt
        ]
    ]

renderRestoreVaultEntry :: forall w. Vault.VaultEntry -> HH.HTML w Action
renderRestoreVaultEntry entry =
  HH.div
    [ HP.class_ (HH.ClassName "vault-entry") ]
    [ HH.div_
        [ HH.strong_ [ HH.text entry.label ]
        , HH.p [ HP.class_ (HH.ClassName "sidebar-kicker") ] [ HH.text (vaultEntryKindLabel entry.kind) ]
        , HH.p [ HP.class_ (HH.ClassName "sidebar-copy") ] [ HH.text entry.createdAt ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "output-actions") ]
        [ HH.button
            [ HP.class_ (HH.ClassName "secondary-btn")
            , HE.onClick \_ -> UseVaultEntryInRestore entry.id
            ]
            [ HH.text "Peek" ]
        , HH.button
            [ HP.class_ (HH.ClassName "secondary-btn")
            , HE.onClick \_ -> PopVaultEntryInRestore entry.id
            ]
            [ HH.text "Pop" ]
        ]
    ]

renderSigningVaultEntry :: forall w. Vault.VaultEntry -> HH.HTML w Action
renderSigningVaultEntry entry =
  HH.div
    [ HP.class_ (HH.ClassName "vault-entry") ]
    [ HH.div_
        [ HH.strong_ [ HH.text entry.label ]
        , HH.p [ HP.class_ (HH.ClassName "sidebar-kicker") ] [ HH.text (vaultEntryKindLabel entry.kind) ]
        , HH.p [ HP.class_ (HH.ClassName "sidebar-copy") ] [ HH.text entry.createdAt ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "output-actions") ]
        [ HH.button
            [ HP.class_ (HH.ClassName "secondary-btn")
            , HE.onClick \_ -> UseVaultEntryInSigning entry.id
            ]
            [ HH.text "Peek" ]
        , HH.button
            [ HP.class_ (HH.ClassName "secondary-btn")
            , HE.onClick \_ -> PopVaultEntryInSigning entry.id
            ]
            [ HH.text "Pop" ]
        ]
    ]

renderTxCredentialVaultEntry :: forall w. Vault.VaultEntry -> HH.HTML w Action
renderTxCredentialVaultEntry entry =
  HH.div
    [ HP.class_ (HH.ClassName "vault-entry") ]
    [ HH.div_
        [ HH.strong_ [ HH.text entry.label ]
        , HH.p [ HP.class_ (HH.ClassName "sidebar-kicker") ] [ HH.text (vaultEntryKindLabel entry.kind) ]
        , HH.p [ HP.class_ (HH.ClassName "sidebar-copy") ] [ HH.text entry.createdAt ]
        ]
    , HH.div
        [ HP.class_ (HH.ClassName "output-actions") ]
        [ HH.button
            [ HP.class_ (HH.ClassName "secondary-btn")
            , HE.onClick \_ -> UseVaultEntryInTransactions entry.id
            ]
            [ HH.text "Peek" ]
        , HH.button
            [ HP.class_ (HH.ClassName "secondary-btn")
            , HE.onClick \_ -> PopVaultEntryInTransactions entry.id
            ]
            [ HH.text "Pop" ]
        ]
    ]

lookupVaultEntry :: String -> Array Vault.VaultEntry -> Maybe Vault.VaultEntry
lookupVaultEntry entryId entries = case uncons (filter (\entry -> entry.id == entryId) entries) of
  Nothing -> Nothing
  Just { head } -> Just head

type VaultKindTag = String

restoreAcceptedKinds :: Array VaultKindTag
restoreAcceptedKinds =
  [ Vault.kindTag Vault.VaultMnemonic
  ]

signingAcceptedKinds :: Array VaultKindTag
signingAcceptedKinds =
  [ Vault.kindTag Vault.VaultSigningKey
  , Vault.kindTag Vault.VaultRootPrivateKey
  , Vault.kindTag Vault.VaultAccountPrivateKey
  , Vault.kindTag Vault.VaultAddressPrivateKey
  , Vault.kindTag Vault.VaultStakePrivateKey
  ]

txCredentialAcceptedKinds :: TxProvider.Provider -> Array VaultKindTag
txCredentialAcceptedKinds = case _ of
  TxProvider.Blockfrost -> [ Vault.kindTag Vault.VaultBlockfrostProjectId ]
  TxProvider.Koios -> [ Vault.kindTag Vault.VaultKoiosBearerToken ]

vaultEntriesForKinds :: Array VaultKindTag -> Array Vault.VaultEntry -> Array Vault.VaultEntry
vaultEntriesForKinds acceptedKinds =
  filter (acceptsVaultEntry acceptedKinds)

acceptsVaultEntry :: Array VaultKindTag -> Vault.VaultEntry -> Boolean
acceptsVaultEntry acceptedKinds entry =
  length (filter (_ == entry.kind) acceptedKinds) > 0

renderVaultAcceptanceNote :: forall w. String -> Array VaultKindTag -> HH.HTML w Action
renderVaultAcceptanceNote prefix acceptedKinds =
  HH.div
    [ HP.class_ (HH.ClassName "privacy-note") ]
    [ HH.p_
        [ HH.text (prefix <> ": " <> joinWith ", " (map vaultEntryKindLabel acceptedKinds)) ]
    ]

vaultEntryKindLabel :: String -> String
vaultEntryKindLabel kind
  | kind == Vault.kindTag Vault.VaultMnemonic = Vault.labelForKind Vault.VaultMnemonic
  | kind == Vault.kindTag Vault.VaultSigningKey = Vault.labelForKind Vault.VaultSigningKey
  | kind == Vault.kindTag Vault.VaultRootPrivateKey = Vault.labelForKind Vault.VaultRootPrivateKey
  | kind == Vault.kindTag Vault.VaultAccountPrivateKey = Vault.labelForKind Vault.VaultAccountPrivateKey
  | kind == Vault.kindTag Vault.VaultAddressPrivateKey = Vault.labelForKind Vault.VaultAddressPrivateKey
  | kind == Vault.kindTag Vault.VaultStakePrivateKey = Vault.labelForKind Vault.VaultStakePrivateKey
  | kind == Vault.kindTag Vault.VaultBlockfrostProjectId = Vault.labelForKind Vault.VaultBlockfrostProjectId
  | kind == Vault.kindTag Vault.VaultKoiosBearerToken = Vault.labelForKind Vault.VaultKoiosBearerToken
  | otherwise = kind

normalizedEntryLabel :: String -> String -> String
normalizedEntryLabel customLabel fallbackLabel =
  let
    trimmed = String.trim customLabel
  in
    if trimmed == "" then fallbackLabel else trimmed

stackEntries :: Array Vault.VaultEntry -> Array Vault.VaultEntry
stackEntries = reverse

shelleyRootKeyLabel :: State -> String
shelleyRootKeyLabel _ = "Shelley root private key"

shelleyAccountKeyLabel :: State -> String
shelleyAccountKeyLabel state = "Shelley account " <> normalizeIndexInput state.accountIndexInput <> " private key"

shelleyAddressKeyLabel :: State -> String
shelleyAddressKeyLabel state =
  "Shelley "
    <> rolePathLabel state.derivationRole
    <> " address "
    <> normalizeIndexInput state.addressIndexInput
    <> " private key"

shelleyStakeKeyLabel :: State -> String
shelleyStakeKeyLabel state = "Shelley account " <> normalizeIndexInput state.accountIndexInput <> " stake private key"

txCredentialVaultKind :: TxProvider.Provider -> Vault.VaultKind
txCredentialVaultKind = case _ of
  TxProvider.Blockfrost -> Vault.VaultBlockfrostProjectId
  TxProvider.Koios -> Vault.VaultKoiosBearerToken

txCredentialDefaultVaultLabel :: TxProvider.Provider -> String
txCredentialDefaultVaultLabel provider = Vault.labelForKind (txCredentialVaultKind provider)

rolePathLabel :: Derivation.Role -> String
rolePathLabel role = case role of
  Derivation.UTxOExternal -> "external"
  Derivation.UTxOInternal -> "internal"
  Derivation.Stake -> "stake"

defaultVaultFileName :: String
defaultVaultFileName = "cardano-swiss-knife.vault.json"

vaultStateLabel :: State -> String
vaultStateLabel state
  | state.vaultUnlocked && state.vaultDirty = "Unlocked, modified in memory"
  | state.vaultUnlocked = "Unlocked"
  | otherwise = "Locked"

resetTxInspectorState :: State -> State
resetTxInspectorState state =
  state
    { txRunning = false
    , txSigningRunning = false
    , txCbor = Nothing
    , txInspectResult = Nothing
    , txIdentification = Nothing
    , txIntentSummary = Nothing
    , txWitnessPlan = Nothing
    , txBrowser = Nothing
    , txErrorMessage = Nothing
    , txSigningResult = Nothing
    }

txProviderCredential :: State -> String
txProviderCredential state = case state.txProvider of
  TxProvider.Blockfrost -> state.txBlockfrostKey
  TxProvider.Koios -> state.txKoiosBearer

setTxProviderCredentialValue :: TxProvider.Provider -> String -> State -> State
setTxProviderCredentialValue provider value state = case provider of
  TxProvider.Blockfrost -> state { txBlockfrostKey = value }
  TxProvider.Koios -> state { txKoiosBearer = value }

txBodyHash :: State -> Maybe String
txBodyHash state = do
  identification <- state.txIdentification
  row <- lookupIdentificationRow "[\"identification\",\"body_hash\"]" identification.primary
  pure row.copyValue

lookupIdentificationRow :: String -> Array TxJson.IdentificationRow -> Maybe TxJson.IdentificationRow
lookupIdentificationRow targetPath rows =
  case uncons (filter (\row -> row.path == targetPath) rows) of
    Nothing -> Nothing
    Just { head } -> Just head

txBodyHashLabel :: State -> String
txBodyHashLabel state = case txBodyHash state of
  Just bodyHashHex -> bodyHashHex
  Nothing -> "Inspect a transaction first"

txSigningMatchLabel :: State -> String
txSigningMatchLabel state = case state.txSigningResult of
  Just (Right result) ->
    txSignerMatchStatus result.signerHashHex state.txWitnessPlan
  _ ->
    "No witness material yet"

txSignerMatchStatus :: String -> Maybe TxJson.WitnessPlan -> String
txSignerMatchStatus signerHashHex maybePlan = case maybePlan of
  Nothing ->
    "Witness plan unavailable"
  Just plan ->
    if witnessPlanContainsHash "Missing declared signers" signerHashHex plan then
      "Matches a missing required signer"
    else if witnessPlanContainsHash "Required signers" signerHashHex plan then
      "Matches a declared required signer"
    else if witnessPlanContainsHash "Present vkey witnesses" signerHashHex plan || witnessPlanContainsHash "Present bootstrap witnesses" signerHashHex plan then
      "Already present in the witness set"
    else
      "Signer hash not referenced by the current witness plan"

witnessPlanContainsHash :: String -> String -> TxJson.WitnessPlan -> Boolean
witnessPlanContainsHash title signerHashHex plan =
  length
    ( filter
        (\section -> section.title == title)
        plan.sections
    )
    > 0
    &&
      length
        ( filter
            (\row -> row.copyValue == signerHashHex)
            (joinWitnessRows title plan.sections)
        )
        > 0

joinWitnessRows :: String -> Array TxJson.WitnessPlanSection -> Array TxJson.WitnessPlanRow
joinWitnessRows title sections =
  case uncons (filter (\section -> section.title == title) sections) of
    Nothing -> []
    Just { head } -> head.rows

type NavItem =
  { page :: Page
  , label :: String
  , note :: String
  }

navItems :: Array NavItem
navItems =
  [ { page: Overview, label: "Overview", note: "Workspace health" }
  , { page: Inspect, label: "Inspect", note: "Decode addresses" }
  , { page: Mnemonic, label: "Mnemonic", note: "Generate and hand off" }
  , { page: Derivation, label: "Restore", note: "Choose family first" }
  , { page: Legacy, label: "Expert", note: "Manual bootstrap xpubs" }
  , { page: Signing, label: "Signing", note: "Sign and verify" }
  , { page: Transactions, label: "Transactions", note: "Inspect and sign" }
  , { page: Scripts, label: "Scripts", note: "Hash native scripts" }
  , { page: Vault, label: "Vault", note: "Encrypted file storage" }
  , { page: Library, label: "Library", note: "Reusable exports" }
  ]

pageTitle :: Page -> String
pageTitle = case _ of
  Overview -> "Project Overview"
  Inspect -> "Address Inspection"
  Mnemonic -> "Mnemonic Tools"
  Derivation -> "Restore And Build"
  Legacy -> "Manual Bootstrap Construction"
  Signing -> "Signing Tools"
  Transactions -> "Transaction Workbench"
  Scripts -> "Native Scripts"
  Vault -> "Encrypted Vault"
  Library -> "Library Surface"
