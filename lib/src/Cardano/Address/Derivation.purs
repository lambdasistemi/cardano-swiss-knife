module Cardano.Address.Derivation
  ( Role(..)
  , DerivedKeys
  , derivePipeline
  , roleLabel
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff as Aff
import Effect.Exception as Exception

data Role
  = UTxOExternal
  | UTxOInternal
  | Stake

derive instance eqRole :: Eq Role

type DerivedKeys =
  { rootKeyBech32 :: String
  , accountKeyBech32 :: String
  , addressKeyBech32 :: String
  , addressPublicKeyBech32 :: String
  , stakeKeyBech32 :: String
  , stakePublicKeyBech32 :: String
  }

foreign import derivePipelineImpl
  :: (String -> Either String DerivedKeys)
  -> (DerivedKeys -> Either String DerivedKeys)
  -> String
  -> Int
  -> Int
  -> Int
  -> Effect (Promise (Either String DerivedKeys))

derivePipeline :: Array String -> Int -> Role -> Int -> Aff DerivedKeys
derivePipeline words accountIndex role addressIndex = do
  result <- toAffE (derivePipelineImpl Left Right mnemonic accountIndex (roleIndex role) addressIndex)
  case result of
    Right keys -> pure keys
    Left err -> Aff.throwError (Exception.error err)
  where
  mnemonic = joinWith " " words

roleIndex :: Role -> Int
roleIndex = case _ of
  UTxOExternal -> 0
  UTxOInternal -> 1
  Stake -> 2

roleLabel :: Role -> String
roleLabel = case _ of
  UTxOExternal -> "External"
  UTxOInternal -> "Internal"
  Stake -> "Stake"
