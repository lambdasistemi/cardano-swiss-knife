module Main (main) where

import Prelude

import Cardano.Address.Bootstrap as Bootstrap
import Cardano.Address.Derivation as Derivation
import Cardano.Address.Shelley as Shelley
import Cardano.Address.Signing as Signing
import Cardano.Address.Script as Script
import Cardano.Mnemonic as Mnemonic
import Control.Promise (Promise, toAff)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), Replacement(..), joinWith, replaceAll, split, trim) as String
import Data.String.CodeUnits as StringCodeUnits
import Data.String.Regex as Regex
import Data.String.Regex.Flags (global, unicode)
import Data.String.Regex.Unsafe (unsafeRegex)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Aff.Class (class MonadAff)
import Effect.Class (liftEffect)
import Effect.Exception (message)
import Examples as Examples
import FFI.Blockfrost (Network(..), networkName)
import FFI.BookStore as BookStore
import FFI.Clipboard (copy) as Clipboard
import FFI.Inspector (InspectorResult, runLedgerOperation)
import FFI.Json (Browser, Identification, IntentSummary, RdfGraph, Validation, WitnessPlan, inspect, operationArgsMerged, operationArgsWithPath, operationBrowser, operationIdentification, operationInspection, operationIntentSummary, operationRdfGraph, operationValidation, operationWitnessPlan, pretty, providerResolutionErrorArgs) as Json
import FFI.OverlayBook as OverlayBook
import FFI.RdfShapes as RdfShapes
import FFI.Storage as Storage
import Provider (Provider(..))
import Provider as Provider
import Routing (Route(..))
import Routing as Routing
import Shell as Shell
import Theme as Theme
import TxSigning as TxSigning
import Vault as Vault
import Halogen as H
import Halogen.Aff as HA
import Halogen.HTML as HH
import Halogen.HTML.Events as HE
import Halogen.HTML.Properties as HP
import Halogen.VDom.Driver (runUI)
import Rdf.Editor as RdfEditor
import Type.Proxy (Proxy(..))
import Unsafe.Coerce (unsafeCoerce)
import Web.Event.Event as Event
import Web.DOM.ParentNode (QuerySelector(..))
import Web.HTML (window)
import Web.HTML.Window as Window
import Web.UIEvent.MouseEvent (MouseEvent)
import Web.UIEvent.MouseEvent as MouseEvent

providerKey :: String
providerKey = "provider"

networkKey :: String
networkKey = "network"

main :: Effect Unit
main = HA.runHalogenAff do
  liftEffect do
    Storage.removeItem "blockfrost_project_id"
    Storage.removeItem "koios_bearer_token"
    Storage.removeItem "persist_api_keys"
  body    <- HA.awaitBody
  app     <- HA.selectElement (QuerySelector "#app")
  prov <- liftEffect (Storage.getItem providerKey)
  net  <- liftEffect (Storage.getItem networkKey)
  route <- liftEffect Routing.currentRoute
  routeBase <- liftEffect Routing.currentBasePath
  theme <- liftEffect Shell.initialTheme
  bookStore <- liftEffect BookStore.load
  let initialProv = case prov of
        "Koios"      -> Koios
        _            -> Blockfrost
      initialNetwork = case net of
        "preprod" -> Preprod
        "preview" -> Preview
        _         -> Mainnet
      mountTarget = case app of
        Just el -> el
        Nothing -> body
  runUI
    ( inspectorComponent
        { prov: initialProv
        , network: initialNetwork
        , route
        , routeBase
        , theme
        , books: bookStore.books
        }
    ) unit mountTarget

data Mode = ByHash | ByHex

derive instance eqMode :: Eq Mode

data ResultTab = StructureTab | WitnessTab | ValidationTab | GraphRdfTab

derive instance eqResultTab :: Eq ResultTab

data ValidationFilter = ValidationAll | ValidationPassed | ValidationWarnings | ValidationViolations

derive instance eqValidationFilter :: Eq ValidationFilter

data ValidationTone = ValidationPass | ValidationWarn | ValidationFail

derive instance eqValidationTone :: Eq ValidationTone

data ScriptInputMode = ScriptInputCbor | ScriptInputJson | ScriptInputTemplate

derive instance eqScriptInputMode :: Eq ScriptInputMode

data KeyTab = KeyMnemonic | KeyRestore | KeyExpert | KeySigning

derive instance eqKeyTab :: Eq KeyTab

data RestoreFamily = RestoreShelley | RestoreIcarus | RestoreByron

derive instance eqRestoreFamily :: Eq RestoreFamily

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
  , extraDetails :: Array { label :: String, value :: String }
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
  , extraDetails :: Array { label :: String, value :: String }
  }

inspectAddressWithSharedWasm :: String -> Aff AddressInfo
inspectAddressWithSharedWasm value = do
  browserWindow <- liftEffect window
  let
    browser = unsafeCoerce browserWindow
      :: { inspectCardanoAddress :: String -> Promise RawAddressInfo }
  raw <- toAff (browser.inspectCardanoAddress value)
  pure
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

type State =
  { provider :: Provider
  , blockfrostKey :: String
  , koiosBearer :: String
  , mode :: Mode
  , network :: Network
  , txHash :: String
  , txHex :: String
  , result :: Maybe InspectorResult
  , loadFormExpanded :: Boolean
  , resultTab :: ResultTab
  , txCbor :: Maybe String
  , operationArgs :: String
  , browser :: Maybe Json.Browser
  , identification :: Maybe Json.Identification
  , intent :: Maybe Json.IntentSummary
  , witnessPlan :: Maybe Json.WitnessPlan
  , txSigningKeyInput :: String
  , showTxSigningKey :: Boolean
  , txSigningRunning :: Boolean
  , txSigningResult :: Maybe (Either String TxSigning.WitnessMaterial)
  , validation :: Maybe Json.Validation
  , rdf :: Maybe Json.RdfGraph
  , sparqlLens :: Maybe SparqlLens
  , resolvedLabelsLens :: Maybe ResolvedLabelsLens
  , typedFieldsLens :: Maybe TypedFieldsLens
  , decodedTreeLens :: Maybe DecodedTreeLens
  , shaclConformance :: Maybe ShaclConformance
  , books :: Array BookStore.Book
  , bookNameEdits :: Array BookNameEdit
  , annotationDraft :: Maybe AnnotationDraft
  , libraryInput :: String
  , libraryUrl :: String
  , libraryError :: Maybe String
  , libraryStatus :: Maybe String
  , browserNodes :: Array BrowserNode
  , expandedPaths :: Array String
  , decodedTreeExpanded :: Array String
  , decodedEmptyExpanded :: Array String
  , decodedResolutionsExpanded :: Boolean
  , decodedRowStyle :: String
  , decodedBytesExpanded :: Boolean
  , validationFilter :: ValidationFilter
  , running :: Boolean
  , copied :: Boolean
  , copiedPath :: Maybe String
  , browserPath :: String
  , fetchError :: Maybe String
  , addressInput :: String
  , addressResult :: Maybe (Either String AddressInfo)
  , scriptInputMode :: ScriptInputMode
  , scriptInput :: String
  , scriptResult :: Maybe (Either String Script.ScriptAnalysis)
  , scriptTemplateResult :: Maybe (Either String Script.ScriptTemplateAnalysis)
  , keyTab :: KeyTab
  , mnemonicWordCount :: Int
  , generatedMnemonic :: Maybe (Array String)
  , showGeneratedMnemonic :: Boolean
  , showRestorePhrase :: Boolean
  , showDerivedKeys :: Boolean
  , restorePhrase :: String
  , restoreFamily :: RestoreFamily
  , shelleyNetwork :: Shelley.ShelleyNetwork
  , shelleyCustomNetworkTagInput :: String
  , accountIndexInput :: String
  , addressIndexInput :: String
  , derivationRole :: Derivation.Role
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
  , showSigningKey :: Boolean
  , signingKeyInput :: String
  , signingResult :: Maybe (Either String Signing.SignResult)
  , verifyPayloadMode :: Signing.PayloadMode
  , verifyPayloadInput :: String
  , verificationKeyInput :: String
  , signatureInput :: String
  , verificationResult :: Maybe (Either String Boolean)
  , vaultPassphraseInput :: String
  , showVaultPassphrase :: Boolean
  , vaultFileName :: String
  , vaultUnlocked :: Boolean
  , vaultEntries :: Array Vault.VaultEntry
  , vaultDirty :: Boolean
  , vaultStatusMessage :: Maybe String
  , vaultErrorMessage :: Maybe String
  , mnemonicVaultLabelInput :: String
  , restoreVaultLabelInput :: String
  , signingVaultLabelInput :: String
  , providerVaultLabelInput :: String
  , route :: Route
  , routeBase :: String
  , theme :: Theme.Theme
  }

type BrowserNode =
  { path :: String
  , browser :: Json.Browser
  }

type SparqlLens =
  { rows :: Array RdfShapes.TransactionOutputRow
  , error :: Maybe String
  }

type ResolvedLabelsLens =
  { rows :: Array RdfShapes.ResolvedLabelRow
  , error :: Maybe String
  }

type ResolutionEntry =
  { label :: String
  , identifier :: String
  , candidates :: Array String
  }

type TypedFieldsLens =
  { rows :: Array RdfShapes.TypedFieldRow
  , error :: Maybe String
  }

type DecodedTreeLens =
  { rows :: Array RdfShapes.DecodedTreeRow
  , error :: Maybe String
  }

type ShaclConformance =
  { shapeLabels :: Array String
  , report :: Maybe RdfShapes.ShaclReport
  , error :: Maybe String
  }

type BookNameEdit =
  { id :: String
  , name :: String
  }

type AnnotationDraft =
  { rowId :: String
  , label :: String
  , typeName :: String
  , mode :: String
  , bookId :: String
  , newBookName :: String
  , error :: Maybe String
  }

type InitialKeys =
  { prov :: Provider
  , network :: Network
  , route :: Route
  , routeBase :: String
  , theme :: Theme.Theme
  , books :: Array BookStore.Book
  }

data Action
  = Initialize
  | SetBlockfrostKey String
  | SetKoiosBearer String
  | SelectProvider Provider
  | SelectMode Mode
  | SelectNetwork Network
  | SetTxHash String
  | SetTxHex String
  | LoadExample String
  | SetLibraryInput String
  | SetLibraryUrl String
  | AddLibraryBook
  | ImportLibraryBookFile
  | ImportLibraryBookFromUrl
  | ExportSelectedLibraryBooks
  | ExportAllLibraryBooks
  | ImportLibraryStoreFile
  | ToggleLibraryBook String Boolean
  | SetLibraryBookName String String
  | SaveLibraryBookName String
  | DeleteLibraryBook String
  | CopyLibraryBookSource String
  | SaveLibraryBookSource String
  | ApplySelectedBooks
  | StartDecodedTreeAnnotation RdfShapes.DecodedTreeRow
  | SetDecodedTreeAnnotationLabel String
  | SetDecodedTreeAnnotationType String
  | SetDecodedTreeAnnotationMode String
  | SetDecodedTreeAnnotationBookId String
  | SetDecodedTreeAnnotationNewBookName String
  | CancelDecodedTreeAnnotation
  | SaveDecodedTreeAnnotation RdfShapes.DecodedTreeRow
  | Decode
  | Copy
  | CopyValue String String
  | BrowseJson String
  | ToggleDecodedEmpty String
  | ToggleDecodedTree String
  | ToggleDecodedResolutions
  | SetDecodedRowStyle String
  | ExpandDecodedTree
  | CollapseDecodedTree
  | ToggleDecodedBytes
  | SetValidationFilter ValidationFilter
  | SelectResultTab ResultTab
  | ChangeInput
  | SetAddressInput String
  | InspectAddress
  | SetScriptInputMode ScriptInputMode
  | SetScriptInput String
  | SelectKeyTab KeyTab
  | SetKeyMnemonicWordCount Int
  | GenerateKeyMnemonic
  | CopyKeyMnemonic
  | ToggleGeneratedMnemonic
  | UseGeneratedMnemonic
  | ToggleRestorePhrase
  | ToggleDerivedKeys
  | SetRestorePhrase String
  | SetRestoreFamily RestoreFamily
  | SetShelleyNetwork Shelley.ShelleyNetwork
  | SelectShelleyCustomNetwork
  | SetShelleyCustomNetworkTag String
  | SetAccountIndex String
  | SetAddressIndex String
  | SetDerivationRole Derivation.Role
  | SetLegacyStyle Bootstrap.LegacyStyle
  | SetLegacyNetwork Bootstrap.LegacyNetwork
  | SelectLegacyCustomNetwork
  | SetLegacyAddressXPub String
  | SetLegacyRootXPub String
  | SetLegacyDerivationPath String
  | SetLegacyCustomMagic String
  | SetSigningPayloadMode Signing.PayloadMode
  | SetSigningPayload String
  | ToggleSigningKey
  | SetSigningKey String
  | UseSigningResultForVerification
  | SetVerifyPayloadMode Signing.PayloadMode
  | SetVerifyPayload String
  | SetVerificationKey String
  | SetSignature String
  | CopyKeyValue String
  | SetVaultPassphrase String
  | ToggleVaultPassphrase
  | CreateVault
  | OpenVault
  | ExportVault
  | LockVault
  | SetMnemonicVaultLabel String
  | SetRestoreVaultLabel String
  | SetSigningVaultLabel String
  | SetProviderVaultLabel String
  | SaveGeneratedMnemonicToVault
  | SaveRestoreMnemonicToVault
  | SaveSigningKeyToVault
  | SaveDerivedKeyToVault Vault.VaultKind String String
  | SaveProviderSecretToVault
  | PeekVaultEntryInRestore String
  | PopVaultEntryInRestore String
  | PeekVaultEntryInSigning String
  | PopVaultEntryInSigning String
  | PeekVaultEntryInTxSigning String
  | PopVaultEntryInTxSigning String
  | PeekVaultEntryInProvider String
  | PopVaultEntryInProvider String
  | SetTxSigningKey String
  | ToggleTxSigningKey
  | RunTxSign
  | DeleteVaultEntry String
  | Navigate Route MouseEvent
  | ToggleTheme

inspectorComponent
  :: forall q i o m
   . MonadAff m
  => InitialKeys
  -> H.Component q i o m
inspectorComponent initial =
  H.mkComponent
    { initialState: \_ ->
        { provider: initial.prov
        , blockfrostKey: ""
        , koiosBearer: ""
        , mode: ByHash
        , network: initial.network
        , txHash: ""
        , txHex: ""
        , result: Nothing
        , loadFormExpanded: true
        , resultTab: StructureTab
        , txCbor: Nothing
        , operationArgs: "{}"
        , browser: Nothing
        , identification: Nothing
        , intent: Nothing
        , witnessPlan: Nothing
        , txSigningKeyInput: ""
        , showTxSigningKey: false
        , txSigningRunning: false
        , txSigningResult: Nothing
        , validation: Nothing
        , rdf: Nothing
        , sparqlLens: Nothing
        , resolvedLabelsLens: Nothing
        , typedFieldsLens: Nothing
        , decodedTreeLens: Nothing
        , shaclConformance: Nothing
        , books: initial.books
        , bookNameEdits: bookNameEditsFromBooks initial.books
        , annotationDraft: Nothing
        , libraryInput: ""
        , libraryUrl: ""
        , libraryError: Nothing
        , libraryStatus: Nothing
        , browserNodes: []
        , expandedPaths: []
        , decodedTreeExpanded: []
        , decodedEmptyExpanded: []
        , decodedResolutionsExpanded: false
        , decodedRowStyle: "quiet"
        , decodedBytesExpanded: true
        , validationFilter: ValidationAll
        , running: false
        , copied: false
        , copiedPath: Nothing
        , browserPath: "[]"
        , fetchError: Nothing
        , addressInput: ""
        , addressResult: Nothing
        , scriptInputMode: ScriptInputCbor
        , scriptInput: ""
        , scriptResult: Nothing
        , scriptTemplateResult: Nothing
        , keyTab: KeyMnemonic
        , mnemonicWordCount: 24
        , generatedMnemonic: Nothing
        , showGeneratedMnemonic: false
        , showRestorePhrase: false
        , showDerivedKeys: false
        , restorePhrase: ""
        , restoreFamily: RestoreShelley
        , shelleyNetwork: Shelley.ShelleyMainnet
        , shelleyCustomNetworkTagInput: "3"
        , accountIndexInput: "0"
        , addressIndexInput: "0"
        , derivationRole: Derivation.UTxOExternal
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
        , showSigningKey: false
        , signingKeyInput: ""
        , signingResult: Nothing
        , verifyPayloadMode: Signing.PayloadText
        , verifyPayloadInput: ""
        , verificationKeyInput: ""
        , signatureInput: ""
        , verificationResult: Nothing
        , vaultPassphraseInput: ""
        , showVaultPassphrase: false
        , vaultFileName: defaultVaultFileName
        , vaultUnlocked: false
        , vaultEntries: []
        , vaultDirty: false
        , vaultStatusMessage: Nothing
        , vaultErrorMessage: Nothing
        , mnemonicVaultLabelInput: ""
        , restoreVaultLabelInput: ""
        , signingVaultLabelInput: ""
        , providerVaultLabelInput: ""
        , route: initial.route
        , routeBase: initial.routeBase
        , theme: initial.theme
        }
    , render
    , eval: H.mkEval H.defaultEval { handleAction = handleAction, initialize = Just Initialize }
    }
  where

  render state =
    HH.div
      [ classNames [ "shell-root" ] ]
      [ Shell.topbar
          state.route
          { themeLabel: Shell.themeLabel state.theme
          , basePath: state.routeBase
          , onToggleTheme: ToggleTheme
          , onNavigate: Navigate
          }
      , HH.main
          [ classNames [ "page-frame", "shell-main" ] ]
          [ case state.route of
              RouteInspect -> renderInspector state
              RouteAddresses -> renderAddresses state
              RouteKeys -> renderKeys state
              RouteScripts -> renderScripts state
              RouteVault -> renderVault state
              RouteSettings -> renderSettings state
              RouteLibrary -> renderLibrary state
              RouteManual -> renderManual state
          ]
      , Shell.siteFooter
      ]

  renderInspector state =
    let
      decodedLoaded = case state.result of
        Just r -> isDecodedResult r
        Nothing -> false
      showLoadedHeader = decodedLoaded && not state.loadFormExpanded
    in
      HH.div
        [ classNames [ "app-shell", "inspect-shell" ] ]
        [ HH.div
            [ classNames
                ( if showLoadedHeader then
                    [ "workspace", "loaded-workspace" ]
                  else
                    [ "workspace" ]
                )
            ]
            [ if showLoadedHeader then
                renderLoadedInspectorHeader state
              else
                renderLoadForm state
            , if showLoadedHeader then
                renderBooksPanel state true
              else
                HH.text ""
            , HH.div
                [ classNames [ "workspace-main" ] ]
                [ renderResult state
                , renderTxSigning state
                ]
            ]
        ]

  renderKeys state =
    HH.div
      [ classNames [ "app-shell", "tool-page", "keys-page" ] ]
      [ toolIntro "Keys" "Generate recovery phrases, restore wallet keys and addresses, construct bootstrap addresses, and sign or verify raw payloads locally."
      , HH.div
          [ classNames [ "key-tabs" ]
          , HH.attr (HH.AttrName "role") "tablist"
          , HH.attr (HH.AttrName "aria-label") "Key tools"
          ]
          [ renderKeyTab state.keyTab KeyMnemonic "Mnemonic"
          , renderKeyTab state.keyTab KeyRestore "Restore"
          , renderKeyTab state.keyTab KeyExpert "Expert"
          , renderKeyTab state.keyTab KeySigning "Sign & verify"
          ]
      , case state.keyTab of
          KeyMnemonic -> renderKeyMnemonic state
          KeyRestore -> renderKeyRestore state
          KeyExpert -> renderKeyExpert state
          KeySigning -> renderKeySigning state
      ]

  renderKeyTab active target label =
    HH.button
      [ classNames (if active == target then [ "key-tab", "is-selected" ] else [ "key-tab" ])
      , HH.attr (HH.AttrName "role") "tab"
      , HH.attr (HH.AttrName "aria-selected") (if active == target then "true" else "false")
      , HE.onClick (\_ -> SelectKeyTab target)
      ]
      [ HH.text label ]

  renderKeyMnemonic state =
    HH.div [ classNames [ "key-grid" ] ]
      [ toolCard "key-card" "mnemonic-input"
          [ toolHeading "Mnemonic generation" "Choose a BIP-39 word count, generate locally, then reveal, copy, or hand the phrase to Restore."
          , HH.div [ classNames [ "key-actions" ] ]
              (map (renderWordCountButton state.mnemonicWordCount) keyMnemonicWordCounts)
          , HH.div [ classNames [ "key-actions" ] ]
              [ keyButton true "Generate phrase" GenerateKeyMnemonic
              , keyButton false (if state.showGeneratedMnemonic then "Hide phrase" else "Show phrase") ToggleGeneratedMnemonic
              , keyButton false "Copy phrase" CopyKeyMnemonic
              , keyButton false "Use in Restore" UseGeneratedMnemonic
              , keyButton false "Save to vault" SaveGeneratedMnemonicToVault
              ]
          , keyTextField "Vault item name" state.mnemonicVaultLabelInput SetMnemonicVaultLabel
          , renderVaultInlineStatus state
          ]
      , toolCard "key-card" "mnemonic-output"
          [ toolHeading "Generated phrase" "Recovery phrases are hidden by default and are never persisted."
          , renderGeneratedKeyMnemonic state.showGeneratedMnemonic state.generatedMnemonic
          ]
      ]

  renderWordCountButton active count =
    HH.button
      [ classNames (if active == count then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> SetKeyMnemonicWordCount count)
      ]
      [ HH.text (show count <> " words") ]

  keyButton primary label action =
    HH.button
      [ classNames (if primary then [ "key-button", "key-button-primary" ] else [ "key-button" ])
      , HE.onClick (\_ -> action)
      ]
      [ HH.text label ]

  renderGeneratedKeyMnemonic visible = case _ of
    Nothing -> toolEmpty "No recovery phrase generated yet."
    Just words ->
      if not visible then
        HH.div [ classNames [ "privacy-note" ] ]
          [ HH.text ("Phrase hidden. " <> show (Array.length words) <> " words are available for clipboard copy.") ]
      else
        HH.div [ classNames [ "mnemonic-grid" ] ]
          (Array.mapWithIndex renderKeyMnemonicWord words)

  renderKeyMnemonicWord index word =
    HH.div [ classNames [ "mnemonic-word" ] ]
      [ HH.span [ classNames [ "mnemonic-index" ] ] [ HH.text (show (index + 1) <> ".") ]
      , HH.code [ classNames [ "mnemonic-value" ] ] [ HH.text word ]
      ]

  renderKeyRestore state =
    HH.div [ classNames [ "key-grid" ] ]
      [ toolCard "key-card" "restore-input"
          [ toolHeading "Restore and build" "Choose the wallet family first, then derive the matching keys or address locally from a recovery phrase."
          , renderVaultShelf "vault-shelf--restore" restoreAcceptedKinds state.vaultEntries PeekVaultEntryInRestore PopVaultEntryInRestore
          , HH.div [ classNames [ "key-actions" ] ]
              [ renderRestoreFamilyButton state.restoreFamily RestoreShelley
              , renderRestoreFamilyButton state.restoreFamily RestoreIcarus
              , renderRestoreFamilyButton state.restoreFamily RestoreByron
              ]
          , HH.div [ classNames [ "key-actions" ] ]
              [ keyButton false (if state.showRestorePhrase then "Hide recovery phrase" else "Show recovery phrase") ToggleRestorePhrase ]
          , renderRestorePhraseInput state
          , HH.div [ classNames [ "key-controls" ] ]
              [ numberField "Account index" state.accountIndexInput SetAccountIndex
              , numberField "Address index" state.addressIndexInput SetAddressIndex
              ]
          , if keyFamilyUsesRole state.restoreFamily then
              HH.div [ classNames [ "key-actions" ] ]
                (map (renderDerivationRoleButton state.derivationRole) (keyRolesForFamily state.restoreFamily))
            else HH.text ""
          , if state.restoreFamily == RestoreShelley then
              HH.div [ classNames [ "key-actions" ] ]
                [ renderShelleyNetworkButton state.shelleyNetwork Shelley.ShelleyMainnet
                , renderShelleyNetworkButton state.shelleyNetwork Shelley.ShelleyPreprod
                , renderShelleyNetworkButton state.shelleyNetwork Shelley.ShelleyPreview
                , HH.button
                    [ classNames (if keyIsShelleyCustom state.shelleyNetwork then [ "key-button", "is-selected" ] else [ "key-button" ])
                    , HE.onClick (\_ -> SelectShelleyCustomNetwork)
                    ]
                    [ HH.text "Custom" ]
                ]
            else
              HH.div [ classNames [ "key-actions" ] ]
                [ renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyMainnet
                , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyStaging
                , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyTestnet
                , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyPreprod
                , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyPreview
                , HH.button
                    [ classNames (if keyIsLegacyCustom state.legacyNetwork then [ "key-button", "is-selected" ] else [ "key-button" ])
                    , HE.onClick (\_ -> SelectLegacyCustomNetwork)
                    ]
                    [ HH.text "Custom" ]
                ]
          , if state.restoreFamily == RestoreShelley && keyIsShelleyCustom state.shelleyNetwork then
              numberField "Network tag" state.shelleyCustomNetworkTagInput SetShelleyCustomNetworkTag
            else if state.restoreFamily /= RestoreShelley && keyIsLegacyCustom state.legacyNetwork then
              numberField "Protocol magic" state.legacyCustomMagicInput SetLegacyCustomMagic
            else HH.text ""
          , toolKeyValue "Path" (keyRestorePath state)
          , keyTextField "Vault item name" state.restoreVaultLabelInput SetRestoreVaultLabel
          , HH.div [ classNames [ "key-actions" ] ]
              [ keyButton false "Save phrase to vault" SaveRestoreMnemonicToVault ]
          , renderVaultInlineStatus state
          ]
      , toolCard "key-card" "restore-output"
          [ toolHeading (if state.restoreFamily == RestoreShelley then "Derived addresses and keys" else "Derived address") "Outputs update whenever the phrase, family, role, network, or index changes."
          , case state.restoreFamily of
              RestoreShelley -> renderKeyShelleyResult state
              _ -> renderKeyFamilyResult state.familyRestoreResult
          ]
      ]

  renderRestorePhraseInput state =
    HH.label [ classNames [ "key-field" ] ]
      [ HH.span [ classNames [ "field-label" ] ] [ HH.text "Recovery phrase" ]
      , if state.showRestorePhrase then
          HH.textarea
            [ HP.rows 5
            , HP.value state.restorePhrase
            , HH.attr (HH.AttrName "aria-label") "Recovery phrase"
            , HE.onValueInput SetRestorePhrase
            ]
        else
          HH.input
            [ HP.type_ HP.InputPassword
            , HP.value state.restorePhrase
            , HH.attr (HH.AttrName "aria-label") "Recovery phrase"
            , HE.onValueInput SetRestorePhrase
            ]
      ]

  numberField label value action =
    HH.label [ classNames [ "key-field" ] ]
      [ HH.span [ classNames [ "field-label" ] ] [ HH.text label ]
      , HH.input
          [ HP.type_ HP.InputNumber
          , HP.min 0.0
          , HP.value value
          , HH.attr (HH.AttrName "aria-label") label
          , HE.onValueInput action
          ]
      ]

  renderRestoreFamilyButton active target =
    HH.button
      [ classNames (if active == target then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> SetRestoreFamily target)
      ]
      [ HH.text (keyRestoreFamilyLabel target) ]

  renderDerivationRoleButton active target =
    HH.button
      [ classNames (if active == target then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> SetDerivationRole target)
      ]
      [ HH.text (Derivation.roleLabel target) ]

  renderShelleyNetworkButton active target =
    HH.button
      [ classNames (if active == target then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> SetShelleyNetwork target)
      ]
      [ HH.text (Shelley.shelleyNetworkLabel target) ]

  renderLegacyNetworkButton active target =
    HH.button
      [ classNames (if active == target then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> SetLegacyNetwork target)
      ]
      [ HH.text (keyLegacyNetworkLabel target) ]

  renderKeyShelleyResult state = case state.derivationResult of
    Nothing -> toolEmpty "Paste a valid recovery phrase to derive Shelley keys and addresses."
    Just (Left err) -> toolError err
    Just (Right keys) ->
      HH.div [ classNames [ "key-results" ] ]
        ( renderShelleyAddresses state.shelleyAddressesResult <>
            [ HH.div [ classNames [ "key-actions" ] ]
                [ keyButton false (if state.showDerivedKeys then "Hide private keys" else "Show private keys") ToggleDerivedKeys ]
            , renderVaultSecretKey state.showDerivedKeys Vault.VaultRootPrivateKey "Root private key" keys.rootKeyBech32
            , renderVaultSecretKey state.showDerivedKeys Vault.VaultAccountPrivateKey "Account private key" keys.accountKeyBech32
            , renderVaultSecretKey state.showDerivedKeys Vault.VaultAddressPrivateKey "Address private key" keys.addressKeyBech32
            , renderPublicKey "Address public key" keys.addressPublicKeyBech32
            , renderVaultSecretKey state.showDerivedKeys Vault.VaultStakePrivateKey "Stake private key" keys.stakeKeyBech32
            , renderPublicKey "Stake public key" keys.stakePublicKeyBech32
            ]
        )

  renderShelleyAddresses = case _ of
    Nothing -> []
    Just (Left err) -> [ toolError err ]
    Just (Right addresses) ->
      [ renderMaybeAddress "Payment address" addresses.paymentAddressBech32
      , renderMaybeAddress "Base address" addresses.delegationAddressBech32
      , renderPublicKey "Reward address" addresses.rewardAddressBech32
      ]

  renderMaybeAddress label = case _ of
    Nothing -> keyOutputCard label
      [ HH.div [ classNames [ "privacy-note" ] ]
          [ HH.text "Unavailable when the selected role does not derive a payment credential." ]
      ]
    Just value -> renderPublicKey label value

  renderSecretKey visible label value =
    keyOutputCard label
      [ if visible then
          HH.code [ classNames [ "key-output-value" ] ] [ HH.text value ]
        else
          HH.div [ classNames [ "privacy-note" ] ]
            [ HH.text "Private key hidden for this card. Use Show or Copy." ]
      , keyCopyButton value
      ]

  renderVaultSecretKey visible kind label value =
    keyOutputCard label
      [ if visible then
          HH.code [ classNames [ "key-output-value" ] ] [ HH.text value ]
        else
          HH.div [ classNames [ "privacy-note" ] ]
            [ HH.text "Private key hidden for this card. Use Show or Copy." ]
      , HH.div [ classNames [ "key-actions" ] ]
          [ keyCopyButton value
          , keyButton false "Save to vault" (SaveDerivedKeyToVault kind label value)
          ]
      ]

  renderPublicKey label value =
    keyOutputCard label
      [ HH.code [ classNames [ "key-output-value" ] ] [ HH.text value ]
      , keyCopyButton value
      ]

  keyOutputCard label children =
    HH.div [ classNames [ "key-output-card" ] ]
      [ HH.h3_ [ HH.text label ], HH.div [ classNames [ "key-output-body" ] ] children ]

  keyCopyButton value =
    HH.button [ classNames [ "key-copy" ], HE.onClick (\_ -> CopyKeyValue value) ] [ HH.text "Copy" ]

  renderKeyFamilyResult = case _ of
    Nothing -> toolEmpty "Paste a valid recovery phrase to derive a bootstrap address."
    Just (Left err) -> toolError err
    Just (Right address) -> renderPublicKey "Base58 address" address

  renderKeyExpert state =
    HH.div [ classNames [ "key-grid" ] ]
      [ toolCard "key-card" "expert-input"
          [ toolHeading "Manual bootstrap construction" "Construct Icarus or Byron bootstrap addresses from explicit extended public keys."
          , HH.div [ classNames [ "key-actions" ] ]
              [ renderLegacyStyleButton state.legacyStyle Bootstrap.LegacyIcarus
              , renderLegacyStyleButton state.legacyStyle Bootstrap.LegacyByron
              ]
          , HH.div [ classNames [ "key-actions" ] ]
              [ renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyMainnet
              , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyStaging
              , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyTestnet
              , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyPreview
              , renderLegacyNetworkButton state.legacyNetwork Bootstrap.LegacyPreprod
              , HH.button
                  [ classNames (if keyIsLegacyCustom state.legacyNetwork then [ "key-button", "is-selected" ] else [ "key-button" ])
                  , HE.onClick (\_ -> SelectLegacyCustomNetwork)
                  ]
                  [ HH.text "Custom" ]
              ]
          , if keyIsLegacyCustom state.legacyNetwork then numberField "Protocol magic" state.legacyCustomMagicInput SetLegacyCustomMagic else HH.text ""
          , keyTextarea "Address xpub" 4 state.legacyAddressXPubInput SetLegacyAddressXPub
          , if state.legacyStyle == Bootstrap.LegacyByron then
              HH.div_
                [ keyTextarea "Root xpub" 4 state.legacyRootXPubInput SetLegacyRootXPub
                , keyTextField "Byron path" state.legacyDerivationPathInput SetLegacyDerivationPath
                ]
            else HH.text ""
          ]
      , toolCard "key-card" "expert-output"
          [ toolHeading "Bootstrap address" "The output updates as the network, path, or key material changes."
          , case state.legacyResult of
              Nothing -> toolEmpty "Enter an address xpub to construct a bootstrap address."
              Just (Left err) -> toolError err
              Just (Right address) -> renderPublicKey "Base58 address" address
          ]
      ]

  renderLegacyStyleButton active target =
    HH.button
      [ classNames (if active == target then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> SetLegacyStyle target)
      ]
      [ HH.text case target of
          Bootstrap.LegacyIcarus -> "Icarus"
          Bootstrap.LegacyByron -> "Byron"
      ]

  keyTextarea label rows value action =
    HH.label [ classNames [ "key-field" ] ]
      [ HH.span [ classNames [ "field-label" ] ] [ HH.text label ]
      , HH.textarea
          [ HP.rows rows
          , HP.value value
          , HH.attr (HH.AttrName "aria-label") label
          , HE.onValueInput action
          ]
      ]

  keyTextField label value action =
    HH.label [ classNames [ "key-field" ] ]
      [ HH.span [ classNames [ "field-label" ] ] [ HH.text label ]
      , HH.input
          [ HP.value value
          , HH.attr (HH.AttrName "aria-label") label
          , HE.onValueInput action
          ]
      ]

  renderKeySigning state =
    HH.div [ classNames [ "key-signing-grid" ] ]
      [ keyRegion "Sign payload"
          [ HH.p_ [ HH.text "Sign arbitrary text or hex bytes with an extended signing key. This does not build or sign transactions." ]
          , HH.div [ classNames [ "key-actions" ] ]
              [ renderSigningModeButton state.signingPayloadMode Signing.PayloadText SetSigningPayloadMode
              , renderSigningModeButton state.signingPayloadMode Signing.PayloadHex SetSigningPayloadMode
              ]
          , keyTextarea "Payload" 5 state.signingPayloadInput SetSigningPayload
          , HH.div [ classNames [ "key-actions" ] ]
              [ keyButton false (if state.showSigningKey then "Hide signing key" else "Show signing key") ToggleSigningKey
              , keyButton false "Save signing key to vault" SaveSigningKeyToVault
              ]
          , keyTextField "Vault item name" state.signingVaultLabelInput SetSigningVaultLabel
          , renderVaultShelf "vault-shelf--signing" signingAcceptedKinds state.vaultEntries PeekVaultEntryInSigning PopVaultEntryInSigning
          , if state.showSigningKey then
              keyTextarea "Signing key" 4 state.signingKeyInput SetSigningKey
            else
              HH.label [ classNames [ "key-field" ] ]
                [ HH.span [ classNames [ "field-label" ] ] [ HH.text "Signing key" ]
                , HH.input
                    [ HP.type_ HP.InputPassword
                    , HP.value state.signingKeyInput
                    , HH.attr (HH.AttrName "aria-label") "Signing key"
                    , HE.onValueInput SetSigningKey
                    ]
                ]
          , renderVaultInlineStatus state
          ]
      , keyRegion "Signature" [ renderKeySigningResult state.signingResult ]
      , keyRegion "Verify signature"
          [ HH.p_ [ HH.text "Verify an Ed25519 signature against an extended verification key using the same payload bytes." ]
          , HH.div [ classNames [ "key-actions" ] ]
              [ renderSigningModeButton state.verifyPayloadMode Signing.PayloadText SetVerifyPayloadMode
              , renderSigningModeButton state.verifyPayloadMode Signing.PayloadHex SetVerifyPayloadMode
              , keyButton false "Use signed payload" UseSigningResultForVerification
              ]
          , keyTextarea "Verification payload" 5 state.verifyPayloadInput SetVerifyPayload
          , keyTextarea "Verification key" 3 state.verificationKeyInput SetVerificationKey
          , keyTextarea "Signature hex" 3 state.signatureInput SetSignature
          , renderKeyVerificationResult state.verificationResult
          ]
      ]

  keyRegion label children =
    HH.element (HH.ElemName "md-elevated-card")
      [ classNames [ "panel", "key-card" ]
      , mdSurface "key-tool"
      , HH.attr (HH.AttrName "role") "region"
      , HH.attr (HH.AttrName "aria-label") label
      ]
      ([ HH.div [ classNames [ "panel-heading" ] ] [ HH.h2_ [ HH.text label ] ] ] <> children)

  renderSigningModeButton active target action =
    HH.button
      [ classNames (if active == target then [ "key-button", "is-selected" ] else [ "key-button" ])
      , HE.onClick (\_ -> action target)
      ]
      [ HH.text (Signing.payloadModeLabel target) ]

  renderKeySigningResult = case _ of
    Nothing -> toolEmpty "Provide a payload and supported extended signing key."
    Just (Left err) -> toolError err
    Just (Right result) -> HH.div [ classNames [ "key-results" ] ]
      [ renderPublicKey "Verification key" result.verificationKeyBech32
      , renderPublicKey "Signature (hex)" result.signatureHex
      , renderPublicKey "Payload bytes (hex)" result.payloadHex
      ]

  renderKeyVerificationResult = case _ of
    Nothing -> toolEmpty "Provide a payload, verification key, and signature."
    Just (Left err) -> toolError err
    Just (Right valid) -> keyOutputCard "Verification"
      [ HH.div [ classNames [ "key-verification", if valid then "is-valid" else "is-invalid" ] ]
          [ HH.text (if valid then "Valid signature" else "Invalid signature") ]
      ]

  renderAddresses state =
    HH.div
      [ classNames [ "app-shell", "tool-page", "addresses-page" ] ]
      [ toolIntro "Address inspection" "Decode Cardano addresses locally and inspect their style, network, credentials, and stake reference."
      , HH.div
          [ classNames [ "tool-layout" ] ]
          [ toolCard "tool-input-panel" "input"
              [ toolHeading "Cardano address" "Shelley bech32 and bootstrap base58 addresses are supported."
              , HH.label
                  [ classNames [ "field-stack" ] ]
                  [ HH.span [ classNames [ "field-label" ] ] [ HH.text "Cardano address" ]
                  , HH.textarea
                      [ HP.rows 5
                      , HP.value state.addressInput
                      , HH.attr (HH.AttrName "aria-label") "Cardano address"
                      , HE.onValueInput SetAddressInput
                      ]
                  ]
              , HH.element (HH.ElemName "md-filled-button")
                  [ classNames [ "primary-action" ]
                  , HH.attr (HH.AttrName "role") "button"
                  , mdControl "primary"
                  , HE.onClick (\_ -> InspectAddress)
                  ]
                  [ HH.text "Inspect address" ]
              ]
          , HH.element (HH.ElemName "md-elevated-card")
              [ classNames [ "panel", "tool-result-panel" ]
              , mdSurface "result"
              , HH.attr (HH.AttrName "role") "region"
              , HH.attr (HH.AttrName "aria-label") "Address inspection result"
              ]
              [ HH.div [ classNames [ "panel-heading" ] ] [ HH.h2_ [ HH.text "Decoded address" ] ]
              , renderAddressResult state.addressResult
              ]
          ]
      ]

  renderAddressResult = case _ of
    Nothing -> toolEmpty "Paste an address and inspect it to see its ledger structure."
    Just (Left err) -> toolError err
    Just (Right info) ->
      HH.div
        [ classNames [ "tool-result-grid" ] ]
        ( [ toolKeyValue "Style" info.addressStyle
          , toolKeyValue "Header type" info.addressTypeLabel
          , toolKeyValue "Header type code" (show info.addressType)
          , toolKeyValue "Network" info.networkTagLabel
          , toolKeyValue "Network tag" (networkTagValue info.networkTag)
          , toolKeyValue "Stake reference" info.stakeReference
          , toolMaybeRow "Spending key hash" info.spendingKeyHash
          , toolMaybeRow "Spending script hash" info.spendingScriptHash
          , toolMaybeRow "Stake key hash" info.stakeKeyHash
          , toolMaybeRow "Stake script hash" info.stakeScriptHash
          ]
            <> map (\detail -> toolKeyValue detail.label detail.value) info.extraDetails
        )

  renderScripts state =
    HH.div
      [ classNames [ "app-shell", "tool-page", "scripts-page" ] ]
      [ toolIntro "Native scripts" "Inspect CBOR preimages, author canonical native-script JSON, or validate a ScriptTemplate locally."
      , HH.div
          [ classNames [ "tool-layout" ] ]
          [ toolCard "tool-input-panel" "input"
              [ toolHeading "Script input" "Results update as you type."
              , HH.div
                  [ classNames [ "tool-tabs" ]
                  , HH.attr (HH.AttrName "role") "tablist"
                  , HH.attr (HH.AttrName "aria-label") "Script input format"
                  ]
                  [ renderScriptModeTab state.scriptInputMode ScriptInputCbor "CBOR hex"
                  , renderScriptModeTab state.scriptInputMode ScriptInputJson "JSON"
                  , renderScriptModeTab state.scriptInputMode ScriptInputTemplate "Template JSON"
                  ]
              , HH.label
                  [ classNames [ "field-stack" ] ]
                  [ HH.span [ classNames [ "field-label" ] ] [ HH.text (scriptInputModeLabel state.scriptInputMode) ]
                  , HH.textarea
                      [ HP.rows 10
                      , HP.value state.scriptInput
                      , HH.attr (HH.AttrName "aria-label") (scriptInputModeLabel state.scriptInputMode)
                      , HE.onValueInput SetScriptInput
                      ]
                  ]
              ]
          , HH.element (HH.ElemName "md-elevated-card")
              [ classNames [ "panel", "tool-result-panel" ]
              , mdSurface "result"
              , HH.attr (HH.AttrName "role") "region"
              , HH.attr (HH.AttrName "aria-label") "Script analysis result"
              ]
              [ HH.div [ classNames [ "panel-heading" ] ] [ HH.h2_ [ HH.text "Script analysis" ] ]
              , case state.scriptInputMode of
                  ScriptInputTemplate -> renderScriptTemplateResult state.scriptTemplateResult
                  _ -> renderScriptResult state.scriptResult
              ]
          ]
      ]

  toolIntro title copy =
    HH.section
      [ classNames [ "intro-strip" ] ]
      [ HH.div_ [ HH.h1_ [ HH.text title ], HH.p_ [ HH.text copy ] ] ]

  toolCard panelClass surface children =
    HH.element (HH.ElemName "md-elevated-card")
      [ classNames [ "panel", panelClass ], mdSurface surface ]
      children

  toolHeading title copy =
    HH.div [ classNames [ "panel-heading" ] ]
      [ HH.div_ [ HH.h2_ [ HH.text title ], HH.p_ [ HH.text copy ] ] ]

  renderScriptModeTab active target label =
    HH.button
      [ classNames (if active == target then [ "tool-tab", "is-selected" ] else [ "tool-tab" ])
      , HH.attr (HH.AttrName "role") "tab"
      , HH.attr (HH.AttrName "aria-selected") (if active == target then "true" else "false")
      , HE.onClick (\_ -> SetScriptInputMode target)
      ]
      [ HH.text label ]

  renderScriptResult = case _ of
    Nothing -> toolEmpty "Paste native script CBOR or JSON to see its canonical form and ledger hash."
    Just (Left err) -> toolError err
    Just (Right result) ->
      HH.div [ classNames [ "tool-result-grid" ] ]
        ( [ toolKeyValue "Script type" result.scriptType
          , toolKeyValue "Validation" result.validationStatus
          , toolKeyValue "Hash hex" result.hashHex
          , toolKeyValue "Hash bech32" result.hashBech32
          , toolKeyValue "Canonical JSON" result.canonicalJson
          , toolKeyValue "Script preimage (CBOR hex)" result.canonicalCborHex
          ]
            <> map renderScriptIssue result.issues
        )

  renderScriptTemplateResult = case _ of
    Nothing -> toolEmpty "Paste ScriptTemplate JSON to validate cosigners and derive its native script."
    Just (Left err) -> toolError err
    Just (Right result) ->
      HH.div [ classNames [ "tool-result-grid" ] ]
        ( [ toolKeyValue "Template validation" result.templateValidationStatus
          , toolKeyValue "Canonical template JSON" result.canonicalTemplateJson
          ]
            <> map renderScriptIssue result.templateIssues
            <> if result.hasDerivedScript then
                [ toolKeyValue "Derived script type" result.derivedScript.scriptType
                , toolKeyValue "Derived validation" result.derivedScript.validationStatus
                , toolKeyValue "Derived hash hex" result.derivedScript.hashHex
                , toolKeyValue "Derived hash bech32" result.derivedScript.hashBech32
                , toolKeyValue "Derived canonical JSON" result.derivedScript.canonicalJson
                , toolKeyValue "Derived script preimage (CBOR hex)" result.derivedScript.canonicalCborHex
                ]
                  <> map renderScriptIssue result.derivedScript.issues
              else
                [ toolKeyValue "Derived script" "Unavailable until the template validates." ]
        )

  renderScriptIssue issue =
    toolKeyValue ("Issue (" <> issue.level <> " / " <> issue.code <> ")") issue.message

  toolKeyValue label value =
    HH.div [ classNames [ "tool-kv-row" ] ]
      [ HH.span [ classNames [ "tool-kv-label" ] ] [ HH.text label ]
      , HH.code [ classNames [ "tool-kv-value" ] ] [ HH.text value ]
      ]

  toolMaybeRow label value = toolKeyValue label case value of
    Just content -> content
    Nothing -> "-"

  toolEmpty copy = HH.div [ classNames [ "empty-state" ] ] [ HH.text copy ]

  toolError err = HH.div [ classNames [ "tool-error" ] ] [ HH.text err ]

  networkTagValue tag | tag < 0 = "-"
  networkTagValue tag = show tag

  scriptInputModeLabel = case _ of
    ScriptInputCbor -> "Native script CBOR hex"
    ScriptInputJson -> "Native script JSON"
    ScriptInputTemplate -> "ScriptTemplate JSON"

  scriptAnalysisStatus mode value =
    let
      trimmed = String.trim value
      normalizedHex = String.trim (Regex.replace whitespaceRegex "" value)
    in case mode of
      ScriptInputCbor -> if normalizedHex == "" then Nothing else Just (Script.analyzeNativeScriptHex normalizedHex)
      ScriptInputJson -> if trimmed == "" then Nothing else Just (Script.analyzeNativeScriptJson trimmed)
      ScriptInputTemplate -> Nothing

  whitespaceRegex = unsafeRegex "\\s+" (global <> unicode)

  scriptTemplateStatus mode value =
    let trimmed = String.trim value
    in case mode of
      ScriptInputTemplate -> if trimmed == "" then Nothing else Just (Script.analyzeScriptTemplateJson trimmed)
      _ -> Nothing

  keyMnemonicWordCounts = [ 12, 15, 18, 21, 24 ]

  keyNormalizeMnemonic value =
    Array.filter (_ /= "")
      (String.split (String.Pattern " ") (String.trim (Regex.replace whitespaceRegex " " value)))

  keyParseIndex value = case Int.fromString (String.trim value) of
    Just index | index >= 0 -> index
    _ -> 0

  keyNormalizeIndex value = show (keyParseIndex value)

  keyRestoreFamilyLabel = case _ of
    RestoreShelley -> "Shelley"
    RestoreIcarus -> "Icarus"
    RestoreByron -> "Byron"

  keyFamilyUsesRole = case _ of
    RestoreByron -> false
    _ -> true

  keyRolesForFamily = case _ of
    RestoreShelley -> [ Derivation.UTxOExternal, Derivation.UTxOInternal, Derivation.Stake ]
    RestoreIcarus -> [ Derivation.UTxOExternal, Derivation.UTxOInternal ]
    RestoreByron -> []

  keyNormalizeRole family role = case family of
    RestoreShelley -> role
    RestoreIcarus -> case role of
      Derivation.Stake -> Derivation.UTxOExternal
      other -> other
    RestoreByron -> Derivation.UTxOExternal

  keyRolePath = case _ of
    Derivation.UTxOExternal -> "0"
    Derivation.UTxOInternal -> "1"
    Derivation.Stake -> "2"

  keyRestorePath state = case state.restoreFamily of
    RestoreShelley ->
      "m / 1852' / 1815' / " <> state.accountIndexInput <> "' / "
        <> keyRolePath state.derivationRole <> " / " <> state.addressIndexInput
    RestoreIcarus ->
      "m / 44' / 1815' / " <> state.accountIndexInput <> "' / "
        <> keyRolePath (keyNormalizeRole RestoreIcarus state.derivationRole)
        <> " / " <> state.addressIndexInput
    RestoreByron -> "m / " <> state.accountIndexInput <> "' / " <> state.addressIndexInput

  keyIcarusRole role = case keyNormalizeRole RestoreIcarus role of
    Derivation.UTxOInternal -> Bootstrap.IcarusInternal
    _ -> Bootstrap.IcarusExternal

  keyIsLegacyCustom = case _ of
    Bootstrap.LegacyCustom _ -> true
    _ -> false

  keyIsShelleyCustom = case _ of
    Shelley.ShelleyCustom _ -> true
    _ -> false

  keyLegacyNetworkLabel = case _ of
    Bootstrap.LegacyMainnet -> "Mainnet"
    Bootstrap.LegacyStaging -> "Staging"
    Bootstrap.LegacyTestnet -> "Testnet"
    Bootstrap.LegacyPreview -> "Preview"
    Bootstrap.LegacyPreprod -> "Preprod"
    Bootstrap.LegacyCustom _ -> "Custom"

  keyResolveLegacyNetwork state = case state.legacyNetwork of
    Bootstrap.LegacyCustom _ -> case Int.fromString (String.trim state.legacyCustomMagicInput) of
      Just magic | magic >= 0 -> Right (Bootstrap.LegacyCustom magic)
      _ -> Left "Enter a non-negative integer for the protocol magic."
    network -> Right network

  keyPaymentXPub role keys = case role of
    Derivation.Stake -> Nothing
    _ -> Just keys.addressPublicKeyBech32

  refreshKeyDerivation = do
    state <- H.get
    let
      words = keyNormalizeMnemonic state.restorePhrase
      accountIndex = keyParseIndex state.accountIndexInput
      addressIndex = keyParseIndex state.addressIndexInput
    if Array.null words then
      H.modify_ _ { derivationResult = Nothing, shelleyAddressesResult = Nothing, familyRestoreResult = Nothing }
    else if not (Mnemonic.validateMnemonic words) then
      H.modify_ _
        { derivationResult = if state.restoreFamily == RestoreShelley then Just (Left "Mnemonic is invalid. Check the word list and checksum.") else Nothing
        , shelleyAddressesResult = Nothing
        , familyRestoreResult = if state.restoreFamily == RestoreShelley then Nothing else Just (Left "Mnemonic is invalid. Check the word list and checksum.")
        }
    else case state.restoreFamily of
      RestoreShelley -> do
        outcome <- H.liftAff (attempt (Derivation.derivePipeline words accountIndex state.derivationRole addressIndex))
        let
          derivation = case outcome of
            Left err -> Left ("Key derivation failed: " <> message err)
            Right keys -> Right keys
          addresses = case outcome of
            Left _ -> Nothing
            Right keys -> Just
              ( Shelley.constructShelleyAddresses
                  state.shelleyNetwork
                  (keyPaymentXPub state.derivationRole keys)
                  keys.stakePublicKeyBech32
              )
        H.modify_ _ { derivationResult = Just derivation, shelleyAddressesResult = addresses, familyRestoreResult = Nothing }
      RestoreIcarus -> do
        case keyResolveLegacyNetwork state of
          Left err -> H.modify_ _ { derivationResult = Nothing, shelleyAddressesResult = Nothing, familyRestoreResult = Just (Left err) }
          Right network -> do
            outcome <- H.liftAff
              (attempt (Bootstrap.constructIcarusAddressFromMnemonic network words accountIndex (keyIcarusRole state.derivationRole) addressIndex))
            H.modify_ _
              { derivationResult = Nothing
              , shelleyAddressesResult = Nothing
              , familyRestoreResult = Just case outcome of
                  Left err -> Left ("Restore failed: " <> message err)
                  Right address -> Right address
              }
      RestoreByron -> do
        case keyResolveLegacyNetwork state of
          Left err -> H.modify_ _ { derivationResult = Nothing, shelleyAddressesResult = Nothing, familyRestoreResult = Just (Left err) }
          Right network -> do
            outcome <- H.liftAff
              (attempt (Bootstrap.constructByronAddressFromMnemonic network words accountIndex addressIndex))
            H.modify_ _
              { derivationResult = Nothing
              , shelleyAddressesResult = Nothing
              , familyRestoreResult = Just case outcome of
                  Left err -> Left ("Restore failed: " <> message err)
                  Right address -> Right address
              }

  refreshKeyLegacy = do
    state <- H.get
    if String.trim state.legacyAddressXPubInput == "" then
      H.modify_ _ { legacyResult = Nothing }
    else case keyResolveLegacyNetwork state of
      Left err -> H.modify_ _ { legacyResult = Just (Left err) }
      Right network -> case Bootstrap.parseBootstrapXPub state.legacyAddressXPubInput of
        Left err -> H.modify_ _ { legacyResult = Just (Left err) }
        Right addressXPub -> case state.legacyStyle of
          Bootstrap.LegacyIcarus -> do
            outcome <- H.liftAff (attempt (Bootstrap.constructIcarusAddress network addressXPub))
            H.modify_ _
              { legacyResult = Just case outcome of
                  Left err -> Left (message err)
                  Right address -> Right address
              }
          Bootstrap.LegacyByron ->
            if String.trim state.legacyRootXPubInput == "" then
              H.modify_ _ { legacyResult = Just (Left "Paste the root_xvk key for Byron bootstrap addresses.") }
            else case Bootstrap.parseBootstrapXPub state.legacyRootXPubInput of
              Left err -> H.modify_ _ { legacyResult = Just (Left err) }
              Right rootXPub ->
                if String.trim state.legacyDerivationPathInput == "" then
                  H.modify_ _ { legacyResult = Just (Left "Enter a 2-segment Byron path like 0H/0.") }
                else do
                  outcome <- H.liftAff
                    (attempt (Bootstrap.constructByronAddress network addressXPub rootXPub state.legacyDerivationPathInput))
                  H.modify_ _
                    { legacyResult = Just case outcome of
                        Left err -> Left (message err)
                        Right address -> Right address
                    }

  keySigningInputBlank mode value = case mode of
    Signing.PayloadText -> String.trim value == ""
    Signing.PayloadHex -> String.trim (Regex.replace whitespaceRegex "" value) == ""

  refreshKeySigning = do
    state <- H.get
    if keySigningInputBlank state.signingPayloadMode state.signingPayloadInput || String.trim state.signingKeyInput == "" then
      H.modify_ _ { signingResult = Nothing }
    else do
      result <- H.liftAff (Signing.signPayload state.signingPayloadMode state.signingPayloadInput state.signingKeyInput)
      H.modify_ _ { signingResult = Just result }

  refreshKeyVerification = do
    state <- H.get
    if keySigningInputBlank state.verifyPayloadMode state.verifyPayloadInput
      || String.trim state.verificationKeyInput == ""
      || String.trim state.signatureInput == "" then
      H.modify_ _ { verificationResult = Nothing }
    else do
      result <- H.liftAff
        (Signing.verifySignature state.verifyPayloadMode state.verifyPayloadInput state.verificationKeyInput state.signatureInput)
      H.modify_ _ { verificationResult = Just result }

  isDecodedResult result =
    result.exitOk && (Json.inspect result.stdout).valid

  renderLoadForm state =
    HH.div
      [ classNames [ "load-form-stack" ] ]
      [ renderModeTabs state
      , HH.div
          [ classNames [ "initial-support-grid" ] ]
          [ renderBooksPanel state false
          , renderSettingsSummary state
          ]
      ]

  renderSettings state =
    HH.div
      [ classNames [ "app-shell", "settings-page" ] ]
      [ HH.section
          [ classNames [ "intro-strip" ] ]
          [ HH.div_
              [ HH.h1_ [ HH.text "Settings" ]
              , HH.p_
                  [ HH.text
                      "Configure the chain-data provider and network used by transaction decoding. Credentials stay memory-only unless saved in the encrypted vault."
                  ]
              ]
          ]
      , HH.div
          [ classNames [ "settings-layout" ] ]
          [ renderProvider state ]
      ]

  renderVault state =
    HH.div
      [ classNames [ "app-shell", "tool-page", "vault-page" ] ]
      [ toolIntro "Vault" "Open one encrypted local file for secret material. Decrypted values remain only in this browser tab's memory."
      , HH.div [ classNames [ "vault-layout" ] ]
          [ toolCard "vault-control-card" "vault-controls"
              [ toolHeading "Encrypted vault" "Version 1 PBKDF2-SHA-256 and AES-GCM vault files remain compatible with the legacy shell."
              , HH.label [ classNames [ "key-field" ] ]
                  [ HH.span [ classNames [ "field-label" ] ] [ HH.text "Vault passphrase" ]
                  , HH.input
                      [ HP.type_ (if state.showVaultPassphrase then HP.InputText else HP.InputPassword)
                      , HP.value state.vaultPassphraseInput
                      , HH.attr (HH.AttrName "aria-label") "Vault passphrase"
                      , HE.onValueInput SetVaultPassphrase
                      ]
                  ]
              , HH.div [ classNames [ "key-actions", "vault-actions" ] ]
                  [ keyButton false (if state.showVaultPassphrase then "Hide passphrase" else "Show passphrase") ToggleVaultPassphrase
                  , keyButton true "Create vault" CreateVault
                  , keyButton false "Open vault" OpenVault
                  , keyButton false "Download backup" ExportVault
                  , keyButton false "Lock vault" LockVault
                  ]
              , HH.div [ classNames [ "vault-summary" ] ]
                  [ toolKeyValue "State" (vaultStateLabel state)
                  , toolKeyValue "Entries" (show (Array.length state.vaultEntries))
                  , toolKeyValue "Vault file" state.vaultFileName
                  , toolKeyValue "Persisted" (if state.vaultDirty then "No, write failed" else "Yes")
                  ]
              , renderVaultInlineStatus state
              ]
          , toolCard "vault-entries-card" "vault-entries"
              [ toolHeading "Encrypted entries" "Only non-secret metadata is rendered while the vault is unlocked."
              , renderVaultEntries state
              ]
          ]
      ]

  renderVaultEntries state =
    if not state.vaultUnlocked then
      toolEmpty "Create or open a vault to inspect entry metadata."
    else if Array.null state.vaultEntries then
      toolEmpty "The unlocked vault is empty. Save a secret from Keys or Settings."
    else
      HH.div [ classNames [ "vault-entry-list" ] ]
        (map renderVaultMetadataEntry (Array.reverse state.vaultEntries))

  renderVaultMetadataEntry entry =
    HH.div [ classNames [ "vault-entry" ] ]
      [ HH.div_
          [ HH.strong_ [ HH.text entry.label ]
          , HH.p [ classNames [ "vault-kind" ] ] [ HH.text entry.kind ]
          , HH.p [ classNames [ "vault-created" ] ] [ HH.text entry.createdAt ]
          ]
      , keyButton false "Delete" (DeleteVaultEntry entry.id)
      ]

  renderVaultInlineStatus state = case state.vaultErrorMessage, state.vaultStatusMessage of
    Just err, _ ->
      HH.div
        [ classNames [ "tool-error", "vault-alert" ]
        , HH.attr (HH.AttrName "role") "alert"
        ]
        [ HH.text err ]
    Nothing, Just status -> HH.div [ classNames [ "privacy-note", "vault-status" ] ] [ HH.text status ]
    Nothing, Nothing -> HH.text ""

  renderVaultShelf className acceptedKinds entries peekAction popAction =
    let compatible = Array.reverse (vaultEntriesForKinds acceptedKinds entries)
    in
      if Array.null compatible then
        HH.div [ classNames [ "privacy-note", "vault-shelf-empty" ] ]
          [ HH.text "No compatible entries in the unlocked vault." ]
      else
        HH.div [ classNames [ "vault-shelf", className ] ]
          (map (renderVaultShelfEntry peekAction popAction) compatible)

  renderVaultShelfEntry peekAction popAction entry =
    HH.div [ classNames [ "vault-entry" ] ]
      [ HH.div_
          [ HH.strong_ [ HH.text entry.label ]
          , HH.p [ classNames [ "vault-kind" ] ] [ HH.text (vaultKindLabel entry.kind) ]
          ]
      , HH.div [ classNames [ "key-actions" ] ]
          [ keyButton false "Peek" (peekAction entry.id)
          , keyButton false "Pop" (popAction entry.id)
          ]
      ]

  renderLibrary state =
    let
      inspection = BookStore.inspect { kind: BookStore.envelopeKind, books: state.books }
    in
      HH.div
        [ classNames [ "app-shell", "library-page" ] ]
        [ HH.section
            [ classNames [ "intro-strip" ] ]
            [ HH.div_
                [ HH.h1_ [ HH.text "Library" ]
                , HH.p_
                    [ HH.text
                        "Manage local RDF overlay and blueprint books stored in this browser."
                    ]
                ]
            , HH.div
                [ classNames [ "tech-pills" ] ]
                [ HH.span_ [ HH.text (show inspection.count <> " books") ]
                , HH.span_ [ HH.text (show inspection.selectedCount <> " selected") ]
                , HH.span_ [ HH.text (show inspection.partCount <> " parts") ]
                ]
            ]
        , HH.div
            [ classNames [ "library-layout" ] ]
            [ renderLibraryImport state
            , renderLibraryBooks state
            ]
        ]

  renderManual state =
    HH.iframe
      [ HP.src (state.routeBase <> "docs/")
      , HP.title "Workbench manual"
      , classNames [ "manual-frame" ]
      ]

  renderLibraryImport state =
    HH.element (HH.ElemName "md-elevated-card")
      [ classNames [ "panel", "library-import-panel" ]
      , mdSurface "books"
      ]
      [ HH.div
          [ classNames [ "panel-heading" ] ]
          [ HH.div_
              [ HH.h2_ [ HH.text "Add book" ]
              , HH.p_ [ HH.text "Import overlay, blueprint, SHACL, or store JSON into this browser." ]
              ]
          ]
      , HH.label
          [ classNames [ "field-stack" ] ]
          [ HH.span
              [ classNames [ "field-label" ] ]
              [ HH.text "Book Turtle" ]
          , HH.textarea
              [ HP.value state.libraryInput
              , HP.rows 8
              , HH.attr (HH.AttrName "aria-label") "Book Turtle"
              , HE.onValueInput SetLibraryInput
              ]
          ]
      , HH.div
          [ classNames [ "library-actions" ] ]
          [ HH.element (HH.ElemName "md-filled-button")
              [ classNames [ "primary-action" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "primary"
              , HP.disabled (String.trim state.libraryInput == "")
              , HE.onClick (\_ -> AddLibraryBook)
              ]
              [ HH.text "Add book" ]
          , HH.element (HH.ElemName "md-outlined-button")
              [ classNames [ "secondary-action" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "secondary"
              , HP.disabled
                  ( Array.null
                      ( BookStore.selectedBooks
                          { kind: BookStore.envelopeKind, books: state.books }
                      )
                  )
              , HE.onClick (\_ -> ExportSelectedLibraryBooks)
              ]
              [ HH.text "Export selected books" ]
          , HH.element (HH.ElemName "md-outlined-button")
              [ classNames [ "secondary-action" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "secondary"
              , HP.disabled (Array.null state.books)
              , HE.onClick (\_ -> ExportAllLibraryBooks)
              ]
              [ HH.text "Export all books" ]
          ]
      , HH.div
          [ classNames [ "library-exchange-grid" ] ]
          [ HH.div
              [ classNames [ "library-url-row" ] ]
              [ HH.label
                  [ classNames [ "field-stack", "library-url-field" ] ]
                  [ HH.span
                      [ classNames [ "field-label" ] ]
                      [ HH.text "Book URL" ]
                  , HH.input
                      [ HP.type_ HP.InputText
                      , HP.value state.libraryUrl
                      , HH.attr (HH.AttrName "aria-label") "Book URL"
                      , HE.onValueInput SetLibraryUrl
                      ]
                  ]
              , HH.element (HH.ElemName "md-outlined-button")
                  [ classNames [ "secondary-action" ]
                  , HH.attr (HH.AttrName "role") "button"
                  , mdControl "secondary"
                  , HP.disabled (String.trim state.libraryUrl == "")
                  , HE.onClick (\_ -> ImportLibraryBookFromUrl)
                  ]
                  [ HH.text "Import book from URL" ]
              ]
          , HH.label
              [ classNames [ "field-stack", "library-file-field" ] ]
              [ HH.span
                  [ classNames [ "field-label" ] ]
                  [ HH.text "Book file" ]
              , HH.input
                  [ HH.attr (HH.AttrName "id") "library-book-file"
                  , HH.attr (HH.AttrName "type") "file"
                  , HH.attr (HH.AttrName "aria-label") "Book file"
                  , HH.attr
                      (HH.AttrName "accept")
                      ".ttl,.json,.txt,application/json,text/turtle,text/plain"
                  , HE.onChange (\_ -> ImportLibraryBookFile)
                  ]
              ]
          , HH.label
              [ classNames [ "field-stack", "library-file-field" ] ]
              [ HH.span
                  [ classNames [ "field-label" ] ]
                  [ HH.text "Book store JSON file" ]
              , HH.input
                  [ HH.attr (HH.AttrName "id") "library-store-file"
                  , HH.attr (HH.AttrName "type") "file"
                  , HH.attr (HH.AttrName "aria-label") "Book store JSON file"
                  , HH.attr (HH.AttrName "accept") ".json,application/json"
                  , HE.onChange (\_ -> ImportLibraryStoreFile)
                  ]
              ]
          ]
      , case state.libraryError, state.libraryStatus of
          Just err, _ ->
            HH.div
              [ classNames [ "sparql-lens-error" ]
              , HH.attr (HH.AttrName "role") "alert"
              ]
              [ HH.text (libraryErrorPrefix err <> err) ]
          Nothing, Just status ->
            HH.div
              [ classNames [ "privacy-note", "library-import-success" ]
              , HH.attr (HH.AttrName "role") "status"
              ]
              [ HH.text status ]
          Nothing, Nothing -> HH.text ""
      ]

  libraryErrorPrefix err =
    if
      StringCodeUnits.contains (String.Pattern "Save failed") err
        || StringCodeUnits.contains (String.Pattern "Could not read editor draft") err
    then
      "Book save failed: "
    else
      "Book import failed: "

  renderLibraryBooks state =
    HH.div
      [ classNames [ "library-book-list" ] ]
      ( if Array.null state.books then
          [ HH.div
              [ classNames [ "empty-state" ] ]
              [ HH.text "No books stored." ]
          ]
        else
          map (renderLibraryBook state) state.books
      )

  renderLibraryBook state book =
    let
      editName = bookEditName state book
      saveDisabled = String.trim editName == "" || editName == book.name
    in
      HH.element (HH.ElemName "md-elevated-card")
        [ classNames [ "library-book" ]
        , mdSurface "books"
        ]
        [ HH.div
            [ classNames [ "library-book-heading" ] ]
            [ HH.div_
                [ HH.h2_ [ HH.text book.name ]
                , HH.p_ [ HH.text (libraryBookSummary book) ]
                ]
            , HH.label
                [ classNames [ "switch-row", "library-select-row" ] ]
                [ HH.input
                    [ HP.type_ HP.InputCheckbox
                    , HP.checked book.selected
                    , HH.attr (HH.AttrName "aria-label") ("Select " <> book.name)
                    , HE.onChecked (ToggleLibraryBook book.id)
                    ]
                , HH.element (HH.ElemName "md-switch")
                    [ classNames [ "persist-md-switch" ]
                    , HH.attr (HH.AttrName "aria-hidden") "true"
                    , HH.attr (HH.AttrName "tabindex") "-1"
                    ]
                    []
                , HH.span_ [ HH.text "Selected" ]
                ]
            ]
        , HH.div
            [ classNames [ "library-book-meta" ] ]
            [ HH.span_ [ HH.text (if book.seed then "seed" else "local") ]
            , HH.span_ [ HH.text book.source ]
            , HH.span_ [ HH.text (libraryEditorModeLabel (libraryBookEditorMode book) <> " editor") ]
            ]
        , HH.div
            [ classNames [ "library-book-controls" ] ]
            [ HH.label
                [ classNames [ "field-stack", "library-name-field" ] ]
                [ HH.span
                    [ classNames [ "field-label" ] ]
                    [ HH.text "Name" ]
                , HH.input
                    [ HP.type_ HP.InputText
                    , HP.value editName
                    , HH.attr (HH.AttrName "aria-label") ("Rename " <> book.name)
                    , HE.onValueInput (SetLibraryBookName book.id)
                    ]
                ]
            , HH.div
                [ classNames [ "library-row-actions" ] ]
                [ HH.element (HH.ElemName "md-outlined-button")
                    [ classNames [ "secondary-action" ]
                    , HH.attr (HH.AttrName "role") "button"
                    , mdControl "secondary"
                    , HP.disabled saveDisabled
                    , HE.onClick (\_ -> SaveLibraryBookName book.id)
                    ]
                    [ HH.text ("Save name for " <> book.name) ]
                , HH.element (HH.ElemName "md-outlined-button")
                    [ classNames [ "danger-action" ]
                    , HH.attr (HH.AttrName "role") "button"
                    , mdControl "secondary"
                    , HE.onClick (\_ -> DeleteLibraryBook book.id)
                    ]
                    [ HH.text ("Delete " <> book.name) ]
                ]
            ]
        , renderLibraryBookEditor state book
        ]

  renderLibraryBookEditor state book =
    let
      sourceText = libraryBookSourceText book
      editorMode = libraryBookEditorMode book
      saved = state.copiedPath == Just ("library:" <> book.id <> ":saved")
      copied = state.copiedPath == Just ("library:" <> book.id)
    in
      HH.div
        [ classNames [ "library-source-panel" ] ]
        [ HH.div
            [ classNames [ "library-source-heading" ] ]
            [ HH.div_
                [ HH.h3_ [ HH.text "Source" ]
                , HH.p_ [ HH.text "Draft edits stay local until you save." ]
                ]
            , HH.div
                [ classNames [ "library-row-actions", "library-source-actions" ] ]
                [ HH.element (HH.ElemName "md-outlined-button")
                    [ classNames [ "secondary-action" ]
                    , HH.attr (HH.AttrName "role") "button"
                    , mdControl "secondary"
                    , HE.onClick (\_ -> CopyLibraryBookSource book.id)
                    ]
                    [ HH.text
                        ( if copied then
                            "Copied " <> book.name <> " source"
                          else
                            "Copy " <> book.name <> " source"
                        )
                    ]
                , HH.element (HH.ElemName "md-outlined-button")
                    [ classNames [ "secondary-action" ]
                    , HH.attr (HH.AttrName "role") "button"
                    , mdControl "secondary"
                    , HE.onClick (\_ -> SaveLibraryBookSource book.id)
                    ]
                    [ HH.text ("Save " <> book.name <> " source") ]
                , if saved then
                    HH.span
                      [ classNames [ "inline-status" ] ]
                      [ HH.text ("Saved " <> book.name <> " source") ]
                  else
                    HH.text ""
                ]
            ]
        , HH.slot_
            _libraryEditor
            book.id
            libraryEditorComponent
            { value: sourceText
            , mode: editorMode
            }
        ]

  renderSettingsSummary state =
    HH.element (HH.ElemName "md-elevated-card")
      [ classNames [ "settings-summary", "decode-config-panel" ]
      , mdSurface "input"
      ]
      [ HH.div
          [ classNames [ "li-panel-header", "decode-config-header" ] ]
          [ HH.div
              [ classNames [ "panel-title-lockup" ] ]
              [ HH.element (HH.ElemName "md-icon") [] [ HH.text "tune" ]
              , HH.div_
                  [ HH.h2
                      [ classNames [ "li-panel-title" ] ]
                      [ HH.text "Decode config" ]
                  , HH.p_ [ HH.text "Provider context used when a hash lookup needs chain data." ]
                  ]
              ]
          , HH.a
              [ classNames [ "header-link" ]
              , HP.href (state.routeBase <> Routing.routePath RouteSettings)
              , HE.onClick (Navigate RouteSettings)
              ]
              [ HH.text "Settings" ]
          ]
      , HH.div
          [ classNames [ "decode-config-body" ] ]
          [ renderConfigRow "hub" "Provider" (Provider.providerName state.provider)
          , renderConfigRow "public" "Network" (networkName state.network)
          , renderConfigRow
              "vpn_key"
              "Credentials"
              "Memory only / encrypted vault"
          ]
      ]

  renderConfigRow icon label value =
    HH.div
      [ classNames [ "decode-config-row" ] ]
      [ HH.element (HH.ElemName "md-icon") [] [ HH.text icon ]
      , HH.div_
          [ HH.span_ [ HH.text label ]
          , HH.strong_ [ HH.text value ]
          ]
      ]

  renderLoadedInspectorHeader state =
    let
      selected = selectedBooks state
      parts = selectedBookParts state
      overlayCount = Array.length (selectedOverlayParts state)
      blueprintCount = Array.length (selectedBlueprintParts state)
      shaclCount = Array.length (selectedShaclParts state)
      txHash = loadedTxHash state
      txIdPath = "loaded-header:tx-id"
      cborPath = "loaded-header:cbor"
      renderContextItem label extraClasses content =
        HH.div
          [ classNames ([ "loaded-context-item" ] <> extraClasses) ]
          ([ HH.span_ [ HH.text label ] ] <> content)
      renderCopyContextValue label path fullValue displayValue =
        HH.div
          [ classNames [ "loaded-context-value" ] ]
          [ HH.code
              [ classNames [ "summary-copy-target" ]
              , HP.title fullValue
              , HE.onClick (\_ -> CopyValue path fullValue)
              ]
              [ HH.text displayValue ]
          , HH.element (HH.ElemName "md-outlined-button")
              [ HE.onClick (\_ -> CopyValue path fullValue)
              , classNames [ "inline-action", "loaded-context-copy" ]
              , HH.attr (HH.AttrName "role") "button"
              , HH.attr (HH.AttrName "aria-label") ("Copy " <> label)
              , mdControl "inline"
              ]
              [ HH.text
                  ( if state.copiedPath == Just path then
                      "Copied"
                    else
                      "Copy"
                  )
              ]
          ]
    in
      HH.section
        [ classNames [ "loaded-inspector-header" ]
        , HH.attr (HH.AttrName "aria-label") "Loaded transaction controls"
        ]
        [ HH.div
            [ classNames [ "loaded-inspector-context" ] ]
            ( [ renderContextItem "Source" [] [ HH.strong_ [ HH.text (modeLabel state.mode) ] ]
              , renderContextItem "Provider" [] [ HH.strong_ [ HH.text (Provider.providerName state.provider) ] ]
              , renderContextItem "Network" [] [ HH.strong_ [ HH.text (networkName state.network) ] ]
              , renderContextItem "Tx id/hash"
                  [ "loaded-context-hash" ]
                  [ renderCopyContextValue "Tx id/hash" txIdPath txHash txHash ]
              ]
                <> (case state.txCbor of
                  Just cbor ->
                    [ renderContextItem "CBOR"
                        [ "loaded-context-cbor" ]
                        [ renderCopyContextValue "CBOR" cborPath cbor (middleTruncate 16 8 cbor) ]
                    ]
                  Nothing ->
                    []
                )
            )
        , HH.div
            [ classNames [ "loaded-book-context" ] ]
            [ HH.span_ [ HH.text (show (Array.length selected) <> " selected") ]
            , HH.span_ [ HH.text (show (Array.length parts) <> " parts") ]
            , HH.span_ [ HH.text (show overlayCount <> " overlays") ]
            , HH.span_ [ HH.text (show blueprintCount <> " blueprints") ]
            , HH.span_ [ HH.text (show shaclCount <> " SHACL") ]
            ]
        , HH.div
            [ classNames [ "loaded-inspector-actions" ] ]
            [ HH.element (HH.ElemName "md-outlined-button")
                [ classNames [ "secondary-action" ]
                , HH.attr (HH.AttrName "role") "button"
                , mdControl "secondary"
                , HE.onClick (\_ -> ChangeInput)
                ]
                [ HH.text "Change input" ]
            , HH.a
                [ classNames [ "header-link" ]
                , HP.href (state.routeBase <> Routing.routePath RouteLibrary)
                , HE.onClick (Navigate RouteLibrary)
                ]
                [ HH.text "Library" ]
            , HH.element (HH.ElemName "md-filled-button")
                [ classNames [ "primary-action" ]
                , HH.attr (HH.AttrName "role") "button"
                , mdControl "primary"
                , HP.disabled state.running
                , HE.onClick (\_ -> ApplySelectedBooks)
                ]
                [ HH.text "Apply selected books" ]
            ]
        ]

  modeLabel mode =
    case mode of
      ByHash -> "Tx hash"
      ByHex  -> "CBOR hex"

  loadedTxHash state =
    case state.identification of
      Just identification | identification.valid ->
        case Array.find (\row -> row.path == "[\"identification\",\"tx_id\"]") identification.primary of
          Just row -> row.value
          Nothing ->
            case Array.find (\row -> row.path == "[\"identification\",\"body_hash\"]") identification.primary of
              Just row -> row.value
              Nothing  -> fallbackInputHash state
      _ -> fallbackInputHash state

  fallbackInputHash state =
    let
      trimmedHash = String.trim state.txHash
    in
      if trimmedHash == "" then "decoded transaction"
      else trimmedHash

  renderBooksPanel state collapsed =
    let
      selected = selectedBooks state
      parts = selectedBookParts state
      overlayCount = Array.length (selectedOverlayParts state)
      blueprintCount = Array.length (selectedBlueprintParts state)
      shaclCount = Array.length (selectedShaclParts state)
      plural n singular pluralForm = show n <> if n == 1 then singular else pluralForm
      pills =
        HH.div
          [ classNames [ "tech-pills" ] ]
          [ HH.span_ [ HH.text (show (Array.length selected) <> " selected") ]
          , HH.span_ [ HH.text (plural (Array.length parts) " part" " parts") ]
          , HH.span_ [ HH.text (plural overlayCount " overlay" " overlays") ]
          , HH.span_ [ HH.text (plural blueprintCount " blueprint" " blueprints") ]
          , HH.span_ [ HH.text (plural shaclCount " SHACL shape" " SHACL shapes") ]
          ]
      libraryLink =
        HH.a
          [ classNames [ "header-link" ]
          , HP.href (state.routeBase <> Routing.routePath RouteLibrary)
          , HE.onClick (Navigate RouteLibrary)
          ]
          [ HH.text "Library" ]
    in
      if collapsed then
        -- Once a transaction is decoded, the loaded-inspector header already shows the
        -- books summary + Library/Apply controls, so drop the separate Books panel
        -- entirely rather than duplicate that bar; the decoded structure becomes the star.
        HH.text ""
      else
        HH.element (HH.ElemName "md-elevated-card")
          [ classNames [ "panel", "books-panel", "resolution-books-panel" ]
          , mdSurface "books"
          ]
          [ HH.div
              [ classNames [ "li-panel-header", "books-panel-header" ] ]
              [ HH.div
                  [ classNames [ "panel-title-lockup" ] ]
                  [ HH.element (HH.ElemName "md-icon") [] [ HH.text "menu_book" ]
                  , HH.div_
                      [ HH.h2
                          [ classNames [ "li-panel-title" ] ]
                          [ HH.text "Resolution books" ]
                      , HH.p_ [ HH.text "RDF sources that name on-chain identifiers." ]
                      ]
                  ]
              , HH.a
                  [ classNames [ "header-link", "books-add-link" ]
                  , HP.href (state.routeBase <> Routing.routePath RouteLibrary)
                  , HE.onClick (Navigate RouteLibrary)
                  ]
                  [ HH.element (HH.ElemName "md-icon") [] [ HH.text "add" ]
                  , HH.text "Add"
                  ]
              ]
          , HH.div
              [ classNames [ "books-panel-body" ] ]
              [ pills
              , HH.div
                  [ classNames [ "books-list" ] ]
                  ( if Array.null selected then
                      [ HH.div
                          [ classNames [ "li-empty-state", "books-empty-state" ] ]
                          [ HH.element (HH.ElemName "md-icon") [ classNames [ "li-empty-icon" ] ] [ HH.text "menu_book" ]
                          , HH.div [ classNames [ "li-empty-title" ] ] [ HH.text "No selected books" ]
                          , HH.p [ classNames [ "li-empty-copy" ] ] [ HH.text "Select books in Library to resolve ledger names." ]
                          ]
                      ]
                    else
                      map renderSelectedBook selected
                  )
              ]
          , HH.div
              [ classNames [ "books-panel-footer" ] ]
              [ HH.div
                  [ classNames [ "sparql-status" ] ]
                  [ HH.element (HH.ElemName "md-icon") [] [ HH.text "hub" ]
                  , HH.span_
                      [ HH.text
                          ( "SPARQL engine ready - "
                              <> show (Array.length selected)
                              <> " books loaded"
                          )
                      ]
                  ]
              , HH.div
                  [ classNames [ "books-actions" ] ]
                  [ libraryLink
                  , HH.element (HH.ElemName "md-filled-button")
                      [ classNames [ "primary-action" ]
                      , HH.attr (HH.AttrName "role") "button"
                      , mdControl "primary"
                      , HP.disabled state.running
                      , HE.onClick (\_ -> ApplySelectedBooks)
                      ]
                      [ HH.text "Apply selected books" ]
                  ]
              ]
          ]

  renderSelectedBook book =
    HH.div
      [ classNames [ "book-summary-row" ] ]
      [ HH.span
          [ classNames [ "book-status-dot" ] ]
          []
      , HH.div
          [ classNames [ "book-summary-copy" ] ]
          [ HH.strong_ [ HH.text book.name ]
          , HH.code
              [ classNames [ "book-source" ] ]
              [ HH.text book.source ]
          ]
      , HH.span
          [ classNames [ "book-term-count" ] ]
          [ HH.text (libraryBookSummary book) ]
      , HH.element (HH.ElemName "md-icon")
          [ classNames [ "book-status-icon" ] ]
          [ HH.text "check_circle" ]
      ]

  renderDecodedStructure state =
    HH.section
      [ classNames [ "decoded-screen" ] ]
      [ case state.decodedTreeLens of
          Just lens ->
            renderDecodedTreeLens state lens
          Nothing ->
            HH.div
              [ classNames [ "li-empty-state", "decoded-structure-placeholder" ] ]
              [ HH.element (HH.ElemName "md-icon") [ classNames [ "li-empty-icon" ] ] [ HH.text "account_tree" ]
              , HH.div [ classNames [ "li-empty-title" ] ] [ HH.text "No decoded tree yet" ]
              , HH.p [ classNames [ "li-empty-copy" ] ] [ HH.text "Decode a transaction to populate the structured Conway tree." ]
              ]
      ]

  renderDecodedTreeLens state lens =
    case lens.error of
      Just err ->
        HH.div
          [ classNames [ "sparql-lens-error" ] ]
          [ HH.text ("Decoded-tree query failed: " <> err) ]
      Nothing ->
        if Array.null lens.rows then
          HH.div
            [ classNames [ "li-empty-state" ] ]
            [ HH.element (HH.ElemName "md-icon") [ classNames [ "li-empty-icon" ] ] [ HH.text "account_tree" ]
            , HH.div [ classNames [ "li-empty-title" ] ] [ HH.text "No decoded RDF tree rows" ]
            , HH.p [ classNames [ "li-empty-copy" ] ] [ HH.text "The decoded transaction did not expose structure rows." ]
            ]
        else
          HH.div
            [ classNames [ "decoded-structure-stack" ] ]
            [ renderDecodedSummaryHeader state lens.rows
            , renderDecodedQuickStats lens.rows
            , renderDecodedToolbar state lens.rows
            , HH.div
                [ classNames [ "decoded-tree-container" ] ]
                (renderDecodedTreeRows state "" lens.rows)
            , renderDecodedBytesPanel state
            ]

  renderDecodedToolbar state _rows =
    HH.div
      [ classNames [ "decoded-toolbar" ] ]
      [ renderDecodedResolutionDisclosure state
      , HH.div
          [ classNames [ "decoded-row-style" ]
          , HH.attr (HH.AttrName "aria-label") "Row style"
          ]
          [ HH.span_ [ HH.text "Row style" ]
          , HH.div
              [ classNames [ "decoded-row-style-toggle" ] ]
              [ renderDecodedRowStyleButton state "quiet" "A - Quiet"
              , renderDecodedRowStyleButton state "labeled" "B - Labeled"
              ]
          ]
      , HH.div
          [ classNames [ "decoded-toolbar-actions" ] ]
          [ HH.element (HH.ElemName "md-outlined-button")
              [ HE.onClick (\_ -> ExpandDecodedTree)
              , classNames [ "decoded-toolbar-button" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "secondary"
              ]
              [ HH.element (HH.ElemName "md-icon") [] [ HH.text "unfold_more" ]
              , HH.text "Expand"
              ]
          , HH.element (HH.ElemName "md-outlined-button")
              [ HE.onClick (\_ -> CollapseDecodedTree)
              , classNames [ "decoded-toolbar-button" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "secondary"
              ]
              [ HH.element (HH.ElemName "md-icon") [] [ HH.text "unfold_less" ]
              , HH.text "Collapse"
              ]
          ]
      ]

  renderDecodedResolutionDisclosure state =
    let
      entries = resolutionInventory state
      countLabel = show (Array.length entries) <> " identifiers resolved to names"
    in
      HH.div
        [ classNames [ "decoded-resolution-disclosure" ] ]
        [ HH.button
            [ classNames [ "decoded-resolved-readout" ]
            , HH.attr (HH.AttrName "type") "button"
            , HH.attr (HH.AttrName "aria-expanded") (if state.decodedResolutionsExpanded then "true" else "false")
            , HE.onClick (\_ -> ToggleDecodedResolutions)
            ]
            [ HH.element (HH.ElemName "md-icon") [] [ HH.text "auto_awesome" ]
            , HH.span_ [ HH.text countLabel ]
            ]
        , if state.decodedResolutionsExpanded then
            HH.div
              [ classNames [ "decoded-resolution-list" ] ]
              (map renderDecodedResolutionEntry entries)
          else
            HH.text ""
        ]

  renderDecodedResolutionEntry entry =
    HH.div
      [ classNames [ "decoded-resolution-entry" ] ]
      [ HH.strong
          [ classNames [ "decoded-resolution-label" ] ]
          [ HH.text entry.label ]
      , HH.code
          [ classNames [ "decoded-resolution-identifier" ] ]
          [ HH.text entry.identifier ]
      ]

  renderDecodedRowStyleButton state style label =
    HH.button
      [ classNames
          ( if state.decodedRowStyle == style then
              [ "decoded-row-style-button", "is-selected" ]
            else
              [ "decoded-row-style-button" ]
          )
      , HH.attr (HH.AttrName "type") "button"
      , HH.attr (HH.AttrName "aria-pressed") (if state.decodedRowStyle == style then "true" else "false")
      , HE.onClick (\_ -> SetDecodedRowStyle style)
      ]
      [ HH.text label ]

  renderDecodedTreeRows state parentId rows =
    groupDecodedEmpties state rows
      (Array.filter (\row -> row.parentId == parentId) rows)

  -- Collapse each run of empty (NULL) leaf siblings into one expandable
  -- "Absent fields (n)" chip in place, so populated fields are not buried under a wall of
  -- nulls. CDDL order is preserved (the chip sits at the run's position) and faithfulness
  -- is intact: the chip is a normal tree toggle, so expanding it re-renders every field.
  groupDecodedEmpties state rows children =
    let
      isEmptyLeaf row =
        row.kind == "null" && not (Array.any (\c -> c.parentId == row.id) rows)
      flush run acc =
        case Array.length run of
          0 -> acc
          _ -> acc <> renderEmptyRun state rows run
      step accRun row =
        if isEmptyLeaf row then
          accRun { run = Array.snoc accRun.run row }
        else
          { acc: flush accRun.run accRun.acc <> renderDecodedTreeRow state rows row, run: [] }
      final = Array.foldl step { acc: [], run: [] } children
    in
      flush final.run final.acc

  renderEmptyRun state rows run =
    let
      groupId = case Array.head run of
        Just r -> "empty::" <> r.id
        Nothing -> "empty::"
      depth = case Array.head run of
        Just r -> r.depth
        Nothing -> 0
      expanded = Array.elem groupId state.decodedEmptyExpanded
      labels = String.joinWith ", " (map _.label run)
      countLabel = "Absent fields (" <> show (Array.length run) <> ")"
      rowClasses =
        [ "decoded-tree-row", "decoded-tree-row--group", "decoded-tree-empty-group", "decoded-tree-depth-" <> show depth ]
          <> (if expanded then [ "is-expanded" ] else [])
      chip =
        HH.div
          [ classNames rowClasses
          , HH.attr (HH.AttrName "style") ("--depth: " <> show depth <> ";")
          , HH.attr (HH.AttrName "role") "button"
          , HH.attr (HH.AttrName "aria-expanded") (if expanded then "true" else "false")
          , HE.onClick (\_ -> ToggleDecodedEmpty groupId)
          ]
          [ HH.div
              [ classNames [ "decoded-tree-gutter" ] ]
              [ HH.element (HH.ElemName "md-icon")
                  [ classNames [ "decoded-tree-chevron" ] ]
                  [ HH.text "chevron_right" ]
              ]
          , HH.div
              [ classNames [ "decoded-tree-main" ] ]
              [ HH.div
                  [ classNames [ "decoded-tree-line" ] ]
                  [ HH.span
                      [ classNames [ "decoded-tree-key", "decoded-tree-key--group" ] ]
                      [ HH.text countLabel ]
                  , HH.span
                      [ classNames [ "li-chip", "decoded-tree-count" ] ]
                      [ HH.text (show (Array.length run)) ]
                  , if expanded then HH.text ""
                    else
                      HH.span
                        [ classNames [ "empty-group-labels" ] ]
                        [ HH.text labels ]
                  ]
              ]
          ]
    in
      [ chip ]
        <> (if expanded then Array.concatMap (renderDecodedTreeRow state rows) run else [])

  renderDecodedTreeRow state rows row =
    let
      hasChildren = decodedTreeHasChildren rows row
      expanded = row.parentId == "" || Array.elem row.id state.decodedTreeExpanded
      isNull = row.kind == "null" && not hasChildren
      resolvedName = decodedRowResolvedName state row
      isResolved = resolvedName /= ""
      rowClasses =
        [ "decoded-tree-row", "decoded-tree-depth-" <> show row.depth ]
          <> (if hasChildren then [ "decoded-tree-row--group" ] else [])
          <> (if isResolved then [ "decoded-tree-row--resolved" ] else [])
          <> (if isNull then [ "decoded-tree-empty-field" ] else [])
          <> (if hasChildren && expanded then [ "is-expanded" ] else [])
      rowAttrs =
        [ classNames rowClasses
        , HP.id row.id
        , HH.attr (HH.AttrName "style") ("--depth: " <> show row.depth <> ";")
        ]
          <> ( if hasChildren then
                [ HH.attr (HH.AttrName "role") "button"
                , HH.attr (HH.AttrName "aria-expanded") (if expanded then "true" else "false")
                , HE.onClick (\_ -> ToggleDecodedTree row.id)
                ]
              else
                []
            )
      valueText = decodedTreeValueText row
      rawText = decodedTreeRawText row
      showScalarCopy = not hasChildren && not isResolved && not isNull && decodedTreeCanCopy row
      trailingActions =
        ( if showScalarCopy then
            [ renderDecodedCopyIcon row.id rawText "Copy value" ]
          else
            []
        )
          <> [ renderDecodedTreeAnnotationAction state row ]
      typeClasses =
        if state.decodedRowStyle == "labeled" then
          [ "decoded-tree-type", "decoded-tree-type--labeled" ]
          else
          [ "decoded-tree-type", "decoded-tree-type--quiet" ]
    in
      [ HH.div
          rowAttrs
          ( [ HH.div
                [ classNames [ "decoded-tree-gutter" ] ]
                [ if hasChildren then
                    HH.element (HH.ElemName "md-icon")
                      [ classNames [ "decoded-tree-chevron" ] ]
                      [ HH.text "chevron_right" ]
                  else
                    HH.text ""
                ]
            , HH.div
              [ classNames [ "decoded-tree-main" ] ]
              [ HH.div
                  [ classNames [ "decoded-tree-line" ] ]
                  ( [ HH.span
                        [ classNames
                            ( if hasChildren then
                                [ "decoded-tree-key", "decoded-tree-key--group" ]
                              else
                                [ "decoded-tree-key" ]
                            )
                        ]
                        [ HH.text row.label ]
                    ]
                      <> ( if hasChildren then
                            [ HH.span
                                [ classNames [ "li-chip", "decoded-tree-count" ] ]
                                [ HH.text (show (decodedTreeChildCount rows row.id)) ]
                            ]
                          else if isResolved then
                            [ HH.span
                                [ classNames [ "decoded-tree-resolved-name" ] ]
                                [ HH.element (HH.ElemName "md-icon")
                                    [ classNames [ "decoded-tree-kind-icon" ] ]
                                    [ HH.text (decodedTreeKindIcon row) ]
                                , HH.text resolvedName
                                ]
                            , HH.span
                                [ classNames [ "li-chip", "decoded-tree-book-chip" ] ]
                                [ HH.element (HH.ElemName "md-icon") [] [ HH.text "menu_book" ]
                                , HH.text (decodedResolutionSourceLabel state)
                                ]
                            ]
                          else
                            [ HH.span
                                [ classNames
                                    ( if isNull then
                                        [ "decoded-tree-value", "decoded-tree-value--null" ]
                                      else
                                        [ "decoded-tree-value" ]
                                    )
                                ]
                                [ if isNull then HH.text "null" else renderDecodedTreeValue row valueText ]
                            ]
                         )
                      <> [ HH.span
                            [ classNames typeClasses ]
                            [ HH.text row.kind ]
                         ]
                  )
              , if isResolved then
                  HH.div
                    [ classNames [ "decoded-tree-raw-line" ] ]
                    [ HH.span
                        [ classNames [ "decoded-tree-raw-value" ]
                        , HP.title rawText
                        ]
                        [ HH.text rawText ]
                    , renderDecodedCopyIcon row.id rawText "Copy raw value"
                    ]
                else
                  HH.text ""
              , renderDecodedTreeAnnotation state row
              ]
            ]
              <> [ HH.div
                    [ classNames [ "decoded-tree-trailing" ] ]
                    trailingActions
                 ]
          )
      ] <> if expanded && hasChildren then
        renderDecodedTreeRows state row.id rows
      else []

  renderDecodedTreeValue row valueText =
    if decodedTreeFullSubject row valueText /= "" then
      renderDecodedTreeSummary row valueText
    else
      renderDecodedTreeIri valueText

  renderDecodedCopyIcon path value label =
    if value == "" || value == "NULL" then
      HH.text ""
    else
      HH.element (HH.ElemName "md-icon-button")
        [ HE.onClick (\_ -> CopyValue path value)
        , classNames [ "decoded-copy-button" ]
        , HH.attr (HH.AttrName "role") "button"
        , HH.attr (HH.AttrName "aria-label") label
        , HP.title label
        , mdControl "icon"
        ]
        [ HH.element (HH.ElemName "md-icon") [] [ HH.text "content_copy" ] ]

  renderDecodedBytesPanel state =
    let
      bytes = case state.txCbor of
        Just cbor -> hexBytePairs cbor
        Nothing   -> []
      shown = Array.take 220 bytes
      total = Array.length bytes
      shownCount = Array.length shown
      byteCountLabel =
        if total == shownCount then
          show total <> " bytes"
        else
          show shownCount <> " / " <> show total <> " bytes"
    in
      HH.div
        [ classNames [ "decoded-bytes-panel", "li-panel" ] ]
        [ HH.button
            [ classNames [ "decoded-bytes-toggle" ]
            , HH.attr (HH.AttrName "type") "button"
            , HH.attr (HH.AttrName "aria-expanded") (if state.decodedBytesExpanded then "true" else "false")
            , HE.onClick (\_ -> ToggleDecodedBytes)
            ]
            [ HH.element (HH.ElemName "md-icon")
                [ classNames [ "decoded-bytes-chevron" ] ]
                [ HH.text "chevron_right" ]
            , HH.element (HH.ElemName "md-icon")
                [ classNames [ "decoded-bytes-icon" ] ]
                [ HH.text "data_object" ]
            , HH.span
                [ classNames [ "decoded-bytes-title" ] ]
                [ HH.text "CBOR bytes" ]
            , HH.span
                [ classNames [ "decoded-bytes-count" ] ]
                [ HH.text byteCountLabel ]
            , HH.span
                [ classNames [ "decoded-bytes-hint" ] ]
                [ HH.text "Byte ranges unavailable" ]
            ]
        , if state.decodedBytesExpanded then
            HH.div
              [ classNames [ "decoded-byte-grid" ] ]
              ( if Array.null shown then
                  [ HH.span
                      [ classNames [ "decoded-bytes-empty" ] ]
                      [ HH.text "No CBOR bytes loaded." ]
                  ]
                else
                  map renderDecodedByte shown
              )
          else
            HH.text ""
        ]

  renderDecodedByte value =
    HH.span
      [ classNames [ "decoded-byte" ] ]
      [ HH.text value ]

  hexBytePairs value =
    hexBytePairsGo (String.trim value)

  hexBytePairsGo value =
    if StringCodeUnits.length value == 0 then
      []
    else
      [ StringCodeUnits.take 2 value ]
        <> hexBytePairsGo (StringCodeUnits.drop 2 value)

  decodedTreeHasChildren rows row =
    Array.any (\candidate -> candidate.parentId == row.id) rows

  decodedTreeChildCount rows rowId =
    Array.length (Array.filter (\candidate -> candidate.parentId == rowId) rows)

  decodedTreeValueText row =
    if row.kind == "null" then "null"
    else if row.value /= "" && row.value /= "NULL" then row.value
    else row.summary

  decodedTreeRawText row =
    if row.raw /= "" && row.raw /= "NULL" then row.raw
    else decodedTreeValueText row

  decodedTreeCanCopy row =
    row.kind == "hash"
      || row.kind == "raw-bytes"
      || row.kind == "address"
      || row.kind == "key"
      || row.kind == "signature"
      || row.annotationValue /= ""

  decodedTreeKindIcon row =
    if row.kind == "address" then "account_balance"
    else if row.kind == "script" || row.kind == "script_hash" || row.kind == "hash" then "terminal"
    else if row.kind == "policy" || row.kind == "asset" || row.kind == "mint" then "token"
    else if row.kind == "pool" then "hub"
    else if row.kind == "key" || row.kind == "key-witness" then "key"
    else if row.kind == "drep" || row.kind == "vote" then "how_to_vote"
    else if row.kind == "datum" || row.kind == "raw-bytes" then "data_object"
    else if row.kind == "batcher" then "swap_horiz"
    else "label"

  decodedResolutionSourceLabel state =
    case selectedBooks state of
      [] -> "books"
      [ book ] -> book.name
      books -> show (Array.length books) <> " books"

  uniqueStrings values =
    Array.foldl
      ( \result value ->
          if value == "" || Array.elem value result then result
          else Array.snoc result value
      )
      []
      values

  resolutionInventory state =
    let
      rows = case state.resolvedLabelsLens of
        Just lens -> lens.rows
        Nothing -> []
      addEntry entries row =
        let
          identifier = if row.matched == "" then row.entity else row.matched
          entry =
            { label: row.label
            , identifier
            , candidates: uniqueStrings [ row.entity, row.matched ]
            }
          exists = Array.any (\candidate -> candidate.label == entry.label && candidate.identifier == entry.identifier) entries
        in
          if row.label == "" || identifier == "" || exists then entries
          else Array.snoc entries entry
    in
      Array.foldl addEntry [] rows

  resolutionNameForCandidates state candidates =
    let
      exactCandidates = uniqueStrings candidates
      matches entry =
        Array.any (\candidate -> Array.elem candidate entry.candidates) exactCandidates
    in
      case Array.find matches (resolutionInventory state) of
        Just entry -> entry.label
        Nothing -> ""

  decodedRowIdentifierCandidates row =
    uniqueStrings
      ( [ row.entityIri, row.value, row.raw, row.annotationValue ]
          <> if row.kind == "key" || row.kind == "key-witness" then
            [ "urn:cardano:id:key:" <> row.raw ]
          else if row.kind == "script" || row.kind == "script_hash" then
            [ "urn:cardano:id:script:" <> row.raw ]
          else
            []
      )

  decodedRowResolvedName state row =
    let
      indexed = resolutionNameForCandidates state (decodedRowIdentifierCandidates row)
    in
      if indexed == "" then row.resolvedLabel else indexed

  decodedEmptyGroupIds rows =
    rows
      # Array.filter (\row -> row.kind == "null" && not (decodedTreeHasChildren rows row))
      # map (\row -> "empty::" <> row.id)

  decodedTreeExpandableIds rows =
    rows
      # Array.filter (decodedTreeHasChildren rows)
      # map _.id

  renderDecodedSummaryHeader state rows =
    let
      txHash = loadedTxHash state
      valid = decodedIsValid rows
      validText = if valid then "true" else "false"
      copied = state.copiedPath == Just "decoded-summary:tx-hash"
    in
      HH.div
        [ classNames [ "decoded-summary-header" ] ]
        [ HH.div
            [ classNames [ "decoded-summary-title-group" ] ]
            [ HH.div
                [ classNames [ "decoded-summary-title-line" ] ]
                [ HH.h1_ [ HH.text "Decoded transaction" ]
                , HH.span
                    [ classNames
                        ( if valid then
                            [ "li-chip", "li-chip--success", "decoded-validity-chip" ]
                          else
                            [ "li-chip", "li-chip--error", "decoded-validity-chip" ]
                        )
                    ]
                    [ HH.element (HH.ElemName "md-icon") [] [ HH.text (if valid then "check_circle" else "error") ]
                    , HH.text ("is_valid: " <> validText)
                    ]
                ]
            , HH.div
                [ classNames [ "decoded-tx-hash" ] ]
                [ HH.element (HH.ElemName "md-icon") [] [ HH.text "tag" ]
                , HH.span
                    [ HP.title txHash ]
                    [ HH.text txHash ]
                , HH.element (HH.ElemName "md-icon-button")
                    [ HE.onClick (\_ -> CopyValue "decoded-summary:tx-hash" txHash)
                    , classNames [ "decoded-copy-button" ]
                    , HH.attr (HH.AttrName "role") "button"
                    , HH.attr (HH.AttrName "aria-label") "Copy tx hash"
                    , HP.title "Copy tx hash"
                    , mdControl "icon"
                    ]
                    [ HH.element (HH.ElemName "md-icon") [] [ HH.text (if copied then "check" else "content_copy") ] ]
                ]
            ]
        ]

  renderDecodedQuickStats rows =
    HH.div
      [ classNames [ "decoded-quick-stats" ] ]
      (map renderDecodedQuickStat (decodedQuickStats rows))

  renderDecodedQuickStat stat =
    HH.div
      [ classNames [ "decoded-quick-stat" ] ]
      [ HH.div
          [ classNames [ "decoded-quick-stat-value" ] ]
          [ HH.text stat.value ]
      , HH.div
          [ classNames [ "decoded-quick-stat-label" ] ]
          [ HH.text stat.label ]
      ]

  decodedQuickStats rows =
    [ { value: decodedGroupCount "decoded-body-inputs" rows, label: "inputs" }
    , { value: decodedGroupCount "decoded-body-outputs" rows, label: "outputs" }
    , { value: decodedFieldValue "decoded-body-fee" rows, label: "fee" }
    , { value: decodedPresentCount "decoded-body-mint" rows, label: "mint" }
    , { value: decodedGroupCount "decoded-witness_set-vkeys" rows, label: "signatures" }
    ]

  decodedGroupCount rowId rows =
    case decodedFindRow rowId rows of
      Just row | row.kind == "null" -> "0"
      Just _ -> show (decodedTreeChildCount rows rowId)
      Nothing -> "0"

  decodedPresentCount rowId rows =
    case decodedFindRow rowId rows of
      Just row | row.kind == "null" || row.value == "NULL" -> "0"
      Just _ -> "1"
      Nothing -> "0"

  decodedFieldValue rowId rows =
    case decodedFindRow rowId rows of
      Just row | row.kind == "null" || row.value == "NULL" -> "0"
      Just row -> decodedTreeValueText row
      Nothing -> "0"

  decodedIsValid rows =
    case decodedFindRow "decoded-is-valid" rows of
      Just row -> row.value /= "false" && row.raw /= "false"
      Nothing -> true

  decodedFindRow rowId rows =
    Array.find (\row -> row.id == rowId) rows

  renderDecodedTreeSummary row summaryText =
    let
      fullSubject = decodedTreeFullSubject row summaryText
    in
      if fullSubject /= "" then
        HH.button
          [ classNames [ "decoded-tree-subject", "summary-copy-target" ]
          , HP.title fullSubject
          , HH.attr (HH.AttrName "aria-label") ("Copy " <> row.label)
          , HE.onClick (\_ -> CopyValue row.id fullSubject)
          ]
          [ HH.text (middleTruncate 24 18 fullSubject) ]
      else
        renderDecodedTreeIri summaryText

  decodedTreeFullSubject row summaryText =
    if isCardanoUrn row.value then row.value
    else if isCardanoUrn summaryText then summaryText
    else ""

  renderDecodedTreeIri value =
    case curieForIri value of
      Just link ->
        HH.a
          [ classNames [ "decoded-tree-iri" ]
          , HP.href link.href
          , HP.target "_blank"
          , HP.rel "noopener noreferrer"
          , HP.title link.href
          ]
          [ HH.text link.label ]
      Nothing ->
        HH.text value

  curieForIri value =
    case Array.find (\prefix -> startsWith prefix.iri value) decodedTreeIriPrefixes of
      Just prefix ->
        Just
          { href: value
          , label:
              prefix.name
                <> StringCodeUnits.drop (StringCodeUnits.length prefix.iri) value
          }
      Nothing ->
        if startsWith "https://" value || startsWith "http://" value then
          Just { href: value, label: middleTruncate 32 24 value }
        else
          Nothing

  decodedTreeIriPrefixes =
    [ { name: "cardano:", iri: "https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#" }
    , { name: "rdf:", iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#" }
    , { name: "rdfs:", iri: "http://www.w3.org/2000/01/rdf-schema#" }
    , { name: "overlay:", iri: "https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#" }
    , { name: "owl:", iri: "http://www.w3.org/2002/07/owl#" }
    , { name: "xsd:", iri: "http://www.w3.org/2001/XMLSchema#" }
    , { name: "sh:", iri: "http://www.w3.org/ns/shacl#" }
    ]

  isCardanoUrn value =
    startsWith "urn:cardano:" value

  startsWith prefix value =
    StringCodeUnits.take (StringCodeUnits.length prefix) value == prefix

  middleTruncate headCount tailCount value =
    let
      valueLength = StringCodeUnits.length value
      limit = headCount + tailCount + 3
    in
      if valueLength <= limit then
        value
      else
        StringCodeUnits.take headCount value
          <> "..."
          <> StringCodeUnits.drop (valueLength - tailCount) value

  renderDecodedTreeAnnotation state row =
    case state.annotationDraft of
      Just draft | draft.rowId == row.id ->
        renderDecodedTreeAnnotationDraft state row draft
      _ ->
        HH.text ""

  renderDecodedTreeAnnotationAction state row =
    case state.annotationDraft of
      Just draft | draft.rowId == row.id ->
        HH.text ""
      _ ->
        if row.resolvedLabel == "" && row.annotationPredicate /= "" && row.annotationValue /= "" then
          HH.element (HH.ElemName "md-icon-button")
            [ classNames [ "inline-action", "decoded-tree-annotate" ]
            , HH.attr (HH.AttrName "role") "button"
            , HH.attr (HH.AttrName "aria-label") "Label this node"
            , mdControl "icon"
            , HE.onClick (\_ -> StartDecodedTreeAnnotation row)
            ]
            [ HH.element (HH.ElemName "md-icon") [] [ HH.text "edit" ] ]
        else
          HH.text ""

  renderDecodedTreeAnnotationDraft state row draft =
    let
      localBooks = selectedLocalBooks state
      hasLocalBooks = not (Array.null localBooks)
      saveDisabled =
        String.trim draft.label == ""
          || row.annotationPredicate == ""
          || row.annotationValue == ""
          || (draft.mode == "new" && String.trim draft.newBookName == "")
          || (draft.mode == "existing" && draft.bookId == "")
    in
      HH.div
        [ classNames [ "decoded-tree-annotation-form" ] ]
        [ HH.label
            [ classNames [ "field-stack" ] ]
            [ HH.span
                [ classNames [ "field-label" ] ]
                [ HH.text "Label" ]
            , HH.input
                [ HP.type_ HP.InputText
                , HP.value draft.label
                , HH.attr (HH.AttrName "aria-label") "Label"
                , HE.onValueInput SetDecodedTreeAnnotationLabel
                ]
            ]
        , HH.label
            [ classNames [ "field-stack" ] ]
            [ HH.span
                [ classNames [ "field-label" ] ]
                [ HH.text "Optional type" ]
            , HH.input
                [ HP.type_ HP.InputText
                , HP.value draft.typeName
                , HH.attr (HH.AttrName "aria-label") "Optional type"
                , HE.onValueInput SetDecodedTreeAnnotationType
                ]
            ]
        , HH.fieldset
            [ classNames [ "annotation-book-mode" ] ]
            [ HH.legend_ [ HH.text "Book" ]
            , HH.label
                [ choiceClass (draft.mode == "new") ]
                [ HH.input
                    [ HP.type_ HP.InputRadio
                    , HP.name ("annotation-book-mode-" <> row.id)
                    , HP.checked (draft.mode == "new")
                    , HE.onChange (\_ -> SetDecodedTreeAnnotationMode "new")
                    ]
                , HH.span
                    [ classNames [ "choice-title" ] ]
                    [ HH.text "Create new local book" ]
                ]
            , HH.label
                [ choiceClass (draft.mode == "existing") ]
                [ HH.input
                    [ HP.type_ HP.InputRadio
                    , HP.name ("annotation-book-mode-" <> row.id)
                    , HP.checked (draft.mode == "existing")
                    , HP.disabled (not hasLocalBooks)
                    , HE.onChange (\_ -> SetDecodedTreeAnnotationMode "existing")
                    ]
                , HH.span
                    [ classNames [ "choice-title" ] ]
                    [ HH.text "Append to existing book" ]
                ]
            ]
        , if draft.mode == "existing" then
            HH.label
              [ classNames [ "field-stack" ] ]
              [ HH.span
                  [ classNames [ "field-label" ] ]
                  [ HH.text "Target book" ]
              , HH.select
                  [ HP.value draft.bookId
                  , HH.attr (HH.AttrName "aria-label") "Target book"
                  , HE.onValueChange SetDecodedTreeAnnotationBookId
                  ]
                  (map renderAnnotationBookOption localBooks)
              ]
          else
            HH.label
              [ classNames [ "field-stack" ] ]
              [ HH.span
                  [ classNames [ "field-label" ] ]
                  [ HH.text "New book name" ]
              , HH.input
                  [ HP.type_ HP.InputText
                  , HP.value draft.newBookName
                  , HH.attr (HH.AttrName "aria-label") "New book name"
                  , HE.onValueInput SetDecodedTreeAnnotationNewBookName
                  ]
              ]
        , case draft.error of
            Just err ->
              HH.div
                [ classNames [ "sparql-lens-error" ] ]
                [ HH.text err ]
            Nothing -> HH.text ""
        , HH.div
            [ classNames [ "annotation-actions" ] ]
            [ HH.element (HH.ElemName "md-filled-button")
                [ classNames [ "primary-action" ]
                , HH.attr (HH.AttrName "role") "button"
                , mdControl "primary"
                , HP.disabled saveDisabled
                , HE.onClick (\_ -> SaveDecodedTreeAnnotation row)
                ]
                [ HH.text "Save label" ]
            , HH.element (HH.ElemName "md-outlined-button")
                [ classNames [ "secondary-action" ]
                , HH.attr (HH.AttrName "role") "button"
                , mdControl "secondary"
                , HE.onClick (\_ -> CancelDecodedTreeAnnotation)
                ]
                [ HH.text "Cancel" ]
            ]
        ]

  renderAnnotationBookOption book =
    HH.option
      [ HP.value book.id ]
      [ HH.text book.name ]

  renderProvider state =
    HH.element (HH.ElemName "md-elevated-card")
      [ classNames [ "panel", "provider-panel" ]
      , mdSurface "provider"
      ]
      [ HH.div
          [ classNames [ "panel-heading" ] ]
          [ HH.h2_ [ HH.text "Chain data" ]
          , HH.p_ [ HH.text "Credentials stay in memory and can persist only in the encrypted vault." ]
          ]
      , HH.fieldset
          [ classNames [ "control-group" ] ]
          [ HH.legend_ [ HH.text "Provider" ]
          , HH.div
              [ classNames [ "option-stack" ] ]
              [ providerRadio state Blockfrost "Blockfrost"
              , providerRadio state Koios      "Koios"
              ]
          ]
      , HH.div
          [ classNames [ "field-stack" ] ]
          [ case state.provider of
              Blockfrost ->
                HH.label
                  [ classNames [ "field-label" ] ]
                  [ HH.text "Blockfrost project ID"
                  , HH.a
                      [ HP.href "https://blockfrost.io/dashboard"
                      , HP.target "_blank"
                      , HP.rel "noopener noreferrer"
                      ]
                      [ HH.text "Dashboard" ]
                  ]
              Koios ->
                HH.label
                  [ classNames [ "field-label" ] ]
                  [ HH.text "Koios bearer token"
                  , HH.a
                      [ HP.href "https://koios.rest/auth/Auth.html"
                      , HP.target "_blank"
                      , HP.rel "noopener noreferrer"
                      ]
                      [ HH.text "Auth" ]
                  ]
          , case state.provider of
              Blockfrost ->
                HH.input
                  [ HP.type_ HP.InputPassword
                  , HP.placeholder "mainnet... / preprod... / preview..."
                  , HP.value state.blockfrostKey
                  , HH.attr (HH.AttrName "aria-label") "Blockfrost project ID"
                  , HE.onValueInput SetBlockfrostKey
                  ]
              Koios ->
                HH.input
                  [ HP.type_ HP.InputPassword
                  , HP.placeholder "eyJhbGciOi..."
                  , HP.value state.koiosBearer
                  , HH.attr (HH.AttrName "aria-label") "Koios bearer token"
                  , HE.onValueInput SetKoiosBearer
                  ]
          ]
      , keyTextField "Vault item name" state.providerVaultLabelInput SetProviderVaultLabel
      , HH.div [ classNames [ "key-actions" ] ]
          [ keyButton false "Save secret to vault" SaveProviderSecretToVault ]
      , renderVaultShelf "vault-shelf--provider" (providerAcceptedKinds state.provider) state.vaultEntries PeekVaultEntryInProvider PopVaultEntryInProvider
      , renderVaultInlineStatus state
      , HH.fieldset
          [ classNames [ "control-group" ] ]
          [ HH.legend_ [ HH.text "Network" ]
          , HH.div
              [ classNames [ "option-stack", "compact-options" ] ]
              [ networkRadio state Mainnet "mainnet"
              , networkRadio state Preprod "preprod"
              , networkRadio state Preview "preview"
              ]
          ]
      ]

  providerRadio state prov label =
    HH.label
      [ choiceClass (state.provider == prov) ]
      [ HH.input
          [ HP.type_ HP.InputRadio
          , HP.name "provider"
          , HP.checked (state.provider == prov)
          , HE.onChange (\_ -> SelectProvider prov)
          ]
      , HH.span
          [ classNames [ "choice-copy" ] ]
          [ HH.span
              [ classNames [ "choice-title" ] ]
              [ HH.text label ]
          ]
      ]

  networkRadio state net label =
    HH.label
      [ choiceClass (state.network == net) ]
      [ HH.input
          [ HP.type_ HP.InputRadio
          , HP.name "network"
          , HP.checked (state.network == net)
          , HE.onChange (\_ -> SelectNetwork net)
          ]
      , HH.span
          [ classNames [ "choice-title" ] ]
          [ HH.text label ]
      ]

  renderModeTabs state =
    HH.element (HH.ElemName "md-elevated-card")
      [ classNames [ "panel", "input-panel" ]
      , mdSurface "input"
      ]
      [ HH.div
          [ classNames [ "input-panel-header" ] ]
          [ HH.div
              [ classNames [ "input-panel-title" ] ]
              [ HH.h1_ [ HH.text "Inspect a Cardano transaction" ]
              , HH.p_ [ HH.text "Decodes locally in browser; nothing is sent to a server." ]
              ]
          , HH.div
              [ classNames [ "input-trust-row" ] ]
              [ HH.span
                  [ classNames [ "li-chip", "li-chip--success" ] ]
                  [ HH.element (HH.ElemName "md-icon") [] [ HH.text "lock" ]
                  , HH.text "Local browser decode"
                  ]
              , HH.span
                  [ classNames [ "li-chip", "li-chip--primary" ] ]
                  [ HH.element (HH.ElemName "md-icon") [] [ HH.text "rule" ]
                  , HH.text "Phase-1 validation"
                  ]
              ]
          ]
      , HH.div
          [ classNames [ "li-tabs", "input-mode-tabs" ]
          , HH.attr (HH.AttrName "role") "tablist"
          , HH.attr (HH.AttrName "aria-label") "Input mode"
          ]
          [ renderModeTab state ByHex "Paste CBOR" "data_object"
          , renderModeTab state ByHash "Fetch by hash" "tag"
          ]
      , HH.div
          [ classNames [ "input-mode-panel" ]
          , HH.attr (HH.AttrName "role") "tabpanel"
          ]
          [ renderBody state ]
      , renderExamplesPicker
      ]

  renderModeTab state mode label icon =
    HH.button
      [ classNames
          ( [ "li-tab", "input-mode-tab" ]
              <> if state.mode == mode then [ "is-active" ] else []
          )
      , HH.attr (HH.AttrName "type") "button"
      , HH.attr (HH.AttrName "role") "tab"
      , HH.attr (HH.AttrName "aria-selected") (if state.mode == mode then "true" else "false")
      , HE.onClick (\_ -> SelectMode mode)
      ]
      [ HH.element (HH.ElemName "md-icon") [] [ HH.text icon ]
      , HH.text label
      ]

  renderExamplesPicker =
    HH.div
      [ classNames [ "examples-picker" ] ]
      [ HH.div
          [ classNames [ "examples-heading" ] ]
          [ HH.h3_ [ HH.text "Examples" ] ]
      , HH.div
          [ classNames [ "example-chips" ] ]
          (map renderExampleChip Examples.examples)
      ]

  renderExampleChip ex =
    HH.element (HH.ElemName (if ex.severity == "valid" then "md-filled-tonal-button" else "md-outlined-button"))
      [ classNames [ "example-chip", "example-" <> ex.severity ]
      , HH.attr (HH.AttrName "role") "button"
      , HP.title ex.description
      , mdControl (if ex.severity == "valid" then "primary" else "secondary")
      , HE.onClick (\_ -> LoadExample ex.cbor)
      ]
      [ HH.span [ classNames [ "example-sev" ] ] [ HH.text (severityIcon ex.severity) ]
      , HH.span [ classNames [ "example-label" ] ] [ HH.text ex.label ]
      ]

  severityIcon sev = case sev of
    "valid" -> "✓"
    "warning" -> "⚠"
    _ -> "✗"

  modeRadio state mode label =
    HH.label
      [ choiceClass (state.mode == mode) ]
      [ HH.input
          [ HP.type_ HP.InputRadio
          , HP.name "mode"
          , HP.checked (state.mode == mode)
          , HE.onChange (\_ -> SelectMode mode)
          ]
      , HH.span
          [ classNames [ "choice-title" ] ]
          [ HH.text label ]
      ]

  renderBody state = case state.mode of
    ByHash ->
      HH.div
        [ classNames [ "decode-form", "hash-form" ] ]
        [ HH.input
            [ classNames [ "li-field" ]
            , HP.type_ HP.InputText
            , HP.placeholder "Transaction hash (64 hex chars)"
            , HP.value state.txHash
            , HE.onValueInput SetTxHash
            ]
        , HH.element (HH.ElemName "md-filled-button")
            [ HP.disabled state.running
            , classNames [ "primary-action" ]
            , HH.attr (HH.AttrName "role") "button"
            , mdControl "primary"
            , HE.onClick (\_ -> Decode)
            ]
            [ HH.text (if state.running then "Fetching..." else "Decode") ]
        ]
    ByHex ->
      HH.div
        [ classNames [ "decode-form" ] ]
        [ HH.textarea
            [ classNames [ "li-textarea" ]
            , HP.value state.txHex
            , HP.placeholder "Paste Conway transaction CBOR hex"
            , HP.rows 9
            , HE.onValueInput SetTxHex
            ]
        , HH.element (HH.ElemName "md-filled-button")
            [ HP.disabled state.running
            , classNames [ "primary-action" ]
            , HH.attr (HH.AttrName "role") "button"
            , mdControl "primary"
            , HE.onClick (\_ -> Decode)
            ]
            [ HH.text (if state.running then "Decoding..." else "Decode") ]
        ]

  renderTxSigning state =
    HH.section
      [ classNames [ "panel", "tx-signing-panel" ]
      , HH.attr (HH.AttrName "role") "region"
      , HH.attr (HH.AttrName "aria-label") "Sign transaction body"
      , mdSurface "result"
      ]
      [ HH.div
          [ classNames [ "panel-heading" ] ]
          [ HH.div_
              [ HH.h2_ [ HH.text "Sign transaction body" ]
              , HH.p_ [ HH.text "Create one local vkey witness, verify that it matches the current witness plan, then ask the ledger engine to attach it." ]
              ]
          ]
      , case txSigningBodyHash state of
          Just bodyHash | state.resultTab == WitnessTab ->
            HH.div [ classNames [ "signing-context-card" ] ]
              [ HH.span [ classNames [ "signing-context-label" ] ] [ HH.text "Body hash" ]
              , HH.code [ classNames [ "signing-output-value" ] ] [ HH.text bodyHash ]
              ]
          _ -> HH.text ""
      , renderVaultShelf "vault-shelf--tx-signing" signingAcceptedKinds state.vaultEntries PeekVaultEntryInTxSigning PopVaultEntryInTxSigning
      , HH.div [ classNames [ "key-actions" ] ]
          [ keyButton false (if state.showTxSigningKey then "Hide signing key" else "Show signing key") ToggleTxSigningKey ]
      , HH.label [ classNames [ "key-field" ] ]
          [ HH.span [ classNames [ "field-label" ] ] [ HH.text "Transaction signing key" ]
          , HH.input
              [ HP.type_ (if state.showTxSigningKey then HP.InputText else HP.InputPassword)
              , HP.value state.txSigningKeyInput
              , HH.attr (HH.AttrName "aria-label") "Transaction signing key"
              , HE.onValueInput SetTxSigningKey
              ]
          ]
      , HH.button
          [ classNames [ "key-button", "key-button-primary", "tx-signing-submit" ]
          , HP.disabled (state.running || state.txSigningRunning || not (txSigningReady state))
          , HE.onClick (\_ -> RunTxSign)
          ]
          [ HH.text "Create signed transaction" ]
      , renderTxSigningStatus state
      ]

  renderTxSigningStatus state
    | state.running =
        HH.div [ classNames [ "privacy-note", "tx-signing-status" ] ]
          [ HH.text "Wait for transaction inspection to finish before signing." ]
    | state.txSigningRunning =
        HH.div [ classNames [ "privacy-note", "tx-signing-status" ] ]
          [ HH.text "Signing locally and attaching the witness…" ]
    | not (txSigningReady state) =
        HH.div [ classNames [ "privacy-note", "tx-signing-status" ] ]
          [ HH.text "Inspect a transaction first to load its CBOR and body hash." ]
    | otherwise =
        case state.txSigningResult of
          Nothing ->
            HH.div [ classNames [ "privacy-note", "tx-signing-status" ] ]
              [ HH.text "The signing key remains only in this browser tab's memory." ]
          Just (Left err) ->
            HH.div
              [ classNames [ "tool-error", "tx-signing-status" ]
              , HH.attr (HH.AttrName "role") "alert"
              ]
              [ HH.text err ]
          Just (Right result) ->
            HH.div [ classNames [ "tx-signing-result" ] ]
              [ HH.div [ classNames [ "signer-match-status" ] ]
                  [ HH.text "Matches a missing required signer" ]
              , HH.div [ classNames [ "signing-output-grid" ] ]
                  [ renderSigningOutput "Body hash" result.bodyHashHex
                  , renderSigningOutput "Verification key" result.verificationKeyBech32
                  , renderSigningOutput "Signer hash" result.signerHashHex
                  , renderSigningOutput "Signature" result.signatureHex
                  , renderSigningOutput "Detached vkey witness CBOR" result.vkeyWitnessCborHex
                  , renderSigningOutput "Attachment action" result.witnessPatchAction
                  , renderSigningOutput "Patched signed transaction CBOR" result.signedTxCborHex
                  ]
              ]

  renderSigningOutput label value =
    HH.div [ classNames [ "signing-output-card" ] ]
      [ HH.div
          [ classNames [ "signing-output-content" ] ]
          [ HH.h3_ [ HH.text label ]
          , HH.code [ classNames [ "signing-output-value" ] ] [ HH.text value ]
          , keyCopyButton value
          ]
      ]

  renderResult state =
    case state.fetchError of
      Just err ->
        HH.element (HH.ElemName "md-elevated-card")
          [ classNames [ "panel", "result-panel", "error-panel" ]
          , mdSurface "result"
          ]
          [ HH.div
              [ classNames [ "panel-heading" ] ]
              [ HH.h2_ [ HH.text "Fetch error" ] ]
          , HH.p_ [ HH.text err ]
          ]
      Nothing -> case state.result of
        Nothing ->
          HH.element (HH.ElemName "md-elevated-card")
            [ classNames [ "panel", "result-panel", "empty-result", "friendly-empty-result" ]
            , mdSurface "result"
            ]
            [ HH.div
                [ classNames [ "li-empty-state", "initial-decoded-empty" ] ]
                [ HH.element (HH.ElemName "md-icon") [ classNames [ "li-empty-icon" ] ] [ HH.text "account_tree" ]
                , HH.h2
                    [ classNames [ "li-empty-title" ] ]
                    [ HH.text "No transaction decoded yet" ]
                , HH.p
                    [ classNames [ "li-empty-copy" ] ]
                    [ HH.text "Paste CBOR above or pick an example. The decoded body, witnesses, and validation results will appear here with hashes resolved to names by your books." ]
                ]
            ]
        Just r ->
          let
            summary = Json.inspect r.stdout
          in
            if r.exitOk then
              HH.section
                [ classNames [ "result-panel", "decoded-result-shell" ] ]
                ( [ renderResultTabs state
                  , renderSelectedResultTab state r.stdout
                  ]
                    <> renderStderr r.stderr
                )
            else
              HH.element (HH.ElemName "md-elevated-card")
                [ classNames [ "panel", "result-panel", "error-panel" ]
                , mdSurface "result"
                ]
                ( [ HH.div
                      [ classNames [ "panel-heading", "result-heading" ] ]
                      [ HH.div_
                          [ HH.h2_ [ HH.text "Error" ]
                          , if summary.valid then HH.p_ [ HH.text summary.title ] else HH.text ""
                          ]
                      ]
                  , renderRawJson r.stdout
                  ]
                    <> renderStderr r.stderr
                )

  renderIntentMaybe state =
    case state.intent of
      Just intent ->
        if intent.valid then [ renderIntentSummary state intent ]
        else []
      Nothing -> []

  renderIdentificationMaybe state =
    case state.identification of
      Just identification ->
        if identification.valid then [ renderIdentification state identification ]
        else []
      Nothing -> []

  renderWitnessPlanMaybe state =
    case state.witnessPlan of
      Just witnessPlan ->
        if witnessPlan.valid then [ renderWitnessPlan state witnessPlan ]
        else []
      Nothing -> []

  renderValidationMaybe state =
    case state.validation of
      Just validation ->
        if validation.valid then [ renderValidation state validation ]
        else []
      Nothing -> []

  renderRdfMaybe state exitOk =
    case state.rdf of
      Just rdf ->
        if exitOk && rdf.valid then
          [ renderRdfGraph rdf, renderOverlayBooks state ]
            <> renderShaclConformanceMaybe state state.shaclConformance
            <> renderResolvedLabelsLensMaybe state.resolvedLabelsLens
            <> renderTypedFieldsLensMaybe state.typedFieldsLens
            <> renderSparqlLensMaybe state.sparqlLens
        else []
      Nothing -> []

  renderBrowserMaybe state exitOk =
    case state.browser of
      Just browser ->
        if exitOk && browser.valid then [ renderBrowser state browser ]
        else []
      Nothing -> []

  renderResultSummary state summary =
    HH.div
      [ classNames [ "inspection-summary", "result-summary" ] ]
      ( [ renderResultSummaryTitle state summary
        , HH.div
            [ classNames [ "metric-grid" ] ]
            (map renderMetric summary.metrics)
        ]
          <> renderSummaryIdentity state
          <> renderSummaryWarnings state
      )

  renderResultSummaryTitle state summary =
    case state.identification of
      Just identification | identification.valid ->
        HH.div
          [ classNames [ "result-summary-title" ] ]
          [ HH.h3_ [ HH.text identification.title ]
          , HH.p_ [ HH.text identification.subtitle ]
          ]
      _ -> case state.intent of
        Just intent | intent.valid ->
          HH.div
            [ classNames [ "result-summary-title" ] ]
            [ HH.h3_ [ HH.text intent.title ]
            , HH.p_ [ HH.text intent.subtitle ]
            ]
        _ ->
          HH.div
            [ classNames [ "result-summary-title" ] ]
            [ HH.h3_ [ HH.text summary.title ] ]

  renderSummaryIdentity state =
    case state.identification of
      Just identification ->
        if identification.valid then
          [ HH.div
              [ classNames [ "summary-identity-grid" ] ]
              (map (renderIdentityRow state) identification.primary)
          ]
        else []
      Nothing -> []

  renderSummaryWarnings state =
    [ renderIntentWarnings state.intent
    , renderWitnessPlanWarnings state.witnessPlan
    , renderValidationWarnings state.validation
    ]

  renderIntentWarnings intent =
    case intent of
      Just value | value.valid -> renderWitnessWarnings value.warnings
      _ -> HH.text ""

  renderWitnessPlanWarnings witnessPlan =
    case witnessPlan of
      Just value | value.valid -> renderWitnessWarnings value.warnings
      _ -> HH.text ""

  renderValidationWarnings validation =
    case validation of
      Just value | value.valid -> renderWitnessWarnings value.warnings
      _ -> HH.text ""

  renderResultTabs state =
    HH.div
      [ classNames [ "result-tab-bar" ]
      , HH.attr (HH.AttrName "role") "tablist"
      , HH.attr (HH.AttrName "aria-label") "Inspect result views"
      ]
      (map (renderResultTabButton state.resultTab) resultTabs)

  resultTabs =
    [ StructureTab, WitnessTab, ValidationTab, GraphRdfTab ]

  renderResultTabButton selectedTab tab =
    let
      selected = selectedTab == tab
    in
      HH.button
        [ classNames
            ( if selected then
                [ "result-tab", "is-selected" ]
              else
                [ "result-tab" ]
            )
        , HH.attr (HH.AttrName "role") "tab"
        , HH.attr (HH.AttrName "aria-selected") (if selected then "true" else "false")
        , HE.onClick (\_ -> SelectResultTab tab)
        ]
        [ HH.text (resultTabLabel tab) ]

  renderSelectedResultTab state stdout =
    HH.div
      [ classNames [ "result-tab-panel" ]
      , HH.attr (HH.AttrName "role") "tabpanel"
      , HH.attr (HH.AttrName "aria-label") (resultTabLabel state.resultTab)
      ]
      ( case state.resultTab of
          StructureTab ->
            [ renderDecodedStructure state ]
              <> renderCompactIdentificationMaybe state
          WitnessTab ->
            renderIntentMaybe state
              <> renderWitnessPlanMaybe state
          ValidationTab ->
            renderValidationMaybe state
              <> renderShaclConformanceMaybe state state.shaclConformance
          GraphRdfTab ->
            renderCompactIdentificationMaybe state
              <> renderGraphRdfMaybe state
              <> renderBrowserMaybe state true
              <> [ renderRawJson stdout ]
      )

  renderGraphRdfMaybe state =
    case state.rdf of
      Just rdf ->
        if rdf.valid then
          [ renderRdfGraph rdf, renderOverlayBooks state ]
            <> renderResolvedLabelsLensMaybe state.resolvedLabelsLens
            <> renderTypedFieldsLensMaybe state.typedFieldsLens
            <> renderSparqlLensMaybe state.sparqlLens
        else []
      Nothing -> []

  resultTabLabel tab =
    case tab of
      StructureTab -> "Structure"
      WitnessTab -> "Witness"
      ValidationTab -> "Validation"
      GraphRdfTab -> "Graph / RDF"

  renderCompactIdentificationMaybe state =
    case state.identification of
      Just identification | identification.valid -> [ renderCompactIdentification state identification ]
      _ -> []

  renderCompactIdentification state identification =
    HH.div
      [ classNames [ "identity-panel", "compact-identity-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "Identity metadata" ]
              , HH.p_ [ HH.text identification.subtitle ]
              ]
          ]
      , HH.div
          [ classNames [ "identity-grid" ] ]
          (map (renderIdentityRow state) identification.primary)
      ]

  renderInspection summary =
    [ HH.div
        [ classNames [ "inspection-summary" ] ]
        [ HH.div
            [ classNames [ "metric-grid" ] ]
            (map renderMetric summary.metrics)
        ]
    ]

  renderIntentSummary state intent =
    HH.div
      [ classNames [ "intent-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text intent.title ]
              , HH.p_ [ HH.text intent.subtitle ]
              ]
          ]
      , HH.div
          [ classNames [ "metric-grid", "intent-metrics" ] ]
          (map renderMetric intent.metrics)
      , renderIntentClaims intent.claims
      , renderWitnessWarnings intent.warnings
      , HH.div_
          (map (renderIntentSection state) intent.sections)
      ]

  renderIntentClaims claims =
    if Array.null claims then
      HH.text ""
    else
      HH.div
        [ classNames [ "intent-claims" ] ]
        (map renderIntentClaim claims)

  renderIntentClaim claim =
    HH.div
      [ classNames [ "intent-claim" ] ]
      [ HH.span
          [ classNames [ "identity-section-title" ] ]
          [ HH.text claim.label ]
      , HH.strong_ [ HH.text claim.value ]
      , if claim.detail == "" then
          HH.text ""
        else
          HH.p_ [ HH.text claim.detail ]
      ]

  renderIntentSection state section =
    HH.div
      [ classNames [ "witness-section" ] ]
      [ HH.div
          [ classNames [ "identity-section-title" ] ]
          [ HH.text section.title ]
      , if Array.null section.rows then
          HH.div
            [ classNames [ "witness-empty" ] ]
            [ HH.text section.empty ]
        else
          HH.div
            [ classNames [ "witness-row-list" ] ]
            ( map
                (\row -> renderWitnessRowWithCopy state (not (Array.null row.identifierCandidates)) row)
                section.rows
            )
      ]

  renderIdentification state identification =
    HH.div
      [ classNames [ "identity-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text identification.title ]
              , HH.p_ [ HH.text identification.subtitle ]
              ]
          ]
      , HH.div
          [ classNames [ "identity-grid" ] ]
          (map (renderIdentityRow state) identification.primary)
      , HH.div
          [ classNames [ "identity-section-title" ] ]
          [ HH.text "Witnesses" ]
      , HH.div
          [ classNames [ "witness-grid" ] ]
          (map (renderIdentityRow state) identification.witnesses)
      ]

  renderWitnessPlan state witnessPlan =
    HH.div
      [ classNames [ "identity-panel", "witness-plan" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text witnessPlan.title ]
              , HH.p_ [ HH.text witnessPlan.subtitle ]
              ]
          ]
      , HH.div
          [ classNames [ "metric-grid" ] ]
          (map renderMetric witnessPlan.metrics)
      , renderWitnessWarnings witnessPlan.warnings
      , HH.div_
          (map (renderWitnessSection state) witnessPlan.sections)
      ]

  renderValidation state validation =
    HH.div
      [ classNames [ "identity-panel", "validation-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text validation.title ]
              , HH.p_ [ HH.text validation.subtitle ]
              ]
          ]
      , renderValidationVerdictBanner state validation
      , renderValidationContextNotice validation.contextErrors
      , renderValidationFilters state.validationFilter (validationSurfaceCounts validation state.shaclConformance)
      , renderValidationRowGroup state.validationFilter "Validation summary"
          (map (renderValidationMetricRow state) validation.metrics)
      , renderValidationRowGroup state.validationFilter "Warnings"
          (map (renderValidationWarningRow state) validation.warnings)
      , HH.div_
          (map (renderValidationSection state state.validationFilter) validation.sections)
      ]

  renderValidationVerdictBanner state validation =
    let
      counts = validationSurfaceCounts validation state.shaclConformance
      ledgerPasses =
        validation.status == "valid"
          && validation.complete
          && validation.validForSuppliedContext
      conforms = ledgerPasses && shaclConformancePasses state.shaclConformance
      tone =
        if not validation.complete then ValidationWarn
        else if conforms then ValidationPass
        else ValidationFail
      title =
        if not validation.complete then "Validation incomplete"
        else if conforms then "Validation passed"
        else "Validation needs attention"
      detail = validationTallyText counts
    in
      HH.div
        [ classNames
            [ "validation-verdict-banner"
            , "validation-verdict-banner--" <> validationToneClass tone
            ]
        ]
        [ HH.element (HH.ElemName "md-icon")
            [ classNames [ "validation-verdict-icon" ] ]
            [ HH.text (validationToneIcon tone) ]
        , HH.div_
            [ HH.strong_ [ HH.text title ]
            , HH.p_ [ HH.text detail ]
            ]
        ]

  renderValidationContextNotice contextErrors =
    if Array.null contextErrors then
      HH.text ""
    else
      HH.div
        [ classNames
            [ "validation-context-notice"
            , "witness-warnings"
            ]
        ]
        [ HH.strong_ [ HH.text "Validation context unavailable" ]
        , HH.p_ [ HH.text (String.joinWith " / " contextErrors) ]
        ]

  shaclConformancePasses conformance =
    case conformance of
      Just value ->
        case value.error of
          Just _ -> false
          Nothing ->
            case value.report of
              Just report -> report.conforms
              Nothing     -> true
      Nothing -> true

  renderValidationFilters selected counts =
    HH.div
      [ classNames [ "validation-filter-chips" ]
      , HH.attr (HH.AttrName "role") "toolbar"
      , HH.attr (HH.AttrName "aria-label") "Validation filters"
      ]
      [ renderValidationFilterChip selected ValidationAll ("All " <> show (validationCountsTotal counts))
      , renderValidationFilterChip selected ValidationPassed ("Passed " <> show counts.passed)
      , renderValidationFilterChip selected ValidationWarnings ("Warnings " <> show counts.warnings)
      , renderValidationFilterChip selected ValidationViolations ("Violations " <> show counts.violations)
      ]

  renderValidationFilterChip selected validationFilter label =
    let
      active = selected == validationFilter
    in
      HH.button
        [ classNames
            ( if active then
                [ "validation-filter-chip", "is-selected" ]
              else
                [ "validation-filter-chip" ]
            )
        , HH.attr (HH.AttrName "type") "button"
        , HH.attr (HH.AttrName "aria-pressed") (if active then "true" else "false")
        , HE.onClick (\_ -> SetValidationFilter validationFilter)
        ]
        [ HH.text label ]

  renderValidationMetricRow state metric =
    let
      tone = validationMetricTone metric
    in
      { tone
      , node:
          renderValidationCheckRow state tone metric.label "ledger:metric" metric.value "" metric.value false "" "" [] []
      }

  renderValidationWarningRow state warning =
    { tone: ValidationWarn
    , node:
        renderValidationCheckRow state ValidationWarn "Warning" "ledger:warning" warning "" "warning" false "" "" [] []
    }

  renderValidationCheckRow state tone title rule message context badge canCopy copyPath copyValue extra rowClasses =
    HH.div
      [ classNames
          ( [ "identity-row"
            , "witness-row"
            , "validation-check-row"
            , "validation-row--" <> validationToneClass tone
            ]
              <> rowClasses
          )
      ]
      [ HH.element (HH.ElemName "md-icon")
          [ classNames [ "validation-status-icon" ] ]
          [ HH.text (validationToneIcon tone) ]
      , HH.div
          [ classNames [ "validation-row-body" ] ]
          ( [ HH.div
                [ classNames [ "validation-row-title-line" ] ]
                [ HH.strong_ [ HH.text title ]
                , renderValidationRuleChip rule
                ]
            , HH.p
                [ classNames [ "validation-row-message" ] ]
                [ HH.text message ]
            , renderValidationContextChip context
            ]
              <> extra
          )
      , HH.div
          [ classNames [ "validation-row-trailing" ] ]
          ( [ renderValidationStatusBadge tone badge ]
              <> if canCopy then
                [ HH.element (HH.ElemName "md-outlined-button")
                    [ HE.onClick (\_ -> CopyValue copyPath copyValue)
                    , classNames [ "inline-action" ]
                    , HH.attr (HH.AttrName "role") "button"
                    , mdControl "inline"
                    ]
                    [ HH.text
                        ( if state.copiedPath == Just copyPath then
                            "Copied"
                          else
                            "Copy"
                        )
                    ]
                ]
              else
                []
          )
      ]

  renderValidationRuleChip rule =
    if rule == "" then HH.text ""
    else
      HH.code
        [ classNames [ "li-chip", "validation-rule-chip" ] ]
        [ HH.text rule ]

  renderValidationContextChip context =
    if context == "" then HH.text ""
    else
      HH.code
        [ classNames [ "li-chip", "validation-context-chip" ] ]
        [ HH.text context ]

  renderValidationStatusBadge tone badge =
    HH.span
      [ classNames
          [ "li-chip"
          , "validation-status-badge"
          , validationToneChipClass tone
          ]
      ]
      [ HH.text badge ]

  renderValidationRowGroup selected title rows =
    let
      visibleRows = Array.filter (\row -> validationFilterAllows selected row.tone) rows
    in
      if Array.null visibleRows then HH.text ""
      else
        HH.div
          [ classNames [ "witness-section", "validation-section" ] ]
          [ HH.div
              [ classNames [ "identity-section-title", "validation-section-title" ] ]
              [ HH.text title ]
          , HH.div
              [ classNames [ "witness-row-list", "validation-row-list" ] ]
              (map _.node visibleRows)
          ]

  renderRdfGraph rdf =
    HH.div
      [ classNames [ "rdf-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "Transaction RDF graph" ]
              , HH.p_ [ HH.text "Transaction graph serialized as Turtle." ]
              ]
          ]
      , HH.div
          [ classNames [ "rdf-meta" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Format" ]
          , HH.code_ [ HH.text rdf.format ]
          ]
      , HH.pre
          [ classNames [ "rdf-turtle" ] ]
          [ HH.text rdf.turtle ]
      ]

  renderOverlayBooks state =
    let
      parts = selectedBookParts state
    in
    HH.div
      [ classNames [ "overlay-book-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "Selected books" ]
              , HH.p_ [ HH.text "Selections are managed in Library and applied to RDF resolution." ]
              ]
          , HH.element (HH.ElemName "md-filled-button")
              [ classNames [ "primary-action" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "primary"
              , HP.disabled state.running
              , HE.onClick (\_ -> ApplySelectedBooks)
              ]
              [ HH.text "Apply selected books" ]
          ]
      , HH.div
          [ classNames [ "overlay-selection-grid" ] ]
          [ HH.div
              [ classNames [ "overlay-part-list" ] ]
              (renderSelectedBookParts parts)
          , HH.label
              [ classNames [ "field-stack" ] ]
              [ HH.span
                  [ classNames [ "field-label" ] ]
                  [ HH.text "Selected overlay Turtle" ]
              , HH.textarea
                  [ HP.value (selectedOverlayTurtle state)
                  , HP.rows 10
                  , HH.attr (HH.AttrName "aria-label") "Selected overlay Turtle"
                  , HH.attr (HH.AttrName "readonly") "readonly"
                  ]
              ]
          ]
      ]

  renderSelectedBookParts parts =
    if Array.null parts then
      [ HH.div
          [ classNames [ "witness-empty" ] ]
          [ HH.text "No selected book parts." ]
      ]
    else
      map renderSelectedBookPart parts

  renderSelectedBookPart part =
    HH.div
      [ classNames [ "book-part-row" ] ]
      [ HH.strong_ [ HH.text part.label ]
      , HH.span_ [ HH.text part.kind ]
      ]

  selectedOverlayTurtle state =
    String.joinWith "\n" (map _.turtle (selectedOverlayParts state))

  mergedRdfTurtle transactionGraphTurtle overlayTurtle =
    transactionGraphTurtle <> overlayTurtle

  selectedBooks state =
    BookStore.selectedBooks { kind: BookStore.envelopeKind, books: state.books }

  selectedLocalBooks state =
    Array.filter (\book -> book.selected && not book.seed) state.books

  selectedBookParts state =
    Array.concatMap _.parts (selectedBooks state)

  selectedOverlayParts state =
    Array.filter
      (\part -> part.kind == "overlay")
      (selectedBookParts state)

  selectedBlueprintParts state =
    Array.filter
      (\part -> part.kind == "blueprint")
      (selectedBookParts state)

  selectedShaclParts state =
    Array.filter
      (\part -> part.kind == "shacl")
      (selectedBookParts state)

  selectedShaclTurtle state =
    String.joinWith "\n" (map _.turtle (selectedShaclParts state))

  selectedShaclLabels state =
    map _.label (selectedShaclParts state)

  selectedBlueprintArgs state =
    OverlayBook.blueprintArgs (selectedBlueprintParts state)

  renderShaclConformanceMaybe state conformance =
    case conformance of
      Just value -> [ renderShaclConformance state value ]
      Nothing -> []

  renderShaclConformance state conformance =
    HH.div
      [ classNames [ "shacl-conformance-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "RDF SHACL conformance" ]
              , HH.p_ [ HH.text "Selected SHACL shapes validate the composed RDF graph." ]
              ]
          ]
      , renderValidationRowGroup state.validationFilter "Selected shapes"
          (map (renderSelectedShape state) conformance.shapeLabels)
      , case conformance.error of
          Just err ->
            renderValidationRowGroup state.validationFilter "SHACL report"
              [ { tone: ValidationFail
                , node:
                    renderValidationCheckRow state ValidationFail "SHACL validation failed" "sh:ValidationReport" err "" "error" false "" "" [] []
                }
              ]
          Nothing ->
            case conformance.report of
              Just report ->
                HH.div_
                  [ renderValidationRowGroup state.validationFilter "SHACL verdict"
                      [ renderShaclMetricRow state
                          { label: "Author gate"
                          , value: if report.conforms then "pass" else "fail"
                          }
                      , renderShaclMetricRow state
                          { label: "Auditor classifier"
                          , value:
                              if report.conforms then
                                "canonical-pipeline match"
                              else
                                "foreign/off-spec"
                          }
                      ]
                  , renderShaclViolations state report
                  ]
              Nothing ->
                HH.div
                  [ classNames [ "witness-empty" ] ]
                  [ HH.text "No SHACL report." ]
      ]

  renderSelectedShape state label =
    { tone: ValidationPass
    , node:
        renderValidationCheckRow state ValidationPass "Shape book" "sh:NodeShape" label "" "selected" false "" "" [] []
    }

  renderShaclMetricRow state metric =
    let
      tone = validationMetricTone metric
    in
      { tone
      , node:
          renderValidationCheckRow state tone metric.label "sh:ValidationReport" metric.value "" metric.value false "" "" [] []
      }

  renderShaclViolations state report =
    if Array.null report.violations then
      renderValidationRowGroup state.validationFilter "Phase-1 issues"
        [ { tone: ValidationPass
          , node:
              renderValidationCheckRow state ValidationPass "Phase-1 issues" "sh:ValidationReport" "No phase-1 issues." "" "pass" false "" "" [] []
          }
        ]
    else
      renderValidationRowGroup state.validationFilter "Phase-1 issues"
        (map (renderShaclViolationRow state) report.violations)

  renderShaclViolationRow state violation =
    let
      severity = normalizedShaclSeverity violation.severity
      tone = validationSeverityTone severity
      context = shaclViolationContext state violation
    in
      { tone
      , node:
          renderValidationCheckRow state tone (shaclViolationTitle violation) violation.sourceShape violation.message context severity false "" ""
            [ HH.div
                [ classNames [ "validation-row-meta", "sparql-lens-row" ] ]
                [ renderShaclViolationCell "Severity" severity
                , renderShaclViolationLocationCell state violation
                , renderShaclViolationCell "Focus node" violation.focusNode
                , renderShaclViolationCell "Path" violation.path
                , renderShaclViolationCell "Source shape" violation.sourceShape
                , renderShaclViolationCell "Message" violation.message
                , renderShaclViolationCell "Constraint" violation.sourceConstraintComponent
                ]
            ]
            [ "shacl-violation-row", "shacl-" <> severity ]
      }

  shaclViolationTitle violation =
    let
      messagePrefix =
        case Array.head (String.split (String.Pattern ":") violation.message) of
          Just value -> String.trim value
          Nothing    -> ""
    in
      if messagePrefix /= "" && not (StringCodeUnits.contains (String.Pattern " ") messagePrefix) then
        messagePrefix
      else
        shaclSourceShapeLabel violation.sourceShape

  shaclSourceShapeLabel sourceShape =
    let
      hashPart =
        case Array.last (String.split (String.Pattern "#") sourceShape) of
          Just value -> value
          Nothing    -> sourceShape
      slashPart =
        case Array.last (String.split (String.Pattern "/") hashPart) of
          Just value -> value
          Nothing    -> hashPart
    in
      if slashPart == "" then sourceShape else slashPart

  shaclViolationContext state violation =
    case shaclFocusRow state violation.focusNode of
      Just row -> shaclFocusRowLabel row
      Nothing ->
        if violation.path /= "" then violation.path
        else if violation.focusNode == "" then "transaction graph"
        else violation.focusNode

  normalizedShaclSeverity severity =
    if severity == "warning" then "warning"
    else if severity == "info" then "info"
    else "error"

  renderShaclViolationLocationCell state violation =
    HH.div
      [ classNames [ "sparql-lens-cell" ] ]
      [ HH.span
          [ classNames [ "identity-section-title" ] ]
          [ HH.text "Location" ]
      , case shaclFocusRow state violation.focusNode of
          Just row ->
            HH.a
              [ classNames [ "decoded-tree-iri", "shacl-location-link" ]
              , HP.href ("#" <> row.id)
              , HP.title row.entityIri
              , HE.onClick (\_ -> SelectResultTab StructureTab)
              ]
              [ HH.text (shaclFocusRowLabel row) ]
          Nothing ->
            HH.text (if violation.focusNode == "" then "transaction graph" else violation.focusNode)
      ]

  shaclFocusRow state focusNode =
    case state.decodedTreeLens of
      Just lens ->
        if focusNode == "" then
          Nothing
        else
          Array.find
            ( \row ->
                row.entityIri == focusNode
                  || row.value == focusNode
                  || row.raw == focusNode
                  || row.annotationValue == focusNode
            )
            lens.rows
      Nothing -> Nothing

  shaclFocusRowLabel row =
    if row.resolvedLabel /= "" then row.resolvedLabel
    else row.label

  renderShaclViolationCell label value =
    HH.div
      [ classNames [ "sparql-lens-cell" ] ]
      [ HH.span
          [ classNames [ "identity-section-title" ] ]
          [ HH.text label ]
      , HH.code_ [ HH.text value ]
      ]

  renderResolvedLabelsLensMaybe lens =
    case lens of
      Just value -> [ renderResolvedLabelsLens value ]
      Nothing -> []

  renderResolvedLabelsLens lens =
    HH.div
      [ classNames [ "resolved-labels-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "SPARQL lens: resolved labels" ]
              , HH.p_ [ HH.text "Fixed query over the transaction RDF graph plus selected overlays." ]
              ]
          ]
      , case lens.error of
          Just err ->
            HH.div
              [ classNames [ "sparql-lens-error" ] ]
              [ HH.text ("Resolved-labels query failed: " <> err) ]
          Nothing ->
            if Array.null lens.rows then
              HH.div
                [ classNames [ "witness-empty" ] ]
                [ HH.text "No resolved labels." ]
            else
              HH.div
                [ classNames [ "sparql-lens-row-list" ] ]
                (map renderResolvedLabelsRow lens.rows)
      ]

  renderResolvedLabelsRow row =
    HH.div
      [ classNames [ "sparql-lens-row", "resolved-labels-row" ] ]
      [ HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Label" ]
          , HH.strong_ [ HH.text row.label ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Role" ]
          , HH.code_ [ HH.text row.role ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Entity" ]
          , HH.code_ [ HH.text row.entity ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Matched" ]
          , HH.code_ [ HH.text row.matched ]
          ]
      ]

  renderTypedFieldsLensMaybe lens =
    case lens of
      Just value -> [ renderTypedFieldsLens value ]
      Nothing -> []

  renderTypedFieldsLens lens =
    HH.div
      [ classNames [ "sparql-lens-panel", "typed-fields-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "SPARQL lens: typed contract fields" ]
              , HH.p_ [ HH.text "Fixed query over decoded blueprint predicates." ]
              ]
          ]
      , case lens.error of
          Just err ->
            HH.div
              [ classNames [ "sparql-lens-error" ] ]
              [ HH.text ("Typed-fields query failed: " <> err) ]
          Nothing ->
            if Array.null lens.rows then
              HH.div
                [ classNames [ "witness-empty" ] ]
                [ HH.text "No typed contract fields." ]
            else
              HH.div
                [ classNames [ "sparql-lens-row-list" ] ]
                (map renderTypedFieldRow lens.rows)
      ]

  renderTypedFieldRow row =
    HH.div
      [ classNames [ "sparql-lens-row" ] ]
      [ HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Subject" ]
          , HH.code_ [ HH.text row.subject ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Field" ]
          , HH.strong_ [ HH.text row.field ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell", "sparql-lens-count" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Value" ]
          , HH.strong_ [ HH.text row.value ]
          ]
      ]

  renderSparqlLensMaybe lens =
    case lens of
      Just value -> [ renderSparqlLens value ]
      Nothing -> []

  renderSparqlLens lens =
    HH.div
      [ classNames [ "sparql-lens-panel" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "identity-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "SPARQL lens: transaction outputs" ]
              , HH.p_ [ HH.text "Fixed query over the transaction RDF graph." ]
              ]
          ]
      , case lens.error of
          Just err ->
            HH.div
              [ classNames [ "sparql-lens-error" ] ]
              [ HH.text ("SPARQL query failed: " <> err) ]
          Nothing ->
            if Array.null lens.rows then
              HH.div
                [ classNames [ "witness-empty" ] ]
                [ HH.text "No rows." ]
            else
              HH.div
                [ classNames [ "sparql-lens-row-list" ] ]
                (map renderSparqlLensRow lens.rows)
      ]

  renderSparqlLensRow row =
    HH.div
      [ classNames [ "sparql-lens-row" ] ]
      [ HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Transaction" ]
          , HH.code_ [ HH.text row.transaction ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Tx id" ]
          , HH.code_ [ HH.text row.txId ]
          ]
      , HH.div
          [ classNames [ "sparql-lens-cell", "sparql-lens-count" ] ]
          [ HH.span
              [ classNames [ "identity-section-title" ] ]
              [ HH.text "Outputs" ]
          , HH.strong_ [ HH.text row.outputs ]
          ]
      ]

  renderValidationSection state selected section =
    if Array.null section.rows then
      HH.div
        [ classNames [ "witness-section", "validation-section" ] ]
        [ HH.div
            [ classNames [ "identity-section-title", "validation-section-title" ] ]
            [ HH.text section.title ]
        , HH.div
            [ classNames [ "witness-empty", "validation-empty" ] ]
            [ HH.text section.empty ]
        ]
    else
      renderValidationRowGroup selected section.title
        (map (renderValidationRow state section.title) section.rows)

  renderValidationRow state sectionTitle row =
    let
      presented = presentValidationRow sectionTitle row
      tone = validationSectionRowTone sectionTitle presented
      message =
        if presented.detail == "" then presented.value
        else presented.detail
      context =
        if sectionTitle == "Checks" || presented.detail == "" then ""
        else presented.value
      badge =
        if sectionTitle == "Checks" then presented.value
        else validationToneBadge tone
      canCopy = validationRowCanCopy sectionTitle presented
    in
      { tone
      , node:
          renderValidationCheckRow state tone presented.label sectionTitle message context badge canCopy presented.path presented.copyValue [] []
      }

  validationRowCanCopy sectionTitle row =
    case sectionTitle of
      "Checks" -> false
      "Missing context" -> StringCodeUnits.length row.copyValue == 64
      _ -> true

  validationSurfaceCounts validation conformance =
    let
      validationCounts = validationToneCounts (validationPanelTones validation)
      shaclCounts = validationToneCounts (shaclConformanceTones conformance)
    in
      { passed: validationCounts.passed + shaclCounts.passed
      , warnings: validationCounts.warnings + shaclCounts.warnings
      , violations: validationCounts.violations + shaclCounts.violations
      }

  validationPanelTones validation =
    map validationMetricTone validation.metrics
      <> map (\_ -> ValidationWarn) validation.warnings
      <> Array.concat (map validationSectionTones validation.sections)

  validationSectionTones section =
    map
      (\row -> validationSectionRowTone section.title (presentValidationRow section.title row))
      section.rows

  shaclConformanceTones conformance =
    case conformance of
      Nothing -> []
      Just value ->
        map (\_ -> ValidationPass) value.shapeLabels
          <> case value.error of
            Just _ -> [ ValidationFail ]
            Nothing ->
              case value.report of
                Just report -> shaclReportTones report
                Nothing     -> []

  shaclReportTones report =
    [ validationMetricTone
        { label: "Author gate"
        , value: if report.conforms then "pass" else "fail"
        }
    , validationMetricTone
        { label: "Auditor classifier"
        , value:
            if report.conforms then
              "canonical-pipeline match"
            else
              "foreign/off-spec"
        }
    ]
      <> if Array.null report.violations then
        [ ValidationPass ]
      else
        map (\violation -> validationSeverityTone (normalizedShaclSeverity violation.severity)) report.violations

  validationToneCounts tones =
    { passed: validationToneCount ValidationPass tones
    , warnings: validationToneCount ValidationWarn tones
    , violations: validationToneCount ValidationFail tones
    }

  validationToneCount tone tones =
    Array.length (Array.filter (_ == tone) tones)

  validationCountsTotal counts =
    counts.passed + counts.warnings + counts.violations

  validationTallyText counts =
    show (validationCountsTotal counts)
      <> " checks evaluated / "
      <> show counts.passed
      <> " passed / "
      <> show counts.warnings
      <> " warnings / "
      <> show counts.violations
      <> " violations"

  validationMetricTone metric =
    if validationTextIsFailure metric.value then ValidationFail
    else if validationTextIsWarning metric.value then ValidationWarn
    else ValidationPass

  validationSectionRowTone sectionTitle row =
    if sectionTitle == "Missing context" then ValidationWarn
    else if validationTextIsFailure row.value then ValidationFail
    else if validationTextIsWarning row.value then ValidationWarn
    else ValidationPass

  validationSeverityTone severity =
    if severity == "warning" || severity == "info" then ValidationWarn
    else ValidationFail

  validationTextIsFailure value =
    value == "fail"
      || value == "failed"
      || value == "invalid"
      || value == "foreign/off-spec"
      || value == "provider error"
      || value == "error"

  validationTextIsWarning value =
    value == "incomplete"
      || value == "not evaluated"
      || value == "not_evaluated"
      || value == "needs context"
      || value == "warning"
      || value == "warn"

  validationFilterAllows selected tone =
    case selected of
      ValidationAll        -> true
      ValidationPassed     -> tone == ValidationPass
      ValidationWarnings   -> tone == ValidationWarn
      ValidationViolations -> tone == ValidationFail

  validationToneClass tone =
    case tone of
      ValidationPass -> "success"
      ValidationWarn -> "warning"
      ValidationFail -> "error"

  validationToneChipClass tone =
    case tone of
      ValidationPass -> "li-chip--success"
      ValidationWarn -> "li-chip--warning"
      ValidationFail -> "li-chip--error"

  validationToneIcon tone =
    case tone of
      ValidationPass -> "check_circle"
      ValidationWarn -> "warning"
      ValidationFail -> "error"

  validationToneBadge tone =
    case tone of
      ValidationPass -> "pass"
      ValidationWarn -> "warning"
      ValidationFail -> "error"

  presentValidationRow sectionTitle row =
    case sectionTitle of
      "Checks" ->
        row
          { value = presentValidationCheckStatus row.value row.detail
          , detail = presentValidationCheckDetail row.detail
          }
      "Missing context" ->
        row { label = readableValidationToken row.label }
      _ -> row

  presentValidationCheckStatus status detail =
    if status == "not_evaluated" && validationCheckNeedsContext detail then
      "needs context"
    else
      readableValidationToken status

  validationCheckNeedsContext detail =
    StringCodeUnits.contains (String.Pattern "needs more explicit context") detail
      || StringCodeUnits.contains (String.Pattern "Missing ") detail

  presentValidationCheckDetail detail =
    if StringCodeUnits.contains (String.Pattern "scope ledger / Ledger validation needs more explicit context before Conway applyTx can run.") detail then
      "Missing required validation context."
    else if StringCodeUnits.contains (String.Pattern "scope ledger / Ledger validation was not run because the supplied context is invalid.") detail then
      "Fix the context errors below."
    else
      stripValidationScope detail

  stripValidationScope detail =
    String.replaceAll (String.Pattern "scope ledger / ") (String.Replacement "")
      (String.replaceAll (String.Pattern "scope context / ") (String.Replacement "") detail)

  readableValidationToken token =
    String.replaceAll (String.Pattern "_") (String.Replacement " ") token

  renderWitnessWarnings warnings =
    if Array.null warnings then
      HH.text ""
    else
      HH.div
        [ classNames [ "witness-warnings" ] ]
        (map (\warning -> HH.p_ [ HH.text warning ]) warnings)

  renderWitnessSection state section =
    HH.div
      [ classNames [ "witness-section" ] ]
      [ HH.div
          [ classNames [ "identity-section-title" ] ]
          [ HH.text section.title ]
      , if Array.null section.rows then
          HH.div
            [ classNames [ "witness-empty" ] ]
            [ HH.text section.empty ]
        else
          HH.div
            [ classNames [ "witness-row-list" ] ]
            (map (renderWitnessRow state) section.rows)
      ]

  renderWitnessRow state row =
    renderWitnessRowWithCopy state true row

  renderWitnessRowWithCopy state showCopy row =
    let
      resolvedName = resolutionNameForCandidates state row.identifierCandidates
    in
      HH.div
        [ classNames [ "identity-row", "witness-row" ] ]
        [ HH.div
            [ classNames [ "identity-copy" ] ]
            [ HH.span
                [ classNames [ "identity-label" ] ]
                [ HH.text row.label ]
            , if showCopy then
                HH.element (HH.ElemName "md-outlined-button")
                  [ HE.onClick (\_ -> CopyValue row.path row.copyValue)
                  , classNames [ "inline-action" ]
                  , HH.attr (HH.AttrName "role") "button"
                  , mdControl "inline"
                  ]
                  [ HH.text
                      ( if state.copiedPath == Just row.path then
                          "Copied"
                        else
                          "Copy"
                      )
                  ]
              else
                HH.text ""
            ]
        , HH.code_ [ HH.text row.value ]
        , if resolvedName == "" then
            HH.text ""
          else
            HH.strong
              [ classNames [ "witness-resolved-name" ] ]
              [ HH.text resolvedName ]
        , if row.detail == "" then
            HH.text ""
          else
            HH.span
              [ classNames [ "witness-detail" ] ]
              [ HH.text row.detail ]
        ]

  renderIdentityRow state row =
    let
      canCopy = identityRowCanCopy row.path
      copied = state.copiedPath == Just row.path
      rowClasses =
        if copied then [ "identity-row", "is-copied" ]
        else [ "identity-row" ]
      valueClasses =
        if canCopy then [ "identity-value", "summary-copy-target" ]
        else [ "identity-value" ]
      valueProps =
        if canCopy then
          [ classNames valueClasses
          , HE.onClick (\_ -> CopyValue row.path row.copyValue)
          , HP.title "Copy value"
          ]
        else
          [ classNames valueClasses ]
    in
    HH.div
      [ classNames rowClasses ]
      [ HH.span
          [ classNames [ "identity-label" ] ]
          [ HH.text row.label ]
      , HH.code valueProps [ HH.text row.value ]
      ]

  identityRowCanCopy path =
    path == "[\"identification\",\"tx_id\"]"
      || path == "[\"identification\",\"body_hash\"]"

  renderBrowser state browser =
    HH.div
      [ classNames [ "json-browser" ]
      , mdSurface "decoded"
      ]
      [ HH.div
          [ classNames [ "browser-heading" ] ]
          [ HH.div_
              [ HH.h3_ [ HH.text "Transaction browser" ]
              , HH.p_ [ HH.text browser.subtitle ]
              ]
          , HH.element (HH.ElemName "md-outlined-button")
              [ HE.onClick (\_ -> CopyValue browser.currentPath browser.currentJson)
              , classNames [ "inline-action" ]
              , HH.attr (HH.AttrName "role") "button"
              , mdControl "inline"
              ]
              [ HH.text
                  ( if state.copiedPath == Just browser.currentPath then
                      "Copied"
                    else
                      "Copy current"
                  )
              ]
          ]
      , HH.div
          [ classNames [ "browser-row-list" ] ]
          (renderTreeRows state browser)
      ]

  renderTreeRows state browser =
    if Array.null browser.rows then
      [ HH.div
          [ classNames [ "scalar-value" ] ]
          [ HH.code_ [ HH.text browser.currentJson ] ]
      ]
    else
      Array.concatMap (renderTreeRow state) browser.rows

  renderTreeRow state row =
    let
      expanded = isExpanded row.path state.expandedPaths
      child = browserAt row.path state.browserNodes
      copied = state.copiedPath == Just row.path
    in
      [ HH.div
          [ classNames
              ( if expanded then
                  if copied then [ "browser-row", "is-expanded", "is-copied" ]
                  else [ "browser-row", "is-expanded" ]
                else
                  if copied then [ "browser-row", "is-copied" ]
                  else [ "browser-row" ]
              )
          ]
          [ HH.div
              [ classNames [ "browser-row-main" ] ]
              [ HH.div
                  [ classNames [ "browser-keyline" ] ]
                  [ HH.code_ [ HH.text row.label ]
                  , HH.span
                      [ classNames [ "kind-badge" ] ]
                      [ HH.text row.kind ]
                  , if row.canDive then
                      HH.span
                        [ classNames [ "browser-row-actions" ] ]
                        [
                          HH.element (HH.ElemName "md-outlined-button")
                            [ HE.onClick (\_ -> BrowseJson row.path)
                            , classNames [ "inline-action", "browser-row-action" ]
                            , HH.attr (HH.AttrName "role") "button"
                            , mdControl "inline"
                            ]
                            [ HH.text (if expanded then "Close" else "Open") ]
                        ]
                    else HH.text ""
                  ]
              , HH.div
                  [ classNames [ "browser-summary", "summary-copy-target" ]
                  , HE.onClick (\_ -> CopyValue row.path row.copyValue)
                  , HP.title "Copy value"
                  ]
                  [ HH.text row.summary ]
              ]
          ]
      ] <> if expanded then
        [ HH.div
            [ classNames [ "browser-children" ] ]
            ( case child of
                Just browser ->
                  renderTreeRows state browser
                Nothing ->
                  [ HH.div
                      [ classNames [ "scalar-value" ] ]
                      [ HH.code_ [ HH.text "Loading..." ] ]
                  ]
            )
        ]
      else []

  isExpanded path paths =
    Array.elem path paths

  browserAt path nodes =
    _.browser <$> Array.find (\node -> node.path == path) nodes

  upsertBrowserNode path browser nodes =
    if Array.any (\node -> node.path == path) nodes then
      map
        ( \node ->
            if node.path == path then
              { path, browser }
            else
              node
        )
        nodes
    else
      Array.snoc nodes { path, browser }

  expandPath path paths =
    if Array.elem path paths then paths
    else Array.snoc paths path

  closePath path paths =
    Array.filter (_ /= path) paths

  defaultDecodedTreeExpanded lens =
    case lens of
      Nothing -> []
      Just decoded ->
        decoded.rows
          # Array.filter (\row -> row.parentId == "" || row.depth <= 2)
          # map _.id

  rootBrowserNodes browser =
    [ { path: browser.currentPath, browser } ]

  renderMetric metric =
    HH.div
      [ classNames [ "metric-card" ] ]
      [ HH.span
          [ classNames [ "metric-label" ] ]
          [ HH.text metric.label ]
      , HH.strong_ [ HH.text metric.value ]
      ]

  renderRawJson stdout =
    HH.details
      [ classNames [ "raw-json-block" ] ]
      [ HH.summary_ [ HH.text "Raw JSON" ]
      , HH.pre_ [ HH.text (Json.pretty stdout) ]
      ]

  renderStderr stderr =
    if stderr == "" then []
    else
      [ HH.div
          [ classNames [ "stderr-block" ] ]
          [ HH.h3_ [ HH.text "stderr" ]
          , HH.pre_ [ HH.text stderr ]
          ]
      ]

  classNames :: forall r a. Array String -> HP.IProp (class :: String | r) a
  classNames names = HP.classes (map HH.ClassName names)

  mdSurface :: forall r a. String -> HP.IProp r a
  mdSurface = HH.attr (HH.AttrName "data-md3-surface")

  mdControl :: forall r a. String -> HP.IProp r a
  mdControl = HH.attr (HH.AttrName "data-md3-control")

  choiceClass :: forall r a. Boolean -> HP.IProp (class :: String | r) a
  choiceClass selected =
    classNames
      ( if selected then
          [ "choice-option", "is-selected" ]
        else
          [ "choice-option" ]
      )

  looksLikeBlockfrostProjectId value =
    let
      trimmed = String.trim value
    in
      StringCodeUnits.take 7 trimmed == "mainnet"
        || StringCodeUnits.take 7 trimmed == "preprod"
        || StringCodeUnits.take 7 trimmed == "preview"

  resolvedLabelsLensFromGraph graphTurtle = do
    lensResult <- liftEffect (RdfShapes.queryResolvedLabels graphTurtle)
    pure
      ( Just
          ( case lensResult of
              Left err ->
                { rows: []
                , error: Just err
                }
              Right rows ->
                { rows
                , error: Nothing
                }
          )
      )

  sparqlLensFromGraph graphTurtle = do
    lensResult <- liftEffect (RdfShapes.queryTransactionOutputs graphTurtle)
    pure
      ( Just
          ( case lensResult of
              Left err ->
                { rows: []
                , error: Just err
                }
              Right rows ->
                { rows
                , error: Nothing
                }
          )
      )

  typedFieldsLensFromGraph graphTurtle = do
    lensResult <- liftEffect (RdfShapes.queryTypedFields graphTurtle)
    pure
      ( Just
          ( case lensResult of
              Left err ->
                { rows: []
                , error: Just err
                }
              Right rows ->
                { rows
                , error: Nothing
              }
          )
      )

  decodedTreeLensFromGraph graphTurtle = do
    lensResult <- liftEffect (RdfShapes.queryDecodedTree graphTurtle)
    pure
      ( Just
          ( case lensResult of
              Left err ->
                { rows: []
                , error: Just err
                }
              Right rows ->
                { rows
                , error: Nothing
                }
          )
      )

  shaclConformanceFromGraph graphTurtle st =
    let
      shapeParts = selectedShaclParts st
    in
      if Array.null shapeParts then
        pure Nothing
      else do
        reportResult <- liftEffect (RdfShapes.validate graphTurtle (selectedShaclTurtle st))
        pure
          ( Just
              { shapeLabels: selectedShaclLabels st
              , report:
                  case reportResult of
                    Right report -> Just report
                    Left _       -> Nothing
              , error:
                  case reportResult of
                    Right _  -> Nothing
                    Left err -> Just err
              }
          )

  rdfLensesForState st rdf = do
    sparqlLens <- sparqlLensFromGraph rdf.turtle
    let graphTurtle = mergedRdfTurtle rdf.turtle (selectedOverlayTurtle st)
    resolvedLabelsLens <-
      resolvedLabelsLensFromGraph graphTurtle
    typedFieldsLens <- typedFieldsLensFromGraph rdf.turtle
    decodedTreeLens <- decodedTreeLensFromGraph graphTurtle
    shaclConformance <- shaclConformanceFromGraph graphTurtle st
    pure
      { sparqlLens
      , resolvedLabelsLens
      , typedFieldsLens
      , decodedTreeLens
      , shaclConformance
      }

  resolvedLabelsLensForState st =
    case st.rdf of
      Just rdf ->
        if rdf.valid then
          resolvedLabelsLensFromGraph
            (mergedRdfTurtle rdf.turtle (selectedOverlayTurtle st))
        else
          pure Nothing
      Nothing -> pure Nothing

  shaclConformanceForState st =
    case st.rdf of
      Just rdf ->
        if rdf.valid then
          shaclConformanceFromGraph
            (mergedRdfTurtle rdf.turtle (selectedOverlayTurtle st))
            st
        else
          pure Nothing
      Nothing -> pure Nothing

  decodedTreeLensForState st =
    case st.rdf of
      Just rdf ->
        if rdf.valid then
          decodedTreeLensFromGraph
            (mergedRdfTurtle rdf.turtle (selectedOverlayTurtle st))
        else
          pure Nothing
      Nothing -> pure Nothing

  handleAction = case _ of
    Initialize -> pure unit
    SelectKeyTab tab -> H.modify_ _ { keyTab = tab }
    SetKeyMnemonicWordCount count -> H.modify_ _ { mnemonicWordCount = count }
    GenerateKeyMnemonic -> do
      count <- H.gets _.mnemonicWordCount
      words <- liftEffect (Mnemonic.generateMnemonic count)
      H.modify_ _ { generatedMnemonic = Just words }
    CopyKeyMnemonic -> do
      generated <- H.gets _.generatedMnemonic
      case generated of
        Nothing -> pure unit
        Just words -> H.liftAff (Clipboard.copy (String.joinWith " " words))
    ToggleGeneratedMnemonic -> H.modify_ \state -> state { showGeneratedMnemonic = not state.showGeneratedMnemonic }
    UseGeneratedMnemonic -> do
      generated <- H.gets _.generatedMnemonic
      case generated of
        Nothing -> pure unit
        Just words -> do
          H.modify_ _ { restorePhrase = String.joinWith " " words }
          refreshKeyDerivation
    ToggleRestorePhrase -> H.modify_ \state -> state { showRestorePhrase = not state.showRestorePhrase }
    ToggleDerivedKeys -> H.modify_ \state -> state { showDerivedKeys = not state.showDerivedKeys }
    SetRestorePhrase value -> H.modify_ _ { restorePhrase = value } *> refreshKeyDerivation
    SetRestoreFamily family -> do
      role <- H.gets _.derivationRole
      H.modify_ _ { restoreFamily = family, derivationRole = keyNormalizeRole family role }
      refreshKeyDerivation
    SetShelleyNetwork network -> H.modify_ _ { shelleyNetwork = network } *> refreshKeyDerivation
    SelectShelleyCustomNetwork -> do
      state <- H.get
      let networkTag = case Int.fromString (String.trim state.shelleyCustomNetworkTagInput) of
            Just value | value >= 0 && value <= 15 -> value
            _ -> 3
      H.modify_ _ { shelleyNetwork = Shelley.ShelleyCustom networkTag }
      refreshKeyDerivation
    SetShelleyCustomNetworkTag value -> do
      state <- H.get
      let network = case Int.fromString (String.trim value) of
            Just networkTag | networkTag >= 0 && networkTag <= 15 -> Shelley.ShelleyCustom networkTag
            _ -> state.shelleyNetwork
      H.modify_ _ { shelleyCustomNetworkTagInput = value, shelleyNetwork = network }
      refreshKeyDerivation
    SetAccountIndex value -> H.modify_ _ { accountIndexInput = keyNormalizeIndex value } *> refreshKeyDerivation
    SetAddressIndex value -> H.modify_ _ { addressIndexInput = keyNormalizeIndex value } *> refreshKeyDerivation
    SetDerivationRole role -> H.modify_ _ { derivationRole = role } *> refreshKeyDerivation
    SetLegacyStyle style -> H.modify_ _ { legacyStyle = style } *> refreshKeyLegacy
    SetLegacyNetwork network -> do
      H.modify_ _ { legacyNetwork = network }
      refreshKeyDerivation
      refreshKeyLegacy
    SelectLegacyCustomNetwork -> do
      state <- H.get
      let magic = case Int.fromString (String.trim state.legacyCustomMagicInput) of
            Just value | value >= 0 -> value
            _ -> 4242
      H.modify_ _ { legacyNetwork = Bootstrap.LegacyCustom magic }
      refreshKeyDerivation
      refreshKeyLegacy
    SetLegacyAddressXPub value -> H.modify_ _ { legacyAddressXPubInput = value } *> refreshKeyLegacy
    SetLegacyRootXPub value -> H.modify_ _ { legacyRootXPubInput = value } *> refreshKeyLegacy
    SetLegacyDerivationPath value -> H.modify_ _ { legacyDerivationPathInput = value } *> refreshKeyLegacy
    SetLegacyCustomMagic value -> do
      H.modify_ _ { legacyCustomMagicInput = value }
      refreshKeyDerivation
      refreshKeyLegacy
    SetSigningPayloadMode mode -> H.modify_ _ { signingPayloadMode = mode } *> refreshKeySigning
    SetSigningPayload value -> H.modify_ _ { signingPayloadInput = value } *> refreshKeySigning
    ToggleSigningKey -> H.modify_ \state -> state { showSigningKey = not state.showSigningKey }
    SetSigningKey value -> H.modify_ _ { signingKeyInput = value } *> refreshKeySigning
    UseSigningResultForVerification -> do
      state <- H.get
      case state.signingResult of
        Just (Right result) -> do
          H.modify_ _
            { verifyPayloadMode = state.signingPayloadMode
            , verifyPayloadInput = state.signingPayloadInput
            , verificationKeyInput = result.verificationKeyBech32
            , signatureInput = result.signatureHex
            }
          refreshKeyVerification
        _ -> pure unit
    SetVerifyPayloadMode mode -> H.modify_ _ { verifyPayloadMode = mode } *> refreshKeyVerification
    SetVerifyPayload value -> H.modify_ _ { verifyPayloadInput = value } *> refreshKeyVerification
    SetVerificationKey value -> H.modify_ _ { verificationKeyInput = value } *> refreshKeyVerification
    SetSignature value -> H.modify_ _ { signatureInput = value } *> refreshKeyVerification
    CopyKeyValue value -> H.liftAff (Clipboard.copy value)
    SetVaultPassphrase value ->
      H.modify_ _ { vaultPassphraseInput = value, vaultErrorMessage = Nothing, vaultStatusMessage = Nothing }
    ToggleVaultPassphrase ->
      H.modify_ \state -> state { showVaultPassphrase = not state.showVaultPassphrase }
    CreateVault -> do
      state <- H.get
      if String.trim state.vaultPassphraseInput == "" then
        vaultError "Enter a vault passphrase before creating a vault."
      else do
        result <- H.liftAff (attempt (Vault.createVaultFile defaultVaultFileName state.vaultPassphraseInput []))
        case result of
          Left err -> vaultError ("Vault creation failed: " <> message err)
          Right fileName -> H.modify_ _
            { vaultFileName = fileName
            , vaultUnlocked = true
            , vaultEntries = []
            , vaultDirty = false
            , vaultErrorMessage = Nothing
            , vaultStatusMessage = Just ("Created encrypted vault " <> fileName <> ".")
            }
    OpenVault -> do
      state <- H.get
      if String.trim state.vaultPassphraseInput == "" then
        vaultError "Enter the vault passphrase before opening a vault file."
      else do
        result <- H.liftAff (attempt (Vault.importVaultFile state.vaultPassphraseInput))
        case result of
          Left err -> vaultError ("Vault import failed: " <> message err)
          Right imported ->
            if imported.canceled then
              H.modify_ _ { vaultErrorMessage = Nothing, vaultStatusMessage = Just "Vault import canceled." }
            else
              H.modify_ _
                { vaultFileName = imported.fileName
                , vaultUnlocked = true
                , vaultEntries = imported.entries
                , vaultDirty = false
                , vaultErrorMessage = Nothing
                , vaultStatusMessage = Just ("Opened encrypted vault " <> imported.fileName <> ".")
                }
    ExportVault -> do
      state <- H.get
      if not state.vaultUnlocked then
        vaultError "Open or create a vault before downloading a backup."
      else if String.trim state.vaultPassphraseInput == "" then
        vaultError "Enter the vault passphrase before downloading a backup."
      else do
        result <- H.liftAff (attempt (Vault.exportVaultFile state.vaultFileName state.vaultPassphraseInput state.vaultEntries))
        case result of
          Left err -> vaultError ("Vault export failed: " <> message err)
          Right _ -> H.modify_ _
            { vaultDirty = false
            , vaultErrorMessage = Nothing
            , vaultStatusMessage = Just ("Downloaded encrypted vault backup " <> state.vaultFileName <> ".")
            }
    LockVault ->
      H.modify_ _
        { vaultPassphraseInput = ""
        , showVaultPassphrase = false
        , vaultUnlocked = false
        , vaultEntries = []
        , vaultDirty = false
        , txSigningKeyInput = ""
        , showTxSigningKey = false
        , txSigningResult = Nothing
        , vaultErrorMessage = Nothing
        , vaultStatusMessage = Just "Vault locked. Decrypted entries were cleared from memory."
        }
    SetMnemonicVaultLabel value -> H.modify_ _ { mnemonicVaultLabelInput = value }
    SetRestoreVaultLabel value -> H.modify_ _ { restoreVaultLabelInput = value }
    SetSigningVaultLabel value -> H.modify_ _ { signingVaultLabelInput = value }
    SetProviderVaultLabel value -> H.modify_ _ { providerVaultLabelInput = value }
    SaveGeneratedMnemonicToVault -> do
      state <- H.get
      case state.generatedMnemonic of
        Nothing -> vaultError "Generate a mnemonic before saving it to the vault."
        Just words ->
          saveVaultEntry Vault.VaultMnemonic
            (vaultEntryLabel state.mnemonicVaultLabelInput (show (Array.length words) <> "-word mnemonic"))
            (String.joinWith " " words)
    SaveRestoreMnemonicToVault -> do
      state <- H.get
      let phrase = String.trim state.restorePhrase
      if phrase == "" then vaultError "Enter a recovery phrase before saving it to the vault."
      else saveVaultEntry Vault.VaultMnemonic (vaultEntryLabel state.restoreVaultLabelInput "Restore phrase") phrase
    SaveSigningKeyToVault -> do
      state <- H.get
      let secret = String.trim state.signingKeyInput
      if secret == "" then vaultError "Enter a signing key before saving it to the vault."
      else saveVaultEntry Vault.VaultSigningKey (vaultEntryLabel state.signingVaultLabelInput "Signing key") secret
    SaveDerivedKeyToVault kind label value -> saveVaultEntry kind label value
    SaveProviderSecretToVault -> do
      state <- H.get
      let secret = providerSecret state
      if String.trim secret == "" then vaultError ("Enter a " <> providerSecretLabel state.provider <> " before saving it to the vault.")
      else saveVaultEntry (providerVaultKind state.provider) (vaultEntryLabel state.providerVaultLabelInput (providerSecretLabel state.provider)) secret
    PeekVaultEntryInRestore entryId -> useVaultEntry restoreAcceptedKinds entryId \entry -> do
      H.modify_ _ { restorePhrase = entry.value }
      refreshKeyDerivation
    PopVaultEntryInRestore entryId -> popVaultEntry restoreAcceptedKinds entryId \entry -> do
      H.modify_ _ { restorePhrase = entry.value }
      refreshKeyDerivation
    PeekVaultEntryInSigning entryId -> useVaultEntry signingAcceptedKinds entryId \entry ->
      H.modify_ _ { signingKeyInput = entry.value } *> refreshKeySigning
    PopVaultEntryInSigning entryId -> popVaultEntry signingAcceptedKinds entryId \entry ->
      H.modify_ _ { signingKeyInput = entry.value } *> refreshKeySigning
    PeekVaultEntryInTxSigning entryId -> useVaultEntry signingAcceptedKinds entryId \entry ->
      H.modify_ _ { txSigningKeyInput = entry.value, txSigningResult = Nothing }
    PopVaultEntryInTxSigning entryId -> popVaultEntry signingAcceptedKinds entryId \entry ->
      H.modify_ _ { txSigningKeyInput = entry.value, txSigningResult = Nothing }
    PeekVaultEntryInProvider entryId -> do
      state <- H.get
      useVaultEntry (providerAcceptedKinds state.provider) entryId setProviderEntry
    PopVaultEntryInProvider entryId -> do
      state <- H.get
      popVaultEntry (providerAcceptedKinds state.provider) entryId setProviderEntry
    DeleteVaultEntry entryId -> do
      state <- H.get
      persistVaultEntries (Array.filter (\entry -> entry.id /= entryId) state.vaultEntries) "Removed entry from the vault."
    SetTxSigningKey value ->
      H.modify_ _ { txSigningKeyInput = value, txSigningResult = Nothing }
    ToggleTxSigningKey ->
      H.modify_ \state -> state { showTxSigningKey = not state.showTxSigningKey }
    RunTxSign -> do
      state <- H.get
      if state.running then
        setTxSigningError "Wait for transaction inspection to finish before signing."
      else if state.txSigningRunning then
        pure unit
      else case state.txCbor of
        Nothing ->
          setTxSigningError "Inspect a transaction first to load its CBOR and body hash."
        Just txCbor ->
          case txSigningBodyHash state of
            Nothing ->
              setTxSigningError "The inspected transaction did not provide a body hash."
            Just bodyHash ->
              case state.witnessPlan of
                Nothing ->
                  setTxSigningError "The inspected transaction did not provide a witness plan."
                Just witnessPlan ->
                  if String.trim state.txSigningKeyInput == "" then
                    setTxSigningError "Enter an extended signing key before signing."
                  else if StringCodeUnits.contains (String.Pattern " ") (String.trim state.txSigningKeyInput) then
                    setTxSigningError "Unsupported signing key: expected an extended Bech32 signing key."
                  else do
                    H.modify_ _ { txSigningRunning = true, txSigningResult = Nothing }
                    prepared <- H.liftAff (TxSigning.prepareWitness bodyHash (String.trim state.txSigningKeyInput))
                    case prepared of
                      Left err ->
                        H.modify_ _ { txSigningRunning = false, txSigningResult = Just (Left err) }
                      Right detached ->
                        if witnessPlanHasSigner "Present vkey witnesses" detached.signerHashHex witnessPlan then
                          H.modify_ _
                            { txSigningRunning = false
                            , txSigningResult = Just (Left "Signer already present in the witness set.")
                            }
                        else if witnessPlanHasSigner "Missing declared signers" detached.signerHashHex witnessPlan then do
                          attached <- H.liftAff (TxSigning.attachWitness txCbor detached)
                          H.modify_ _ { txSigningRunning = false, txSigningResult = Just attached }
                        else
                          H.modify_ _
                            { txSigningRunning = false
                            , txSigningResult = Just (Left "Signer is not required by the current witness plan.")
                            }
    SetAddressInput value ->
      H.modify_ _ { addressInput = value, addressResult = Nothing }
    InspectAddress -> do
      state <- H.get
      if String.trim state.addressInput == "" then
        H.modify_ _ { addressResult = Just (Left "Paste a Cardano address to inspect.") }
      else do
        outcome <- H.liftAff (attempt (inspectAddressWithSharedWasm state.addressInput))
        H.modify_ _
          { addressResult = Just case outcome of
              Right result -> Right result
              Left err -> Left (message err)
          }
    SetScriptInputMode mode -> do
      state <- H.get
      H.modify_ _
        { scriptInputMode = mode
        , scriptResult = scriptAnalysisStatus mode state.scriptInput
        , scriptTemplateResult = scriptTemplateStatus mode state.scriptInput
        }
    SetScriptInput value ->
      H.modify_ \state ->
        state
          { scriptInput = value
          , scriptResult = scriptAnalysisStatus state.scriptInputMode value
          , scriptTemplateResult = scriptTemplateStatus state.scriptInputMode value
          }
    Navigate route event -> do
      routeBase <- H.gets _.routeBase
      liftEffect do
        Event.preventDefault (MouseEvent.toEvent event)
        Routing.pushRoute routeBase route
      H.modify_ _ { route = route }
    ToggleTheme -> do
      theme <- H.gets _.theme
      nextTheme <- liftEffect (Shell.toggleThemeEff theme)
      H.modify_ _ { theme = nextTheme }
    SetBlockfrostKey s -> do
      H.modify_ _ { blockfrostKey = s }
    SetKoiosBearer s -> do
      if looksLikeBlockfrostProjectId s then do
        H.modify_ _ { provider = Blockfrost, blockfrostKey = s, fetchError = Nothing }
        liftEffect (Storage.setItem providerKey (Provider.providerName Blockfrost))
      else do
        H.modify_ _ { koiosBearer = s }
    SelectProvider p -> do
      H.modify_ _ { provider = p, fetchError = Nothing }
      liftEffect (Storage.setItem providerKey (Provider.providerName p))
    SelectMode m -> H.modify_ _ { mode = m, fetchError = Nothing, copiedPath = Nothing }
    SelectNetwork n -> do
      H.modify_ _ { network = n, fetchError = Nothing, copiedPath = Nothing }
      liftEffect (Storage.setItem networkKey (networkName n))
    SetTxHash s -> H.modify_ _ { txHash = s, copied = false, copiedPath = Nothing, fetchError = Nothing }
    SetTxHex s -> H.modify_ _ { txHex = s, copied = false, copiedPath = Nothing, fetchError = Nothing }
    LoadExample hex -> do
      H.modify_ _ { mode = ByHex, txHex = hex, copied = false, copiedPath = Nothing, fetchError = Nothing }
      handleAction Decode
    SetLibraryInput s ->
      H.modify_ _ { libraryInput = s, libraryError = Nothing, libraryStatus = Nothing }
    SetLibraryUrl s ->
      H.modify_ _ { libraryUrl = s, libraryError = Nothing, libraryStatus = Nothing }
    AddLibraryBook -> do
      st <- H.get
      importLibraryBookText st.libraryInput
    ImportLibraryBookFile -> do
      H.modify_ _ { libraryError = Nothing, libraryStatus = Nothing }
      fileText <- H.liftAff (attempt (Storage.readFileInputText "library-book-file"))
      case fileText of
        Left err ->
          H.modify_
            _
              { libraryError = Just ("File import failed: " <> message err)
              , libraryStatus = Nothing
              }
        Right input ->
          importLibraryBookText input
    ImportLibraryBookFromUrl -> do
      st <- H.get
      let url = String.trim st.libraryUrl
      H.modify_ _ { libraryError = Nothing, libraryStatus = Nothing }
      if url == "" then
        H.modify_ _ { libraryError = Just "Book URL is empty.", libraryStatus = Nothing }
      else do
        fetched <- H.liftAff (attempt (Storage.fetchText url))
        case fetched of
          Left err ->
            H.modify_
              _
                { libraryError = Just ("URL import failed: " <> message err)
                , libraryStatus = Nothing
                }
          Right input ->
            importLibraryBookText input
    ExportSelectedLibraryBooks -> do
      st <- H.get
      let
        store =
          { kind: BookStore.envelopeKind
          , books:
              BookStore.selectedBooks
                { kind: BookStore.envelopeKind, books: st.books }
          }
      liftEffect
        ( Storage.downloadJson
            "cardano-ledger-inspector-selected-books.json"
            (BookStore.serialize store)
        )
      H.modify_ _ { libraryError = Nothing }
    ExportAllLibraryBooks -> do
      st <- H.get
      let store = { kind: BookStore.envelopeKind, books: st.books }
      liftEffect
        ( Storage.downloadJson
            "cardano-ledger-inspector-books.json"
            (BookStore.serialize store)
        )
      H.modify_ _ { libraryError = Nothing }
    ImportLibraryStoreFile -> do
      H.modify_ _ { libraryError = Nothing, libraryStatus = Nothing }
      fileText <- H.liftAff (attempt (Storage.readFileInputText "library-store-file"))
      case fileText of
        Left err ->
          H.modify_
            _
              { libraryError = Just ("Store import failed: " <> message err)
              , libraryStatus = Nothing
              }
        Right input ->
          case BookStore.parseStore input of
            Left err ->
              H.modify_
                _
                  { libraryError = Just ("Store import failed: " <> err)
                  , libraryStatus = Nothing
                  }
            Right imported -> do
              st <- H.get
              let
                books = mergeImportedBooks st.books imported.books
                edits = bookNameEditsFromBooks books
              liftEffect (saveBooks books)
              H.modify_
                _
                  { books = books
                  , bookNameEdits = edits
                  , libraryError = Nothing
                  , libraryStatus = Just (libraryStoreImportSuccess imported)
                  }
    ToggleLibraryBook bookId selected -> do
      st <- H.get
      let books = updateBook bookId (_ { selected = selected }) st.books
      liftEffect (saveBooks books)
      H.modify_ _ { books = books }
    SetLibraryBookName bookId name ->
      H.modify_ \st ->
        st
          { bookNameEdits = upsertBookNameEdit bookId name st.bookNameEdits
          , copiedPath = Nothing
          }
    SaveLibraryBookName bookId -> do
      st <- H.get
      let
        nextName = String.trim (bookEditNameById bookId st)
        books =
          if nextName == "" then
            st.books
          else
            updateBook bookId (_ { name = nextName }) st.books
        edits = bookNameEditsFromBooks books
      liftEffect (saveBooks books)
      H.modify_ _ { books = books, bookNameEdits = edits }
    DeleteLibraryBook bookId -> do
      st <- H.get
      case Array.find (\book -> book.id == bookId) st.books of
        Nothing -> pure unit
        Just book -> do
          confirmed <- liftEffect do
            win <- window
            Window.confirm ("Delete " <> book.name <> "?") win
          when confirmed do
            let
              books = Array.filter (\candidate -> candidate.id /= bookId) st.books
              edits = Array.filter (\edit -> edit.id /= bookId) st.bookNameEdits
            liftEffect (saveBooks books)
            H.modify_ _ { books = books, bookNameEdits = edits }
    CopyLibraryBookSource bookId -> do
      st <- H.get
      case Array.find (\book -> book.id == bookId) st.books of
        Nothing -> pure unit
        Just book -> do
          draft <- H.request _libraryEditor bookId GetLibraryEditorValue
          H.liftAff
            ( Clipboard.copy
                ( case draft of
                    Just value -> value
                    Nothing    -> libraryBookSourceText book
                )
            )
          H.modify_ _ { copiedPath = Just ("library:" <> bookId) }
    SaveLibraryBookSource bookId -> do
      st <- H.get
      case Array.find (\book -> book.id == bookId) st.books of
        Nothing -> pure unit
        Just book -> do
          draft <- H.request _libraryEditor bookId GetLibraryEditorValue
          case draft of
            Nothing ->
              H.modify_
                _
                  { libraryError = Just ("Could not read editor draft for " <> book.name <> ".")
                  , copiedPath = Nothing
                  }
            Just value -> do
              parsed <- liftEffect (OverlayBook.parse value)
              case parsed of
                Left err ->
                  H.modify_
                    _
                      { libraryError = Just ("Save failed for " <> book.name <> ": " <> err)
                      , copiedPath = Nothing
                      }
                Right parsedBook -> do
                  let
                    books =
                      updateBook bookId
                        ( _
                            { raw = value
                            , source = parsedBook.source
                            , parts = parsedBook.parts
                            , turtle = parsedBook.turtle
                            }
                        )
                        st.books
                    edits = bookNameEditsFromBooks books
                  liftEffect (saveBooks books)
                  H.modify_
                    _
                      { books = books
                      , bookNameEdits = edits
                      , libraryError = Nothing
                      , copiedPath = Just ("library:" <> bookId <> ":saved")
                      }
    ApplySelectedBooks -> do
      st <- H.get
      case st.txCbor of
        Nothing -> do
          resolvedLabelsLens <- resolvedLabelsLensForState st
          decodedTreeLens <- decodedTreeLensForState st
          shaclConformance <- shaclConformanceForState st
          H.modify_
            _
              { resolvedLabelsLens = resolvedLabelsLens
              , decodedTreeLens = decodedTreeLens
              , shaclConformance = shaclConformance
              }
        Just txCbor -> do
          H.modify_ _ { running = true, fetchError = Nothing }
          let rdfArgs = Json.operationArgsMerged st.operationArgs (selectedBlueprintArgs st)
          rdfResult <- H.liftAff (runLedgerOperation txCbor "tx.rdf" rdfArgs)
          let rdf = Json.operationRdfGraph rdfResult.stdout
          if rdfResult.exitOk && rdf.valid then do
            lenses <- rdfLensesForState st rdf
            H.modify_
              _
                { running = false
                , rdf = Just rdf
                , sparqlLens = lenses.sparqlLens
                , resolvedLabelsLens = lenses.resolvedLabelsLens
                , typedFieldsLens = lenses.typedFieldsLens
                , decodedTreeLens = lenses.decodedTreeLens
                , shaclConformance = lenses.shaclConformance
                , fetchError = Nothing
                }
          else
            H.modify_
              _
                { running = false
                , rdf = Nothing
                , sparqlLens = Nothing
                , resolvedLabelsLens = Nothing
                , typedFieldsLens = Nothing
                , decodedTreeLens = Nothing
                , shaclConformance = Nothing
                , fetchError =
                    Just
                      ( if rdfResult.stderr == "" then
                          "Haskell ledger operation tx.rdf failed."
                        else
                          rdfResult.stderr
                      )
                }
    StartDecodedTreeAnnotation row -> do
      st <- H.get
      let
        localBooks = selectedLocalBooks st
        firstBookId =
          case Array.head localBooks of
            Just book -> book.id
            Nothing   -> ""
        mode =
          if Array.null localBooks then "new" else "existing"
      H.modify_
        _
          { annotationDraft =
              Just
                { rowId: row.id
                , label: ""
                , typeName: ""
                , mode
                , bookId: firstBookId
                , newBookName: "Inline fixture annotations"
                , error: Nothing
                }
          }
    SetDecodedTreeAnnotationLabel value ->
      updateAnnotationDraft \draft -> draft { label = value, error = Nothing }
    SetDecodedTreeAnnotationType value ->
      updateAnnotationDraft \draft -> draft { typeName = value, error = Nothing }
    SetDecodedTreeAnnotationMode mode ->
      updateAnnotationDraft \draft -> draft { mode = mode, error = Nothing }
    SetDecodedTreeAnnotationBookId bookId ->
      updateAnnotationDraft \draft -> draft { bookId = bookId, error = Nothing }
    SetDecodedTreeAnnotationNewBookName value ->
      updateAnnotationDraft \draft -> draft { newBookName = value, error = Nothing }
    CancelDecodedTreeAnnotation ->
      H.modify_ _ { annotationDraft = Nothing }
    SaveDecodedTreeAnnotation row -> do
      st <- H.get
      case st.annotationDraft of
        Nothing -> pure unit
        Just draft ->
          saveDecodedTreeAnnotation st row draft
    Decode -> do
      st <- H.get
      H.modify_
        _
          { running = true
          , result = Nothing
          , loadFormExpanded = true
          , resultTab = StructureTab
          , txCbor = Nothing
          , operationArgs = "{}"
          , browser = Nothing
          , identification = Nothing
          , intent = Nothing
          , witnessPlan = Nothing
          , txSigningRunning = false
          , txSigningResult = Nothing
          , validation = Nothing
          , rdf = Nothing
          , sparqlLens = Nothing
          , resolvedLabelsLens = Nothing
          , typedFieldsLens = Nothing
          , decodedTreeLens = Nothing
          , shaclConformance = Nothing
          , browserNodes = []
          , expandedPaths = []
          , decodedTreeExpanded = []
          , decodedEmptyExpanded = []
          , decodedBytesExpanded = true
          , validationFilter = ValidationAll
          , annotationDraft = Nothing
          , copied = false
          , copiedPath = Nothing
          , browserPath = "[]"
          , fetchError = Nothing
          }
      hexE <- case st.mode of
        ByHex -> pure (Right (String.trim st.txHex))
        ByHash ->
          let key = case st.provider of
                Blockfrost -> String.trim st.blockfrostKey
                Koios      -> String.trim st.koiosBearer
              trimmedHash = String.trim st.txHash
          in
            if Provider.needsKey st.provider && key == ""
              then pure (Left (Provider.providerName st.provider <> " key not set."))
              else if trimmedHash == ""
                then pure (Left "Tx hash is empty.")
                else do
                  e <- H.liftAff (attempt (Provider.fetchTxCbor st.provider st.network key trimmedHash))
                  case e of
                    Left err ->
                      let raw = message err
                          diag = case st.provider of
                            Koios | raw == "Failed to fetch" ->
                              if String.trim st.koiosBearer == ""
                                then "Koios blocks anonymous browser requests by design. Sign up (free) at koios.rest/auth, paste the bearer token above, and retry."
                                else "Koios rejected the request. Check the bearer token is valid and the network matches (mainnet/preprod/preview)."
                            _ -> raw
                      in pure (Left diag)
                    Right cbor -> pure (Right cbor)
      case hexE of
        Left err -> H.modify_ _ { running = false, loadFormExpanded = true, fetchError = Just err, browserPath = "[]" }
        Right h -> do
          operationResult <- H.liftAff (runLedgerOperation h "tx.inspect" "{}")
          let
            providerKeyValue = case st.provider of
              Blockfrost -> String.trim st.blockfrostKey
              Koios      -> String.trim st.koiosBearer
            canFetchProducerTxs =
              operationResult.exitOk
                && (not (Provider.needsKey st.provider) || providerKeyValue /= "")
          inputContextArgs <-
            if operationResult.exitOk then do
              ctx <- H.liftAff
                (attempt (Provider.resolveProducerTxContext st.provider st.network providerKeyValue canFetchProducerTxs operationResult.stdout))
              case ctx of
                Right args -> pure args
                Left err ->
                  pure
                    ( Json.providerResolutionErrorArgs
                        (Provider.providerName st.provider)
                        (message err)
                    )
            else pure "{}"
          identifyResult <- H.liftAff (runLedgerOperation h "tx.identify" inputContextArgs)
          intentResult <- H.liftAff (runLedgerOperation h "tx.intent" inputContextArgs)
          witnessPlanResult <- H.liftAff (runLedgerOperation h "tx.witness.plan" inputContextArgs)
          validationResult <- H.liftAff (runLedgerOperation h "tx.validate" inputContextArgs)
          let rdfArgs = Json.operationArgsMerged inputContextArgs (selectedBlueprintArgs st)
          rdfResult <- H.liftAff (runLedgerOperation h "tx.rdf" rdfArgs)
          let
            inspectionResult = operationResult { stdout = Json.operationInspection operationResult.stdout }
            browser = Json.operationBrowser operationResult.stdout
            identification = Json.operationIdentification identifyResult.stdout
            intent = Json.operationIntentSummary intentResult.stdout
            witnessPlan = Json.operationWitnessPlan witnessPlanResult.stdout
            validation = Json.operationValidation validationResult.stdout
            rdf = Json.operationRdfGraph rdfResult.stdout
          lenses <-
            if operationResult.exitOk && rdfResult.exitOk && rdf.valid then
              rdfLensesForState st rdf
            else
              pure
                { sparqlLens: Nothing
                , resolvedLabelsLens: Nothing
                , typedFieldsLens: Nothing
                , decodedTreeLens: Nothing
                , shaclConformance: Nothing
                }
          H.modify_
            _
              { running = false
              , result = Just inspectionResult
              , loadFormExpanded = not (isDecodedResult inspectionResult)
              , txCbor = Just h
              , operationArgs = inputContextArgs
              , browser = if operationResult.exitOk && browser.valid then Just browser else Nothing
              , identification =
                  if identifyResult.exitOk && identification.valid then Just identification
                  else Nothing
              , intent =
                  if intentResult.exitOk && intent.valid then Just intent
                  else Nothing
              , witnessPlan =
                  if witnessPlanResult.exitOk && witnessPlan.valid then Just witnessPlan
                  else Nothing
              , validation =
                  if validationResult.exitOk && validation.valid then Just validation
                  else Nothing
              , rdf =
                  if operationResult.exitOk && rdfResult.exitOk && rdf.valid then Just rdf
                  else Nothing
              , sparqlLens = lenses.sparqlLens
              , resolvedLabelsLens = lenses.resolvedLabelsLens
              , typedFieldsLens = lenses.typedFieldsLens
              , decodedTreeLens = lenses.decodedTreeLens
              , shaclConformance = lenses.shaclConformance
              , browserNodes =
                  if operationResult.exitOk && browser.valid then rootBrowserNodes browser
                  else []
              , expandedPaths = []
              , decodedTreeExpanded = defaultDecodedTreeExpanded lenses.decodedTreeLens
              , browserPath = browser.currentPath
              }
    Copy -> do
      mr <- H.gets _.result
      case mr of
        Nothing -> pure unit
        Just r -> do
          H.liftAff (Clipboard.copy (Json.pretty r.stdout))
          H.modify_ _ { copied = true, copiedPath = Nothing }
    CopyValue path value -> do
      H.liftAff (Clipboard.copy value)
      H.modify_ _ { copied = false, copiedPath = Just path }
    BrowseJson path ->
      do
        st <- H.get
        if isExpanded path st.expandedPaths then
          H.modify_ _ { expandedPaths = closePath path st.expandedPaths, copiedPath = Nothing }
        else case st.txCbor of
          Nothing ->
            H.modify_ _ { browserPath = path, copiedPath = Nothing }
          Just txCbor -> do
            H.modify_ _ { browserPath = path, copiedPath = Nothing }
            let args = Json.operationArgsWithPath st.operationArgs path
            operationResult <- H.liftAff (runLedgerOperation txCbor "tx.browse" args)
            let browser = Json.operationBrowser operationResult.stdout
            H.modify_
              _
                { browserNodes =
                    if operationResult.exitOk && browser.valid then
                      upsertBrowserNode path browser st.browserNodes
                    else
                      st.browserNodes
                , expandedPaths =
                    if operationResult.exitOk && browser.valid then
                      expandPath path st.expandedPaths
                    else
                      st.expandedPaths
                , browserPath = browser.currentPath
                , fetchError =
                    if operationResult.exitOk && browser.valid then Nothing
                    else Just (if operationResult.stderr == "" then "Haskell ledger operation browse failed." else operationResult.stderr)
                }
    ToggleDecodedTree rowId -> do
      H.modify_
        \st ->
          st
            { decodedTreeExpanded =
                if Array.elem rowId st.decodedTreeExpanded then
                  closePath rowId st.decodedTreeExpanded
                else
                  expandPath rowId st.decodedTreeExpanded
            }
    ToggleDecodedEmpty groupId ->
      H.modify_
        \st ->
          st
            { decodedEmptyExpanded =
                if Array.elem groupId st.decodedEmptyExpanded then
                  Array.delete groupId st.decodedEmptyExpanded
                else
                  Array.cons groupId st.decodedEmptyExpanded
            }
    ToggleDecodedResolutions ->
      H.modify_ \st -> st { decodedResolutionsExpanded = not st.decodedResolutionsExpanded }
    SetDecodedRowStyle style ->
      H.modify_ _ { decodedRowStyle = style }
    ExpandDecodedTree ->
      H.modify_
        \st ->
          case st.decodedTreeLens of
            Just lens ->
              st
                { decodedTreeExpanded = decodedTreeExpandableIds lens.rows
                , decodedEmptyExpanded = decodedEmptyGroupIds lens.rows
                }
            Nothing -> st
    CollapseDecodedTree ->
      H.modify_
        \st ->
          st
            { decodedTreeExpanded = []
            , decodedEmptyExpanded = []
            }
    ToggleDecodedBytes ->
      H.modify_ \st -> st { decodedBytesExpanded = not st.decodedBytesExpanded }
    SetValidationFilter validationFilter ->
      H.modify_ _ { validationFilter = validationFilter }
    SelectResultTab tab ->
      H.modify_ _ { resultTab = tab }
    ChangeInput ->
      H.modify_ _ { loadFormExpanded = true, copied = false, copiedPath = Nothing, txSigningResult = Nothing }

  setTxSigningError errorMessage =
    H.modify_ _ { txSigningRunning = false, txSigningResult = Just (Left errorMessage) }

  vaultError errorMessage =
    H.modify_ _ { vaultErrorMessage = Just errorMessage, vaultStatusMessage = Nothing }

  saveVaultEntry kind label value = do
    state <- H.get
    if not state.vaultUnlocked then
      vaultError "Open or create a vault before saving secrets."
    else do
      entry <- liftEffect (Vault.createVaultEntry kind label value)
      persistVaultEntries (Array.snoc state.vaultEntries entry) ("Saved " <> entry.label <> " into the vault.")

  persistVaultEntries entries successMessage = do
    state <- H.get
    if not state.vaultUnlocked then
      vaultError "Open or create a vault before saving secrets."
    else if String.trim state.vaultPassphraseInput == "" then
      vaultError "Enter the vault passphrase before saving changes."
    else do
      result <- H.liftAff (attempt (Vault.persistVaultFile state.vaultFileName state.vaultPassphraseInput entries))
      case result of
        Left err -> H.modify_ _
          { vaultEntries = entries
          , vaultDirty = true
          , vaultErrorMessage = Just ("Vault save failed: " <> message err)
          , vaultStatusMessage = Nothing
          }
        Right fileName -> H.modify_ _
          { vaultFileName = fileName
          , vaultEntries = entries
          , vaultDirty = false
          , vaultErrorMessage = Nothing
          , vaultStatusMessage = Just successMessage
          }

  useVaultEntry acceptedKinds entryId consume = do
    state <- H.get
    if not state.vaultUnlocked then
      vaultError "Open a vault before loading secrets."
    else case Array.find (\entry -> entry.id == entryId) state.vaultEntries of
      Nothing -> vaultError "Selected vault entry was not found."
      Just entry ->
        if not (Array.elem entry.kind acceptedKinds) then
          vaultError "Selected vault entry is not compatible with this tool."
        else do
          consume entry
          H.modify_ _ { vaultErrorMessage = Nothing, vaultStatusMessage = Just ("Loaded " <> entry.label <> " into memory.") }

  popVaultEntry acceptedKinds entryId consume = do
    state <- H.get
    if not state.vaultUnlocked then
      vaultError "Open a vault before loading secrets."
    else case Array.find (\entry -> entry.id == entryId) state.vaultEntries of
      Nothing -> vaultError "Selected vault entry was not found."
      Just entry ->
        if not (Array.elem entry.kind acceptedKinds) then
          vaultError "Selected vault entry is not compatible with this tool."
        else do
          persistVaultEntries (Array.filter (\candidate -> candidate.id /= entryId) state.vaultEntries) ("Popped " <> entry.label <> " from the vault.")
          consume entry

  setProviderEntry entry = do
    provider <- H.gets _.provider
    case provider of
      Blockfrost -> H.modify_ _ { blockfrostKey = entry.value }
      Koios -> H.modify_ _ { koiosBearer = entry.value }

  restoreAcceptedKinds = [ Vault.kindTag Vault.VaultMnemonic ]

  txSigningBodyHash state =
    case state.identification of
      Just identification | identification.valid ->
        case Array.find (\row -> row.path == "[\"identification\",\"body_hash\"]") identification.primary of
          Just row | String.trim row.copyValue /= "" -> Just (String.trim row.copyValue)
          _ -> Nothing
      _ -> Nothing

  txSigningReady state =
    case state.txCbor of
      Just txCbor | String.trim txCbor /= "" ->
        case txSigningBodyHash state of
          Just _ ->
            case state.witnessPlan of
              Just witnessPlan -> witnessPlan.valid
              Nothing -> false
          Nothing -> false
      _ -> false

  witnessPlanHasSigner sectionTitle signerHash witnessPlan =
    case Array.find (\section -> section.title == sectionTitle) witnessPlan.sections of
      Nothing -> false
      Just section ->
        Array.any
          (\row -> String.trim row.copyValue == signerHash || String.trim row.value == signerHash)
          section.rows

  signingAcceptedKinds =
    [ Vault.kindTag Vault.VaultSigningKey
    , Vault.kindTag Vault.VaultRootPrivateKey
    , Vault.kindTag Vault.VaultAccountPrivateKey
    , Vault.kindTag Vault.VaultAddressPrivateKey
    , Vault.kindTag Vault.VaultStakePrivateKey
    ]

  providerAcceptedKinds = case _ of
    Blockfrost -> [ Vault.kindTag Vault.VaultBlockfrostProjectId ]
    Koios -> [ Vault.kindTag Vault.VaultKoiosBearerToken ]

  vaultEntriesForKinds acceptedKinds =
    Array.filter (\entry -> Array.elem entry.kind acceptedKinds)

  providerVaultKind = case _ of
    Blockfrost -> Vault.VaultBlockfrostProjectId
    Koios -> Vault.VaultKoiosBearerToken

  providerSecretLabel = case _ of
    Blockfrost -> "Blockfrost project ID"
    Koios -> "Koios bearer token"

  providerSecret state = case state.provider of
    Blockfrost -> String.trim state.blockfrostKey
    Koios -> String.trim state.koiosBearer

  vaultEntryLabel custom fallback =
    let normalized = String.trim custom
    in if normalized == "" then fallback else normalized

  vaultKindLabel kind
    | kind == Vault.kindTag Vault.VaultMnemonic = Vault.labelForKind Vault.VaultMnemonic
    | kind == Vault.kindTag Vault.VaultSigningKey = Vault.labelForKind Vault.VaultSigningKey
    | kind == Vault.kindTag Vault.VaultRootPrivateKey = Vault.labelForKind Vault.VaultRootPrivateKey
    | kind == Vault.kindTag Vault.VaultAccountPrivateKey = Vault.labelForKind Vault.VaultAccountPrivateKey
    | kind == Vault.kindTag Vault.VaultAddressPrivateKey = Vault.labelForKind Vault.VaultAddressPrivateKey
    | kind == Vault.kindTag Vault.VaultStakePrivateKey = Vault.labelForKind Vault.VaultStakePrivateKey
    | kind == Vault.kindTag Vault.VaultBlockfrostProjectId = Vault.labelForKind Vault.VaultBlockfrostProjectId
    | kind == Vault.kindTag Vault.VaultKoiosBearerToken = Vault.labelForKind Vault.VaultKoiosBearerToken
    | otherwise = kind

  defaultVaultFileName = "cardano-swiss-knife.vault.json"

  vaultStateLabel state
    | state.vaultUnlocked && state.vaultDirty = "Unlocked, modified in memory"
    | state.vaultUnlocked = "Unlocked"
    | otherwise = "Locked"

  updateAnnotationDraft update =
    H.modify_ \st -> st { annotationDraft = map update st.annotationDraft }

  annotationError messageText =
    updateAnnotationDraft \draft -> draft { error = Just messageText }

  saveDecodedTreeAnnotation st row draft = do
    let
      label = String.trim draft.label
      typeName = String.trim draft.typeName
      targetName = String.trim draft.newBookName
      turtle =
        BookStore.annotationTurtle
          { label
          , typeName
          , entityIri: row.entityIri
          , predicate: row.annotationPredicate
          , value: row.annotationValue
          }
    if label == "" then
      annotationError "Label is required."
    else if row.entityIri == "" || row.annotationPredicate == "" || row.annotationValue == "" || turtle == "" then
      annotationError "This decoded row does not expose a supported annotation identifier."
    else if draft.mode == "existing" then
      case Array.find (\book -> book.id == draft.bookId && book.selected && not book.seed) st.books of
        Nothing ->
          annotationError "Choose a selected local book."
        Just targetBook -> do
          let combined = appendTurtle targetBook.raw turtle
          parsed <- liftEffect (OverlayBook.parse combined)
          case parsed of
            Left err ->
              annotationError ("Generated Turtle did not parse: " <> err)
            Right parsedBook -> do
              let
                books =
                  updateBook
                    targetBook.id
                    ( \book ->
                        book
                          { raw = combined
                          , parts = parsedBook.parts
                          , turtle = parsedBook.turtle
                          }
                    )
                    st.books
              persistAnnotationBooks books
    else if targetName == "" then
      annotationError "New book name is required."
    else do
      parsed <- liftEffect (OverlayBook.parse turtle)
      case parsed of
        Left err ->
          annotationError ("Generated Turtle did not parse: " <> err)
        Right parsedBook -> do
          let
            newBook =
              { id: nextLocalBookId st.books
              , name: targetName
              , source: "annotation"
              , raw: turtle
              , parts: parsedBook.parts
              , turtle: parsedBook.turtle
              , selected: true
              , seed: false
              }
            books = Array.snoc st.books newBook
          persistAnnotationBooks books

  appendTurtle existing fragment =
    if String.trim existing == "" then
      String.trim fragment <> "\n"
    else
      String.trim existing <> "\n\n" <> String.trim fragment <> "\n"

  persistAnnotationBooks books = do
    let edits = bookNameEditsFromBooks books
    liftEffect (saveBooks books)
    st <- H.get
    let stWithBooks = st { books = books, bookNameEdits = edits, annotationDraft = Nothing, libraryError = Nothing }
    resolvedLabelsLens <- resolvedLabelsLensForState stWithBooks
    decodedTreeLens <- decodedTreeLensForState stWithBooks
    shaclConformance <- shaclConformanceForState stWithBooks
    H.modify_
      _
        { books = books
        , bookNameEdits = edits
        , annotationDraft = Nothing
        , libraryError = Nothing
        , resolvedLabelsLens = resolvedLabelsLens
        , decodedTreeLens = decodedTreeLens
        , shaclConformance = shaclConformance
        }

  importLibraryBookText raw = do
    let input = String.trim raw
    if input == "" then
      H.modify_
        _
          { libraryError = Just "Book input is empty."
          , libraryStatus = Nothing
          }
    else do
      parsed <- liftEffect (OverlayBook.parse input)
      case parsed of
        Left err ->
          H.modify_ _ { libraryError = Just err, libraryStatus = Nothing }
        Right book ->
          appendLibraryBook input book

  appendLibraryBook input book = do
    st <- H.get
    let
      newBook =
        { id: nextLocalBookId st.books
        , name: book.title
        , source: book.source
        , raw: input
        , parts: book.parts
        , turtle: book.turtle
        , selected: true
        , seed: false
        }
      books = Array.snoc st.books newBook
      edits = bookNameEditsFromBooks books
    liftEffect (saveBooks books)
    H.modify_
      _
        { books = books
        , bookNameEdits = edits
        , libraryInput = ""
        , libraryUrl = ""
        , libraryError = Nothing
        , libraryStatus = Just (libraryBookImportSuccess book)
        }

  saveBooks books =
    BookStore.save { kind: BookStore.envelopeKind, books }

  nextLocalBookId books =
    "local:" <> show (Array.foldl max 0 (Array.mapMaybe localBookNumber books) + 1)

  localBookNumber book =
    localIdNumber book.id

  localIdNumber value =
    let
      prefix = "local:"
    in
      if StringCodeUnits.take (StringCodeUnits.length prefix) value == prefix then
        Int.fromString (StringCodeUnits.drop (StringCodeUnits.length prefix) value)
      else
        Nothing

  mergeImportedBooks existing imported =
    let
      merged =
        Array.foldl
          ( \acc book ->
              let
                nextBook =
                  if Array.elem book.id acc.ids then
                    book { id = nextAvailableLocalId acc.ids }
                  else
                    book
              in
                { ids: Array.snoc acc.ids nextBook.id
                , books: Array.snoc acc.books nextBook
                }
          )
          { ids: map _.id existing, books: existing }
          imported
    in
      merged.books

  nextAvailableLocalId ids =
    "local:" <> show (Array.foldl max 0 (Array.mapMaybe localIdNumber ids) + 1)

  updateBook bookId update books =
    map
      (\book -> if book.id == bookId then update book else book)
      books

  bookNameEditsFromBooks books =
    map (\book -> { id: book.id, name: book.name }) books

  upsertBookNameEdit bookId name edits =
    if Array.any (\edit -> edit.id == bookId) edits then
      map
        (\edit -> if edit.id == bookId then edit { name = name } else edit)
        edits
    else
      Array.snoc edits { id: bookId, name }

  bookEditName state book =
    case Array.find (\edit -> edit.id == book.id) state.bookNameEdits of
      Just edit -> edit.name
      Nothing   -> book.name

  bookEditNameById bookId state =
    case Array.find (\edit -> edit.id == bookId) state.bookNameEdits of
      Just edit -> edit.name
      Nothing ->
        case Array.find (\book -> book.id == bookId) state.books of
          Just book -> book.name
          Nothing   -> ""

  libraryBookSummary book =
    let
      partCount = Array.length book.parts
    in
      show partCount <> if partCount == 1 then " part" else " parts"

  libraryBookImportSuccess book =
    let
      partCount = Array.length book.parts
      partsLabel = show partCount <> if partCount == 1 then " part" else " parts"
    in
      "Imported " <> book.title <> " (" <> partsLabel <> ")."
        <> if book.notice == "" then "" else " " <> book.notice

  libraryStoreImportSuccess store =
    let
      inspection = BookStore.inspect store
      booksLabel = show inspection.count <> if inspection.count == 1 then " book" else " books"
      partsLabel = show inspection.partCount <> if inspection.partCount == 1 then " part" else " parts"
    in
      "Imported " <> booksLabel <> " (" <> partsLabel <> ")."

  libraryBookSourceText book =
    if String.trim book.raw == "" then book.source else book.raw

  libraryBookEditorMode book =
    let
      source = String.trim (libraryBookSourceText book)
      first = StringCodeUnits.take 1 source
    in
      if first == "{" || first == "[" then RdfEditor.Json else RdfEditor.Turtle

  libraryEditorModeLabel = case _ of
    RdfEditor.Json -> "JSON"
    RdfEditor.Turtle -> "Turtle"

_libraryEditor :: Proxy "libraryEditor"
_libraryEditor = Proxy

type LibraryEditorInput =
  { value :: String
  , mode :: RdfEditor.Mode
  }

type LibraryEditorState =
  { value :: String
  , mode :: RdfEditor.Mode
  , handle :: Maybe RdfEditor.Handle
  }

data LibraryEditorAction
  = InitializeLibraryEditor
  | ReceiveLibraryEditorInput LibraryEditorInput
  | FinalizeLibraryEditor

data LibraryEditorQuery a
  = GetLibraryEditorValue (String -> a)

libraryEditorComponent
  :: forall m
   . MonadAff m
  => H.Component LibraryEditorQuery LibraryEditorInput Void m
libraryEditorComponent =
  H.mkComponent
    { initialState: \input ->
        { value: input.value
        , mode: input.mode
        , handle: Nothing
        }
    , render: renderLibraryEditor
    , eval:
        H.mkEval
          H.defaultEval
            { handleAction = handleLibraryEditorAction
            , handleQuery = handleLibraryEditorQuery
            , initialize = Just InitializeLibraryEditor
            , receive = Just <<< ReceiveLibraryEditorInput
            , finalize = Just FinalizeLibraryEditor
            }
    }

renderLibraryEditor
  :: forall m
   . LibraryEditorState
  -> H.ComponentHTML LibraryEditorAction () m
renderLibraryEditor _ =
  HH.div
    [ HP.classes [ HH.ClassName "rdf-editor-host" ]
    , HP.ref (H.RefLabel "rdf-editor-host")
    ]
    []

handleLibraryEditorAction
  :: forall m
   . MonadAff m
  => LibraryEditorAction
  -> H.HalogenM LibraryEditorState LibraryEditorAction () Void m Unit
handleLibraryEditorAction = case _ of
  InitializeLibraryEditor -> do
    st <- H.get
    target <- H.getHTMLElementRef (H.RefLabel "rdf-editor-host")
    case target of
      Nothing -> pure unit
      Just element -> do
        handle <-
          liftEffect
            ( RdfEditor.mount
                (unsafeCoerce element)
                { value: st.value
                , mode: st.mode
                }
            )
        H.modify_ _ { handle = Just handle }
  ReceiveLibraryEditorInput input -> do
    st <- H.get
    case st.handle of
      Nothing ->
        H.modify_ _ { value = input.value, mode = input.mode }
      Just handle -> do
        when (st.value /= input.value) do
          liftEffect (RdfEditor.setValue handle input.value)
        when (not (sameLibraryEditorMode st.mode input.mode)) do
          liftEffect (RdfEditor.setMode handle input.mode)
        H.modify_ _ { value = input.value, mode = input.mode }
  FinalizeLibraryEditor -> do
    st <- H.get
    case st.handle of
      Nothing -> pure unit
      Just handle -> do
        liftEffect (RdfEditor.dispose handle)
        H.modify_ _ { handle = Nothing }

handleLibraryEditorQuery
  :: forall a m
   . MonadAff m
  => LibraryEditorQuery a
  -> H.HalogenM LibraryEditorState LibraryEditorAction () Void m (Maybe a)
handleLibraryEditorQuery = case _ of
  GetLibraryEditorValue reply -> do
    st <- H.get
    value <- case st.handle of
      Just handle -> liftEffect (RdfEditor.getValue handle)
      Nothing     -> pure st.value
    pure (Just (reply value))

sameLibraryEditorMode :: RdfEditor.Mode -> RdfEditor.Mode -> Boolean
sameLibraryEditorMode RdfEditor.Json RdfEditor.Json = true
sameLibraryEditorMode RdfEditor.Turtle RdfEditor.Turtle = true
sameLibraryEditorMode _ _ = false
