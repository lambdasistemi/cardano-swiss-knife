module Test.BookableIdentifier (runBookableIdentifierTests) where

import Prelude

import Cardano.BookableIdentifier (isBookableIdentifierKind)
import Data.Traversable (traverse_)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runBookableIdentifierTests :: Aff Unit
runBookableIdentifierTests = do
  traverse_ assertBookable [ "address", "key", "script", "script_hash" ]
  traverse_ assertNotBookable [ "", "unknown", "hash", "tx-out-ref", "output", "integer", "raw-bytes" ]

assertBookable :: String -> Aff Unit
assertBookable kind =
  unless (isBookableIdentifierKind kind) do
    liftEffect (throw ("expected bookable identifier kind: " <> kind))

assertNotBookable :: String -> Aff Unit
assertNotBookable kind =
  when (isBookableIdentifierKind kind) do
    liftEffect (throw ("expected non-bookable identifier kind: " <> kind))
