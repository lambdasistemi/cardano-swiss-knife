module FFI.Json
  ( Breadcrumb
  , Browser
  , BrowserRow
  , Identification
  , IdentificationRow
  , MetadataEntry
  , MetadataMapEntry
  , MetadataValue(..)
  , Inspection
  , EntrySeed
  , Metric
  , MintRow
  , OutputRow
  , RdfGraph
  , ReviewAdditionalField
  , ReviewAsset
  , ReviewClaim
  , ReviewControlGroup
  , ReviewSource
  , ScriptEvaluation
  , ScriptRedeemer
  , TransactionReview
  , Validation
  , WitnessPlan
  , WitnessPlanRow
  , WitnessPlanSection
  , ResolvedInput
  , inspect
  , operationBrowser
  , operationIdentification
  , operationIntentMetadata
  , operationInspection
  , operationTransactionReview
  , operationValidation
  , operationWitnessPlan
  , operationRdfGraph
  , operationScriptEvaluation
  , operationEntrySeed
  , operationArgsMerged
  , providerResolutionErrorArgs
  , operationArgsWithPath
  , pretty
  ) where

import Prelude

import Control.Monad.Except (runExcept)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
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
foreign import operationTransactionReviewImpl :: String -> TransactionReview
foreign import operationEntrySeedImpl :: String -> String -> String -> Nullable EntrySeed
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

type EntrySeed =
  { entryId :: String
  , requiredSigners :: Array String
  , invalidAfterSlot :: Int
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

type ReviewAsset =
  { policyId :: String
  , assetName :: String
  , quantity :: String
  }

type ReviewControlGroup =
  { category :: String
  , role :: String
  , roleProvenance :: String
  , evidence :: Array String
  , lovelace :: String
  , assetClassCount :: String
  , outputCount :: String
  , outputIndices :: Array String
  , addresses :: Array String
  , assets :: Array ReviewAsset
  }

type ReviewClaim =
  { label :: String
  , value :: String
  , detail :: String
  , selfDeclared :: Boolean
  }

type ReviewSource =
  { kind :: String
  , count :: String
  , resolvedCount :: String
  , missingCount :: String
  , resolvedLovelace :: String
  , lovelace :: String
  , conditional :: String
  , inputCount :: String
  , bodyTotalLovelace :: String
  , returnLovelace :: String
  , readOnly :: String
  }

type ReviewAdditionalField =
  { key :: String
  , value :: String
  }

type TransactionReview =
  { valid :: Boolean
  , title :: String
  , subtitle :: String
  , version :: String
  , txId :: String
  , bodyHash :: String
  , feeLovelace :: String
  , inputStatus :: String
  , regularInputCount :: String
  , resolvedRegularInputCount :: String
  , missingRegularInputCount :: String
  , netSignerValueProvable :: Boolean
  , netSignerValueLovelace :: String
  , netSignerValueNote :: String
  , warnings :: Array String
  , controlGroups :: Array ReviewControlGroup
  , highValueMovements :: Array ReviewControlGroup
  , claims :: Array ReviewClaim
  , collateralConditional :: Boolean
  , collateralInputCount :: String
  , collateralBodyTotalLovelace :: String
  , collateralReturnLovelace :: String
  , sources :: Array ReviewSource
  , additionalFields :: Array ReviewAdditionalField
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

operationTransactionReview :: String -> TransactionReview
operationTransactionReview = operationTransactionReviewImpl

operationIntentMetadata :: String -> Array MetadataEntry
operationIntentMetadata raw =
  parseJsonImpl raw normalizeIntentMetadataRoot []

operationValidation :: String -> Validation
operationValidation = operationValidationImpl

operationWitnessPlan :: String -> WitnessPlan
operationWitnessPlan = operationWitnessPlanImpl

operationRdfGraph :: String -> RdfGraph
operationRdfGraph = operationRdfGraphImpl

operationScriptEvaluation :: String -> ScriptEvaluation
operationScriptEvaluation = operationScriptEvaluationImpl

operationEntrySeed :: String -> String -> String -> Maybe EntrySeed
operationEntrySeed inspectionRaw identificationRaw witnessPlanRaw =
  toMaybe (operationEntrySeedImpl inspectionRaw identificationRaw witnessPlanRaw)

operationArgsMerged :: String -> String -> String
operationArgsMerged = operationArgsMergedImpl

providerResolutionErrorArgs :: String -> String -> String
providerResolutionErrorArgs = providerResolutionErrorArgsImpl

normalizeIntentMetadataRoot :: Foreign -> Array MetadataEntry
normalizeIntentMetadataRoot root =
  case field "intent" (operationResultValue root) of
    Just intent -> intentMetadataEntries intent
    Nothing -> []

operationResultValue :: Foreign -> Foreign
operationResultValue root =
  fromMaybe root (field "result" root)

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
