module TxInspector.Json
  ( Breadcrumb
  , Browser
  , BrowserRow
  , Identification
  , IdentificationRow
  , Inspection
  , IntentClaim
  , IntentSummary
  , Metric
  , OutputRow
  , WitnessPlan
  , WitnessPlanRow
  , WitnessPlanSection
  , inspect
  , operationArgsWithPath
  , operationBrowser
  , operationIdentification
  , operationIntentSummary
  , operationWitnessPlan
  , pretty
  ) where

import Prelude

import Control.Monad.Except (runExcept)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Foreign (Foreign, isNull, isUndefined, readArray, readString)
import Foreign.Index (readProp)

foreign import prettyImpl :: String -> String
foreign import parseJsonImpl :: forall a. String -> (Foreign -> a) -> a -> a
foreign import inspectImpl :: String -> Inspection
foreign import operationBrowserImpl :: String -> Browser
foreign import operationIdentificationImpl :: String -> Identification
foreign import operationWitnessPlanImpl :: String -> WitnessPlan
foreign import operationArgsWithPathImpl :: String -> String -> String

type Metric =
  { label :: String
  , value :: String
  }

type OutputRow =
  { index :: String
  , address :: String
  , coin :: String
  , assets :: String
  , datum :: String
  }

type Inspection =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , metrics :: Array Metric
  , outputs :: Array OutputRow
  , inputs :: Array String
  , referenceInputs :: Array String
  , outputNote :: String
  , inputNote :: String
  }

type Breadcrumb =
  { label :: String
  , path :: String
  }

type BrowserRow =
  { label :: String
  , path :: String
  , kind :: String
  , summary :: String
  , copyValue :: String
  , canDive :: Boolean
  }

type Browser =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , currentPath :: String
  , currentJson :: String
  , breadcrumbs :: Array Breadcrumb
  , rows :: Array BrowserRow
  }

type IdentificationRow =
  { label :: String
  , value :: String
  , copyValue :: String
  , path :: String
  }

type Identification =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , primary :: Array IdentificationRow
  , witnesses :: Array IdentificationRow
  }

type IntentClaim =
  { label :: String
  , value :: String
  , detail :: String
  }

type WitnessPlanRow =
  { label :: String
  , value :: String
  , copyValue :: String
  , path :: String
  , detail :: String
  }

type WitnessPlanSection =
  { title :: String
  , empty :: String
  , rows :: Array WitnessPlanRow
  }

type IntentSummary =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , metrics :: Array Metric
  , claims :: Array IntentClaim
  , sections :: Array WitnessPlanSection
  , warnings :: Array String
  }

type WitnessPlan =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , metrics :: Array Metric
  , warnings :: Array String
  , sections :: Array WitnessPlanSection
  }

pretty :: String -> String
pretty = prettyImpl

inspect :: String -> Inspection
inspect = inspectImpl

operationBrowser :: String -> Browser
operationBrowser = operationBrowserImpl

operationIdentification :: String -> Identification
operationIdentification = operationIdentificationImpl

operationIntentSummary :: String -> IntentSummary
operationIntentSummary raw =
  parseJsonImpl raw normalizeIntentRoot
    (invalidIntentSummary "Signing summary" "Ledger operation response was not JSON.")

operationWitnessPlan :: String -> WitnessPlan
operationWitnessPlan = operationWitnessPlanImpl

invalidIntentSummary :: String -> String -> IntentSummary
invalidIntentSummary title subtitle =
  { valid: false
  , title
  , subtitle
  , metrics: []
  , claims: []
  , sections: []
  , warnings: []
  }

normalizeIntentRoot :: Foreign -> IntentSummary
normalizeIntentRoot root =
  case field "intent" (operationResultValue root) of
    Just intent -> readIntentSummary intent
    Nothing ->
      invalidIntentSummary "Signing summary" "Ledger operation response missing intent."

operationResultValue :: Foreign -> Foreign
operationResultValue root =
  fromMaybe root (field "result" root)

readIntentSummary :: Foreign -> IntentSummary
readIntentSummary intent =
  { valid: true
  , title: stringField "title" "Signing summary" intent
  , subtitle: stringField "subtitle" "" intent
  , metrics: map readMetric (arrayField "metrics" intent)
  , claims: map readIntentClaim (arrayField "claims" intent)
  , sections: map readWitnessSection (arrayField "sections" intent)
  , warnings: map readStringDefault (arrayField "warnings" intent)
  }

readMetric :: Foreign -> Metric
readMetric value =
  { label: stringField "label" "" value
  , value: stringField "value" "" value
  }

readIntentClaim :: Foreign -> IntentClaim
readIntentClaim value =
  { label: stringField "label" "" value
  , value: stringField "value" "" value
  , detail: stringField "detail" "" value
  }

readWitnessSection :: Foreign -> WitnessPlanSection
readWitnessSection value =
  { title: stringField "title" "" value
  , empty: stringField "empty" "" value
  , rows: map readWitnessRow (arrayField "rows" value)
  }

readWitnessRow :: Foreign -> WitnessPlanRow
readWitnessRow value =
  { label: stringField "label" "" value
  , value: stringField "value" "" value
  , copyValue: stringField "copyValue" "" value
  , path: stringField "path" "" value
  , detail: stringField "detail" "" value
  }

stringField :: String -> String -> Foreign -> String
stringField key fallback value =
  fromMaybe fallback (field key value >>= readStringMaybe)

arrayField :: String -> Foreign -> Array Foreign
arrayField key value =
  fromMaybe [] (field key value >>= readArrayMaybe)

field :: String -> Foreign -> Maybe Foreign
field key value =
  case runExcept (readProp key value) of
    Right child ->
      if isNull child || isUndefined child then Nothing else Just child
    Left _ -> Nothing

readStringMaybe :: Foreign -> Maybe String
readStringMaybe value =
  case runExcept (readString value) of
    Right string -> Just string
    Left _ -> Nothing

readStringDefault :: Foreign -> String
readStringDefault =
  fromMaybe "" <<< readStringMaybe

readArrayMaybe :: Foreign -> Maybe (Array Foreign)
readArrayMaybe value =
  case runExcept (readArray value) of
    Right values -> Just values
    Left _ -> Nothing

operationArgsWithPath :: String -> String -> String
operationArgsWithPath = operationArgsWithPathImpl
