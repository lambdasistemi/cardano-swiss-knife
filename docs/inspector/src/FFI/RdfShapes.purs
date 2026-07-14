module FFI.RdfShapes
  ( Json
  , DecodedTreeRow
  , ResolvedLabelRow
  , ShaclReport
  , ShaclViolation
  , TypedFieldRow
  , TransactionOutputRow
  , query
  , queryDecodedTree
  , queryResolvedLabels
  , queryTypedFields
  , queryTransactionOutputs
  , validate
  ) where

import Data.Either (Either(..))
import Effect (Effect)
import Foreign (Foreign)

type Json = Foreign

type DecodedTreeRow =
  { id :: String
  , parentId :: String
  , depth :: Int
  , order :: Int
  , label :: String
  , kind :: String
  , value :: String
  , summary :: String
  , raw :: String
  , entityIri :: String
  , resolvedLabel :: String
  , resolvedType :: String
  , annotationPredicate :: String
  , annotationValue :: String
  }

type TransactionOutputRow =
  { transaction :: String
  , txId :: String
  , outputs :: String
  }

type ResolvedLabelRow =
  { label :: String
  , role :: String
  , entity :: String
  , matched :: String
  }

type TypedFieldRow =
  { subject :: String
  , field :: String
  , value :: String
  }

type ShaclViolation =
  { focusNode :: String
  , path :: String
  , value :: String
  , sourceShape :: String
  , sourceConstraintComponent :: String
  , message :: String
  , severity :: String
  }

type ShaclReport =
  { conforms :: Boolean
  , violations :: Array ShaclViolation
  }

foreign import queryImpl
  :: (String -> Either String Json)
  -> (Json -> Either String Json)
  -> String
  -> String
  -> Effect (Either String Json)

foreign import queryTransactionOutputsImpl
  :: (String -> Either String (Array TransactionOutputRow))
  -> (Array TransactionOutputRow -> Either String (Array TransactionOutputRow))
  -> String
  -> Effect (Either String (Array TransactionOutputRow))

foreign import queryResolvedLabelsImpl
  :: (String -> Either String (Array ResolvedLabelRow))
  -> (Array ResolvedLabelRow -> Either String (Array ResolvedLabelRow))
  -> String
  -> Effect (Either String (Array ResolvedLabelRow))

foreign import queryTypedFieldsImpl
  :: (String -> Either String (Array TypedFieldRow))
  -> (Array TypedFieldRow -> Either String (Array TypedFieldRow))
  -> String
  -> Effect (Either String (Array TypedFieldRow))

foreign import queryDecodedTreeImpl
  :: (String -> Either String (Array DecodedTreeRow))
  -> (Array DecodedTreeRow -> Either String (Array DecodedTreeRow))
  -> String
  -> Effect (Either String (Array DecodedTreeRow))

foreign import validateImpl
  :: (String -> Either String ShaclReport)
  -> (ShaclReport -> Either String ShaclReport)
  -> String
  -> String
  -> Effect (Either String ShaclReport)

query :: String -> String -> Effect (Either String Json)
query = queryImpl Left Right

queryTransactionOutputs :: String -> Effect (Either String (Array TransactionOutputRow))
queryTransactionOutputs = queryTransactionOutputsImpl Left Right

queryResolvedLabels :: String -> Effect (Either String (Array ResolvedLabelRow))
queryResolvedLabels = queryResolvedLabelsImpl Left Right

queryTypedFields :: String -> Effect (Either String (Array TypedFieldRow))
queryTypedFields = queryTypedFieldsImpl Left Right

queryDecodedTree :: String -> Effect (Either String (Array DecodedTreeRow))
queryDecodedTree = queryDecodedTreeImpl Left Right

validate :: String -> String -> Effect (Either String ShaclReport)
validate = validateImpl Left Right
