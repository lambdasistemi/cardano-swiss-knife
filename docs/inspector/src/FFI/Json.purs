module FFI.Json
  ( Breadcrumb
  , Browser
  , BrowserRow
  , Identification
  , IdentificationRow
  , IntentClaim
  , MetadataEntry
  , MetadataMapEntry
  , MetadataValue(..)
  , IntentSummary
  , Inspection
  , Metric
  , MintRow
  , OutputRow
  , RdfGraph
  , ScriptEvaluation
  , ScriptRedeemer
  , Validation
  , WitnessPlan
  , WitnessPlanRow
  , WitnessPlanSection
  , ResolvedInput
  , inspect
  , operationBrowser
  , operationIdentification
  , operationIntentSummary
  , operationInspection
  , operationValidation
  , operationWitnessPlan
  , operationRdfGraph
  , operationScriptEvaluation
  , operationArgsMerged
  , providerResolutionErrorArgs
  , operationArgsWithPath
  , pretty
  ) where

import Prelude

import Cardano.Address.Bech32 as Bech32
import Cardano.Address.Hex as Hex
import Cardano.Bytes as Bytes
import Control.Monad.Except (runExcept)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Foreign (Foreign, isNull, isUndefined, readArray, readString)
import Foreign.Index (readProp)

foreign import prettyImpl :: String -> String
foreign import parseJsonImpl :: forall a. String -> (Foreign -> a) -> a -> a
foreign import inspectImpl :: String -> Inspection
foreign import operationInspectionImpl :: String -> String
foreign import operationBrowserImpl :: String -> Browser
foreign import operationIdentificationImpl :: String -> Identification
foreign import operationValidationImpl :: String -> Validation
foreign import operationWitnessPlanImpl :: String -> WitnessPlan
foreign import operationRdfGraphImpl :: String -> RdfGraph
foreign import operationScriptEvaluationImpl :: String -> ScriptEvaluation
foreign import operationArgsMergedImpl :: String -> String -> String
foreign import providerResolutionErrorArgsImpl :: String -> String -> String
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

type MintRow =
  { policy :: String
  , assets :: String
  }

type Inspection =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , metrics :: Array Metric
  , outputs :: Array OutputRow
  , mint :: Array MintRow
  , inputs :: Array String
  , referenceInputs :: Array String
  , outputNote :: String
  , mintNote :: String
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

type MetadataEntry =
  { label :: String
  , value :: MetadataValue
  }

type MetadataMapEntry =
  { key :: MetadataValue
  , value :: MetadataValue
  }

data MetadataValue
  = MetadataInt String
  | MetadataBytes String
  | MetadataText String
  | MetadataList (Array MetadataValue)
  | MetadataMap (Array MetadataMapEntry)
  | MetadataMalformed

type WitnessPlanRow =
  { label :: String
  , value :: String
  , copyValue :: String
  , path :: String
  , detail :: String
  , identifierCandidates :: Array String
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
  , metadata :: Array MetadataEntry
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
  , resolvedInputs :: Array ResolvedInput
  }

type ResolvedInput =
  { kind :: String
  , key :: String
  , txId :: String
  , outputIndex :: String
  , resolved :: Boolean
  , source :: String
  , reason :: String
  , addressHex :: String
  , coinLovelace :: String
  , assets :: Array { policyId :: String, assetName :: String, quantity :: String }
  }

type Validation =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , status :: String
  , complete :: Boolean
  , validForSuppliedContext :: Boolean
  , contextErrors :: Array String
  , metrics :: Array Metric
  , warnings :: Array String
  , sections :: Array WitnessPlanSection
  }

type ScriptRedeemer =
  { purpose :: String
  , index :: String
  , status :: String
  , declaredExUnits :: String
  , evaluatedExUnits :: String
  , failureCode :: String
  , failureMessage :: String
  , missingContext :: Array String
  }

type ScriptEvaluation =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , status :: String
  , redeemers :: Array ScriptRedeemer
  , missingContext :: Array String
  }

type RdfGraph =
  { valid :: Boolean
  , format :: String
  , turtle :: String
  }

pretty :: String -> String
pretty = prettyImpl

inspect :: String -> Inspection
inspect = inspectImpl

operationInspection :: String -> String
operationInspection = operationInspectionImpl

operationBrowser :: String -> Browser
operationBrowser = operationBrowserImpl

operationIdentification :: String -> Identification
operationIdentification = operationIdentificationImpl

operationIntentSummary :: String -> IntentSummary
operationIntentSummary raw =
  parseJsonImpl raw normalizeIntentRoot
    (invalidIntentSummary "Signing summary" "Ledger operation response was not JSON.")

operationValidation :: String -> Validation
operationValidation = operationValidationImpl

operationWitnessPlan :: String -> WitnessPlan
operationWitnessPlan = operationWitnessPlanImpl

operationRdfGraph :: String -> RdfGraph
operationRdfGraph = operationRdfGraphImpl

operationScriptEvaluation :: String -> ScriptEvaluation
operationScriptEvaluation = operationScriptEvaluationImpl

operationArgsMerged :: String -> String -> String
operationArgsMerged = operationArgsMergedImpl

providerResolutionErrorArgs :: String -> String -> String
providerResolutionErrorArgs = providerResolutionErrorArgsImpl

invalidIntentSummary :: String -> String -> IntentSummary
invalidIntentSummary title subtitle =
  { valid: false
  , title
  , subtitle
  , metrics: []
  , claims: []
  , metadata: []
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
  let
    outputRows = Array.mapWithIndex readIntentOutputRow (intentOutputValues intent)
    sections = map readWitnessSection (arrayField "sections" intent)
    sectionsWithOutputs =
      if Array.null outputRows then sections
      else
        Array.snoc sections
          { title: "Outputs"
          , empty: "No outputs."
          , rows: outputRows
          }
  in
    { valid: true
    , title: stringField "title" "Signing summary" intent
    , subtitle: stringField "subtitle" "" intent
    , metrics: map readMetric (arrayField "metrics" intent)
    , claims: map readIntentClaim (arrayField "claims" intent)
    , metadata: intentMetadataEntries intent
    , sections: sectionsWithOutputs
    , warnings: map readStringDefault (arrayField "warnings" intent)
    }

intentMetadataEntries :: Foreign -> Array MetadataEntry
intentMetadataEntries intent =
  case field "auxiliary_data" intent of
    Just auxiliaryData -> map readMetadataEntry (arrayField "metadata" auxiliaryData)
    Nothing -> []

readMetadataEntry :: Foreign -> MetadataEntry
readMetadataEntry value =
  { label: stringField "label" "" value
  , value: fromMaybe MetadataMalformed (field "value" value <#> readMetadataValue)
  }

readMetadataValue :: Foreign -> MetadataValue
readMetadataValue value =
  case stringField "type" "" value of
    "int" -> MetadataInt (stringField "value" "" value)
    "bytes" -> MetadataBytes (stringField "hex" "" value)
    "text" -> MetadataText (stringField "value" "" value)
    "list" -> MetadataList (map readMetadataValue (arrayField "items" value))
    "map" -> MetadataMap (map readMetadataMapEntry (arrayField "entries" value))
    _ -> MetadataMalformed

readMetadataMapEntry :: Foreign -> MetadataMapEntry
readMetadataMapEntry value =
  { key: fromMaybe MetadataMalformed (field "key" value <#> readMetadataValue)
  , value: fromMaybe MetadataMalformed (field "value" value <#> readMetadataValue)
  }

intentOutputValues :: Foreign -> Array Foreign
intentOutputValues intent =
  case field "value" intent of
    Just value -> arrayField "outputs" value
    Nothing -> []

readIntentOutputRow :: Int -> Foreign -> WitnessPlanRow
readIntentOutputRow index value =
  let
    addressHex = stringField "address_hex" "" value
  in
    { label: "Output #" <> show index
    , value: addressHex
    , copyValue: addressHex
    , path: "[\"intent\",\"value\",\"outputs\",\"#" <> show index <> "\",\"address_hex\"]"
    , detail: stringField "bucket" "" value
    , identifierCandidates: addressIdentifierCandidates addressHex
    }

addressIdentifierCandidates :: String -> Array String
addressIdentifierCandidates addressHex =
  case Hex.fromHex addressHex of
    Right bytes | Bytes.byteLength bytes > 0 ->
      let
        networkTag = mod (Bytes.unsafeIndex bytes 0) 16
        prefix = if networkTag == 1 then "addr" else "addr_test"
      in
        [ addressHex, Bech32.encode prefix bytes ]
    _ ->
      if addressHex == "" then [] else [ addressHex ]

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
  , identifierCandidates: map readStringDefault (arrayField "identifierCandidates" value)
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
