module Cardano.BookableIdentifier (isBookableIdentifierKind) where

isBookableIdentifierKind :: String -> Boolean
isBookableIdentifierKind = case _ of
  "address" -> true
  "key" -> true
  "script" -> true
  "script_hash" -> true
  _ -> false
