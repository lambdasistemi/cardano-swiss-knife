module Cardano.Address.Wasm
  ( WasmModule
  , loadWasmModule
  , callWasm
  ) where

import Control.Promise (Promise, toAffE)
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff)

foreign import data WasmModule :: Type

foreign import loadWasmModuleImpl
  :: (String -> Either String WasmModule)
  -> (WasmModule -> Either String WasmModule)
  -> String
  -> Effect (Promise (Either String WasmModule))

foreign import callWasmImpl
  :: (String -> Either String String)
  -> (String -> Either String String)
  -> WasmModule
  -> String
  -> Effect (Promise (Either String String))

loadWasmModule :: String -> Aff (Either String WasmModule)
loadWasmModule url = toAffE (loadWasmModuleImpl Left Right url)

callWasm :: WasmModule -> String -> Aff (Either String String)
callWasm mod input = toAffE (callWasmImpl Left Right mod input)
