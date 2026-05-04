module Cardano.Mnemonic
  ( generateMnemonic
  , mnemonicToEntropy
  , validateMnemonic
  ) where

import Data.ArrayBuffer.Types (Uint8Array)
import Data.Maybe (Maybe(..))
import Effect (Effect)

foreign import generateMnemonicImpl :: Int -> Effect (Array String)

foreign import validateMnemonicImpl :: Array String -> Boolean

foreign import mnemonicToEntropyImpl
  :: Maybe Uint8Array
  -> (Uint8Array -> Maybe Uint8Array)
  -> Array String
  -> Maybe Uint8Array

generateMnemonic :: Int -> Effect (Array String)
generateMnemonic = generateMnemonicImpl

validateMnemonic :: Array String -> Boolean
validateMnemonic = validateMnemonicImpl

mnemonicToEntropy :: Array String -> Maybe Uint8Array
mnemonicToEntropy = mnemonicToEntropyImpl Nothing Just
