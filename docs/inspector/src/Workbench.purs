module Workbench
  ( Input
  , Output(..)
  , component
  ) where

import Prelude

import Cardano.Transaction.Entry (EntryStatus(..), TxEntry, deriveCompleteness)
import Cardano.Transaction.Entry.Ports (EntryStore)
import Data.Array as Array
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)
import Effect.Aff.Class (class MonadAff)
import Halogen as H
import Halogen.HTML as HH
import Halogen.HTML.Events as HE
import Halogen.HTML.Properties as HP

type Input =
  { store :: EntryStore Aff
  , candidate :: Maybe TxEntry
  , candidateMessage :: Maybe String
  }

data Output = EntrySelected TxEntry

type State =
  { store :: EntryStore Aff
  , entries :: Array TxEntry
  , selectedId :: Maybe String
  , candidate :: Maybe TxEntry
  , candidateMessage :: Maybe String
  }

data Action
  = Initialize
  | Receive Input
  | AddCurrent
  | SelectEntry String

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
            , HH.p_ [ HH.text "Save decoded transactions and switch the inspector between durable entries." ]
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
        Just message -> HH.p [ HP.classes [ HH.ClassName "workbench-explanation" ] ] [ HH.text message ]
    , HH.div
        [ HH.attr (HH.AttrName "role") "list"
        , HH.attr (HH.AttrName "aria-label") "Saved transactions"
        , HP.classes [ HH.ClassName "workbench-list" ]
        ]
        (if Array.null state.entries then
          [ HH.p_ [ HH.text "No saved transactions yet." ] ]
        else map (renderEntry state.selectedId) state.entries)
    , case selectedEntry state of
        Nothing -> HH.p_ [ HH.text "Select or add a transaction to see its signer completeness." ]
        Just entry -> renderCompleteness entry
    ]

renderEntry :: forall m. Maybe String -> TxEntry -> H.ComponentHTML Action () m
renderEntry selectedId entry =
  HH.div
    [ HH.attr (HH.AttrName "role") "listitem" ]
    [ HH.button
        [ HH.attr (HH.AttrName "type") "button"
        , HH.attr (HH.AttrName "aria-label") ("Select " <> entry.entryId)
        , HH.attr (HH.AttrName "aria-pressed") (if selectedId == Just entry.entryId then "true" else "false")
        , HE.onClick (\_ -> SelectEntry entry.entryId)
        ]
        [ HH.span_ [ HH.text entry.entryId ]
        , HH.span [ HP.classes [ HH.ClassName "workbench-entry-status" ] ] [ HH.text (statusLabel entry.status) ]
        ]
    ]

statusLabel :: EntryStatus -> String
statusLabel = case _ of
  Open -> "Open"
  Complete -> "Complete"
  Expired -> "Expired"
  Submitted -> "Submitted"

renderCompleteness :: forall m. TxEntry -> H.ComponentHTML Action () m
renderCompleteness entry =
  let completeness = deriveCompleteness entry
  in HH.div [ HP.classes [ HH.ClassName "workbench-completeness" ] ]
      [ HH.h3_ [ HH.text (if completeness.isComplete then "Complete" else "Incomplete") ]
      , signerGroup "Required signers" "None required." completeness.requiredSigners
      , signerGroup "Satisfied signers" "None satisfied." completeness.satisfiedSigners
      , signerGroup "Missing signers" "None missing." completeness.missingSigners
      ]

signerGroup :: forall m. String -> String -> Array String -> H.ComponentHTML Action () m
signerGroup title empty signers =
  HH.div [ HP.classes [ HH.ClassName "workbench-signer-group" ] ]
    [ HH.h4_ [ HH.text title ]
    , if Array.null signers then
        HH.p_ [ HH.text empty ]
      else
        HH.ul_ (map (\signer -> HH.li_ [ HH.text signer ]) signers)
    ]

selectedEntry :: State -> Maybe TxEntry
selectedEntry state = do
  entryId <- state.selectedId
  Array.find (\entry -> entry.entryId == entryId) state.entries

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
    H.modify_ _
      { entries = entries
      , selectedId = map _.entryId selected
      }
    case selected of
      Nothing -> pure unit
      Just entry -> H.raise (EntrySelected entry)
  Receive input ->
    H.modify_ _
      { store = input.store
      , candidate = input.candidate
      , candidateMessage = input.candidateMessage
      }
  AddCurrent -> do
    state <- H.get
    case state.candidate of
      Nothing -> pure unit
      Just entry -> do
        H.liftAff (state.store.putEntry entry)
        H.modify_ _
          { entries = replaceEntry entry state.entries
          , selectedId = Just entry.entryId
          }
        H.raise (EntrySelected entry)
  SelectEntry entryId -> do
    state <- H.get
    case Array.find (\entry -> entry.entryId == entryId) state.entries of
      Nothing -> pure unit
      Just entry -> do
        H.modify_ _ { selectedId = Just entry.entryId }
        H.raise (EntrySelected entry)

replaceEntry :: TxEntry -> Array TxEntry -> Array TxEntry
replaceEntry replacement entries =
  if Array.any (\entry -> entry.entryId == replacement.entryId) entries then
    map (\entry -> if entry.entryId == replacement.entryId then replacement else entry) entries
  else
    Array.snoc entries replacement
