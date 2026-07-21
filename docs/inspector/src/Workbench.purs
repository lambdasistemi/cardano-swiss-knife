module Workbench
  ( Input
  , VaultKey
  , Output(..)
  , component
  ) where

import Prelude

import Cardano.Transaction.Entry (EntryStatus(..), TxEntry, collectWitness, deriveCompleteness)
import Cardano.Transaction.Entry.Ports (EntryStore)
import Cardano.Transaction.Witness as Witness
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String as String
import Effect.Aff (Aff, attempt)
import Effect.Aff.Class (class MonadAff)
import Effect.Exception (message)
import Halogen as H
import Halogen.HTML as HH
import Halogen.HTML.Events as HE
import Halogen.HTML.Properties as HP
import TxSigning

type VaultKey =
  { id :: String
  , label :: String
  , value :: String
  }

type Input =
  { store :: EntryStore Aff
  , candidate :: Maybe TxEntry
  , candidateMessage :: Maybe String
  , vaultKeys :: Array VaultKey
  , fetchCurrentSlot :: Aff (Either String Int)
  }

data Output = EntrySelected TxEntry

type WitnessOutput =
  { rawCborHex :: String
  , textEnvelope :: String
  }

type State =
  { store :: EntryStore Aff
  , entries :: Array TxEntry
  , selectedId :: Maybe String
  , candidate :: Maybe TxEntry
  , candidateMessage :: Maybe String
  , vaultKeys :: Array VaultKey
  , selectedVaultKeyId :: Maybe String
  , fetchCurrentSlot :: Aff (Either String Int)
  , pastedWitness :: String
  , replaceCollectedWitness :: Boolean
  , witnessOutput :: Maybe WitnessOutput
  , errorMessage :: Maybe String
  , running :: Boolean
  }

data Action
  = Initialize
  | Receive Input
  | AddCurrent
  | SelectEntry String
  | SelectVaultKey String
  | ProduceWitness
  | SetPastedWitness String
  | ToggleReplaceCollectedWitness
  | AttachPastedWitness

component
  :: forall q m
   . MonadAff m
  => H.Component q Input Output m
component =
  H.mkComponent
    { initialState: \input ->
        { store: input.store
        , entries: []
        , selectedId: Nothing
        , candidate: input.candidate
        , candidateMessage: input.candidateMessage
        , vaultKeys: input.vaultKeys
        , selectedVaultKeyId: Nothing
        , fetchCurrentSlot: input.fetchCurrentSlot
        , pastedWitness: ""
        , replaceCollectedWitness: false
        , witnessOutput: Nothing
        , errorMessage: Nothing
        , running: false
        }
    , render
    , eval:
        H.mkEval
          H.defaultEval
            { handleAction = handleAction
            , initialize = Just Initialize
            , receive = Just <<< Receive
            }
    }

render :: forall m. State -> H.ComponentHTML Action () m
render state =
  HH.section
    [ HP.classes [ HH.ClassName "workbench" ]
    , HH.attr (HH.AttrName "role") "region"
    , HH.attr (HH.AttrName "aria-label") "Transaction workbench"
    ]
    [ HH.div [ HP.classes [ HH.ClassName "workbench-heading" ] ]
        [ HH.div_
            [ HH.h2_ [ HH.text "Transaction workbench" ]
            , HH.p_ [ HH.text "Save decoded transactions and collect detached witnesses without leaving the durable entry." ]
            ]
        , HH.button
            [ HP.disabled (state.candidate == Nothing)
            , HH.attr (HH.AttrName "type") "button"
            , HE.onClick (\_ -> AddCurrent)
            ]
            [ HH.text "Add current transaction" ]
        ]
    , case state.candidateMessage of
        Nothing -> HH.text ""
        Just value -> HH.p [ HP.classes [ HH.ClassName "workbench-explanation" ] ] [ HH.text value ]
    , HH.div
        [ HH.attr (HH.AttrName "role") "list"
        , HH.attr (HH.AttrName "aria-label") "Saved transactions"
        , HP.classes [ HH.ClassName "workbench-list" ]
        ]
        (if Array.null state.entries then [ HH.p_ [ HH.text "No saved transactions yet." ] ] else map (renderEntry state.selectedId) state.entries)
    , case selectedEntry state of
        Nothing -> HH.p_ [ HH.text "Select or add a transaction to see its signer completeness." ]
        Just entry -> renderSelected state entry
    ]

renderEntry :: forall m. Maybe String -> TxEntry -> H.ComponentHTML Action () m
renderEntry selectedId entry =
  let completeness = deriveCompleteness entry
  in HH.div [ HH.attr (HH.AttrName "role") "listitem" ]
      [ HH.button
          [ HH.attr (HH.AttrName "type") "button"
          , HH.attr (HH.AttrName "aria-label") ("Select " <> entry.entryId)
          , HH.attr (HH.AttrName "aria-pressed") (if selectedId == Just entry.entryId then "true" else "false")
          , HE.onClick (\_ -> SelectEntry entry.entryId)
          ]
          [ HH.span_ [ HH.text entry.entryId ]
          , HH.span [ HP.classes [ HH.ClassName "workbench-entry-status" ] ] [ HH.text (statusLabel entry.status) ]
          , HH.span [ HP.classes [ HH.ClassName "workbench-entry-completeness" ] ]
              [ HH.text (if completeness.isComplete then "Complete" else "Incomplete") ]
          , HH.span [ HP.classes [ HH.ClassName "workbench-entry-count" ] ]
              [ HH.text (show (Array.length completeness.satisfiedSigners) <> "/" <> show (Array.length completeness.requiredSigners)) ]
          ]
      ]

statusLabel :: EntryStatus -> String
statusLabel = case _ of
  Open -> "Open"
  Complete -> "Complete"
  Expired -> "Expired"
  Submitted -> "Submitted"

renderSelected :: forall m. State -> TxEntry -> H.ComponentHTML Action () m
renderSelected state entry =
  HH.div [ HP.classes [ HH.ClassName "workbench-selected" ] ]
    [ renderCompleteness entry
    , HH.section
        [ HH.attr (HH.AttrName "aria-label") "Transaction witnesses" ]
        [ HH.h3_ [ HH.text "Transaction witnesses" ]
        , HH.p_ [ HH.text "Select an unlocked vault key to produce one missing witness, or paste raw CBOR or a Cardano CLI detached-witness envelope." ]
        , HH.div [ HP.classes [ HH.ClassName "workbench-vault-keys" ] ]
            (if Array.null state.vaultKeys then
              [ HH.p_ [ HH.text "No unlocked signing keys are available." ] ]
            else map (renderVaultKey state.selectedVaultKeyId) state.vaultKeys)
        , HH.button
            [ HP.disabled (state.running || state.selectedVaultKeyId == Nothing)
            , HH.attr (HH.AttrName "type") "button"
            , HE.onClick (\_ -> ProduceWitness)
            ]
            [ HH.text "Produce witness" ]
        , HH.label_
            [ HH.span_ [ HH.text "Pasted detached witness" ]
            , HH.textarea
                [ HP.value state.pastedWitness
                , HH.attr (HH.AttrName "aria-label") "Pasted detached witness"
                , HE.onValueInput SetPastedWitness
                ]
            ]
        , HH.label_
            [ HH.input
                [ HP.type_ HP.InputCheckbox
                , HP.checked state.replaceCollectedWitness
                , HH.attr (HH.AttrName "aria-label") "Replace collected witness"
                , HE.onClick (\_ -> ToggleReplaceCollectedWitness)
                ]
            , HH.text "Replace collected witness"
            ]
        , HH.button
            [ HP.disabled state.running
            , HH.attr (HH.AttrName "type") "button"
            , HE.onClick (\_ -> AttachPastedWitness)
            ]
            [ HH.text "Attach pasted witness" ]
        , renderWitnessOutput state.witnessOutput
        , case state.errorMessage of
            Nothing -> HH.text ""
            Just errorMessage -> HH.p [ HH.attr (HH.AttrName "role") "alert", HP.classes [ HH.ClassName "tool-error" ] ] [ HH.text errorMessage ]
        ]
    ]

renderVaultKey :: forall m. Maybe String -> VaultKey -> H.ComponentHTML Action () m
renderVaultKey selectedKey key =
  HH.button
    [ HH.attr (HH.AttrName "type") "button"
    , HH.attr (HH.AttrName "aria-pressed") (if selectedKey == Just key.id then "true" else "false")
    , HE.onClick (\_ -> SelectVaultKey key.id)
    ]
    [ HH.text ("Use vault key " <> key.label) ]

renderWitnessOutput :: forall m. Maybe WitnessOutput -> H.ComponentHTML Action () m
renderWitnessOutput = case _ of
  Nothing -> HH.text ""
  Just output ->
    HH.div [ HP.classes [ HH.ClassName "workbench-witness-output" ] ]
      [ HH.label_
          [ HH.text "Normalized witness CBOR"
          , HH.textarea
              [ HP.value output.rawCborHex
              , HH.attr (HH.AttrName "aria-label") "Normalized witness CBOR"
              , HH.attr (HH.AttrName "readonly") "true"
              ]
          ]
      , HH.label_
          [ HH.text "TxWitness ConwayEra TextEnvelope"
          , HH.textarea
              [ HP.value output.textEnvelope
              , HH.attr (HH.AttrName "aria-label") "TxWitness ConwayEra TextEnvelope"
              , HH.attr (HH.AttrName "readonly") "true"
              ]
          ]
      ]

renderCompleteness :: forall m. TxEntry -> H.ComponentHTML Action () m
renderCompleteness entry =
  let completeness = deriveCompleteness entry
  in HH.div [ HP.classes [ HH.ClassName "workbench-completeness" ] ]
      [ HH.h3_
          [ HH.text (if completeness.isComplete then "Complete" else "Incomplete")
          , HH.text (" " <> show (Array.length completeness.satisfiedSigners) <> "/" <> show (Array.length completeness.requiredSigners))
          ]
      , signerGroup "Required signers" "None required." completeness.requiredSigners
      , signerGroup "Satisfied signers" "None satisfied." completeness.satisfiedSigners
      , signerGroup "Missing signers" "None missing." completeness.missingSigners
      ]

signerGroup :: forall m. String -> String -> Array String -> H.ComponentHTML Action () m
signerGroup title empty signers =
  HH.div [ HP.classes [ HH.ClassName "workbench-signer-group" ] ]
    [ HH.h4_ [ HH.text title ]
    , if Array.null signers then HH.p_ [ HH.text empty ] else HH.ul_ (map (\signer -> HH.li_ [ HH.text signer ]) signers)
    ]

selectedEntry :: State -> Maybe TxEntry
selectedEntry state = do
  entryId <- state.selectedId
  Array.find (\entry -> entry.entryId == entryId) state.entries

selectedVaultKey :: State -> Maybe VaultKey
selectedVaultKey state = do
  keyId <- state.selectedVaultKeyId
  Array.find (\key -> key.id == keyId) state.vaultKeys

updateEntry :: TxEntry -> Array TxEntry -> Array TxEntry
updateEntry replacement = map (\entry -> if entry.entryId == replacement.entryId then replacement else entry)

persistMutation
  :: forall m
   . MonadAff m
  => State
  -> TxEntry
  -> WitnessOutput
  -> H.HalogenM State Action () Output m Unit
persistMutation state entry output = do
  persisted <- H.liftAff (attempt (state.store.putEntry entry))
  case persisted of
    Left err -> H.modify_ _ { running = false, errorMessage = Just (message err) }
    Right _ -> H.modify_ _
      { entries = updateEntry entry state.entries
      , witnessOutput = Just output
      , errorMessage = Nothing
      , running = false
      }

withCurrentSlot
  :: forall m
   . MonadAff m
  => State
  -> (Int -> H.HalogenM State Action () Output m Unit)
  -> H.HalogenM State Action () Output m Unit
withCurrentSlot state continue = do
  currentSlot <- H.liftAff state.fetchCurrentSlot
  case currentSlot of
    Left err -> H.modify_ _ { running = false, errorMessage = Just err }
    Right slot -> continue slot

handleAction
  :: forall m
   . MonadAff m
  => Action
  -> H.HalogenM State Action () Output m Unit
handleAction = case _ of
  Initialize -> do
    state <- H.get
    entries <- H.liftAff state.store.listEntries
    let selected = Array.head entries
    H.modify_ _ { entries = entries, selectedId = map _.entryId selected }
    case selected of
      Nothing -> pure unit
      Just entry -> H.raise (EntrySelected entry)
  Receive input ->
    H.modify_ _
      { store = input.store
      , candidate = input.candidate
      , candidateMessage = input.candidateMessage
      , vaultKeys = input.vaultKeys
      , fetchCurrentSlot = input.fetchCurrentSlot
      }
  AddCurrent -> do
    state <- H.get
    case state.candidate of
      Nothing -> pure unit
      Just entry -> do
        H.liftAff (state.store.putEntry entry)
        H.modify_ _ { entries = replaceEntry entry state.entries, selectedId = Just entry.entryId, errorMessage = Nothing }
        H.raise (EntrySelected entry)
  SelectEntry entryId -> do
    state <- H.get
    case Array.find (\entry -> entry.entryId == entryId) state.entries of
      Nothing -> pure unit
      Just entry -> do
        H.modify_ _ { selectedId = Just entry.entryId, witnessOutput = Nothing, errorMessage = Nothing }
        H.raise (EntrySelected entry)
  SelectVaultKey keyId -> H.modify_ _ { selectedVaultKeyId = Just keyId, errorMessage = Nothing }
  SetPastedWitness value -> H.modify_ _ { pastedWitness = value, errorMessage = Nothing }
  ToggleReplaceCollectedWitness -> H.modify_ \state -> state { replaceCollectedWitness = not state.replaceCollectedWitness, errorMessage = Nothing }
  ProduceWitness -> do
    state <- H.get
    case selectedEntry state, selectedVaultKey state of
      Nothing, _ -> H.modify_ _ { errorMessage = Just "Select a saved transaction before producing a witness." }
      _, Nothing -> H.modify_ _ { errorMessage = Just "Select an unlocked vault signing key before producing a witness." }
      Just entry, Just vaultKey -> do
        H.modify_ _ { running = true, errorMessage = Nothing }
        withCurrentSlot state \currentSlot -> do
          let completeness = deriveCompleteness entry
          prepared <- H.liftAff (prepareWitness entry.entryId (String.trim vaultKey.value))
          case prepared of
            Left err -> H.modify_ _ { running = false, errorMessage = Just err }
            Right detached ->
              if not (Array.elem detached.signerHashHex completeness.missingSigners) then
                H.modify_ _ { running = false, errorMessage = Just "The vault key does not match a missing required signer." }
              else case encodeOutput detached.vkeyWitnessCborHex of
                Left err -> H.modify_ _ { running = false, errorMessage = Just err }
                Right output -> do
                  validated <- H.liftAff (attachWitness entry.unsignedTxCborHex detached "inserted" false)
                  case validated of
                    Left err -> H.modify_ _ { running = false, errorMessage = Just err }
                    Right _ -> case collectWitness currentSlot
                      { replaceExisting: false, signerId: detached.signerHashHex, witnessInput: detached.vkeyWitnessCborHex }
                      entry of
                      Left err -> H.modify_ _ { running = false, errorMessage = Just err }
                      Right updated -> persistMutation state updated output
  AttachPastedWitness -> do
    state <- H.get
    case selectedEntry state of
      Nothing -> H.modify_ _ { errorMessage = Just "Select a saved transaction before attaching a witness." }
      Just entry -> case Witness.decodeWitnessInput state.pastedWitness of
        Left err -> H.modify_ _ { errorMessage = Just err }
        Right rawCborHex -> do
          H.modify_ _ { running = true, errorMessage = Nothing }
          withCurrentSlot state \currentSlot -> case encodeOutput rawCborHex of
            Left err -> H.modify_ _ { running = false, errorMessage = Just err }
            Right output -> do
              validated <- H.liftAff (attachPastedWitness entry.unsignedTxCborHex rawCborHex state.replaceCollectedWitness)
              case validated of
                Left err -> H.modify_ _ { running = false, errorMessage = Just err }
                Right material -> case collectWitness currentSlot
                  { replaceExisting: state.replaceCollectedWitness, signerId: material.signerHashHex, witnessInput: rawCborHex }
                  entry of
                  Left err -> H.modify_ _ { running = false, errorMessage = Just err }
                  Right updated -> persistMutation state updated output

encodeOutput :: String -> Either String WitnessOutput
encodeOutput rawCborHex = do
  textEnvelope <- Witness.encodeWitnessTextEnvelope rawCborHex
  pure { rawCborHex, textEnvelope }

replaceEntry :: TxEntry -> Array TxEntry -> Array TxEntry
replaceEntry replacement entries =
  if Array.any (\entry -> entry.entryId == replacement.entryId) entries then updateEntry replacement entries else Array.snoc entries replacement
