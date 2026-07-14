module FFI.Storage
  ( downloadJson
  , fetchText
  , getItem
  , readFileInputText
  , setItem
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import downloadJsonImpl :: String -> String -> Effect Unit
foreign import fetchTextImpl :: String -> Effect (Promise String)
foreign import getItemImpl :: String -> Effect String
foreign import readFileInputTextImpl :: String -> Effect (Promise String)
foreign import setItemImpl :: String -> String -> Effect Unit

downloadJson :: String -> String -> Effect Unit
downloadJson = downloadJsonImpl

fetchText :: String -> Aff String
fetchText = toAffE <<< fetchTextImpl

getItem :: String -> Effect String
getItem = getItemImpl

readFileInputText :: String -> Aff String
readFileInputText = toAffE <<< readFileInputTextImpl

setItem :: String -> String -> Effect Unit
setItem = setItemImpl
