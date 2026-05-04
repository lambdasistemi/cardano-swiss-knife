module Cardano.Address.Script
  ( ValidationIssue
  , ScriptAnalysis
  , ScriptTemplateAnalysis
  , analyzeNativeScript
  , analyzeNativeScriptHex
  , analyzeNativeScriptJson
  , analyzeScriptTemplateJson
  ) where

import Prelude

import Cardano.Address.ScriptHash as ScriptHash
import Cardano.Address.Hex as Hex
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))

type ValidationIssue =
  { level :: String
  , code :: String
  , message :: String
  }

type ScriptValidationCore =
  { canonicalBytes :: Uint8Array
  , canonicalJson :: String
  , scriptType :: String
  , validationStatus :: String
  , issues :: Array ValidationIssue
  }

type ScriptAnalysis =
  { canonicalCborHex :: String
  , canonicalJson :: String
  , scriptType :: String
  , validationStatus :: String
  , issues :: Array ValidationIssue
  , hashHex :: String
  , hashBech32 :: String
  }

type ScriptTemplateAnalysis =
  { canonicalTemplateJson :: String
  , templateValidationStatus :: String
  , templateIssues :: Array ValidationIssue
  , hasDerivedScript :: Boolean
  , derivedScript :: ScriptAnalysis
  }

foreign import analyzeNativeScriptImpl
  :: forall r
   . (String -> r)
  -> (ScriptValidationCore -> r)
  -> Uint8Array
  -> r

foreign import analyzeNativeScriptJsonImpl
  :: forall r
   . (String -> r)
  -> (ScriptValidationCore -> r)
  -> String
  -> r

foreign import analyzeScriptTemplateJsonImpl
  :: forall r
   . (String -> r)
  -> (ScriptTemplateAnalysis -> r)
  -> String
  -> r

analysisFromCore :: ScriptValidationCore -> ScriptAnalysis
analysisFromCore validation =
  let
    hash = ScriptHash.hashNativeScript validation.canonicalBytes
  in
    { canonicalCborHex: Hex.toHex validation.canonicalBytes
    , canonicalJson: validation.canonicalJson
    , scriptType: validation.scriptType
    , validationStatus: validation.validationStatus
    , issues: validation.issues
    , hashHex: hash.hashHex
    , hashBech32: hash.hashBech32
    }

analyzeNativeScript :: Uint8Array -> Either String ScriptAnalysis
analyzeNativeScript bytes =
  analysisFromCore <$> analyzeNativeScriptImpl Left Right bytes

analyzeNativeScriptHex :: String -> Either String ScriptAnalysis
analyzeNativeScriptHex value = do
  bytes <- Hex.fromHex value
  analyzeNativeScript bytes

analyzeNativeScriptJson :: String -> Either String ScriptAnalysis
analyzeNativeScriptJson =
  map analysisFromCore <<< analyzeNativeScriptJsonImpl Left Right

analyzeScriptTemplateJson :: String -> Either String ScriptTemplateAnalysis
analyzeScriptTemplateJson =
  analyzeScriptTemplateJsonImpl Left Right
