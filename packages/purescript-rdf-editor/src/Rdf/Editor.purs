module Rdf.Editor
  ( Element
  , Handle
  , Mode(..)
  , MountOptions
  , ValidationResult
  , dispose
  , getValue
  , mount
  , onChange
  , setMode
  , setValue
  , validate
  ) where

import Prelude

import Effect (Effect)

foreign import data Element :: Type
foreign import data Handle :: Type

data Mode = Turtle | Json

type MountOptions =
  { value :: String
  , mode :: Mode
  }

type ValidationResult =
  { ok :: Boolean
  , message :: String
  }

type RawMountOptions =
  { value :: String
  , mode :: String
  }

mount :: Element -> MountOptions -> Effect Handle
mount element opts =
  mountImpl element
    { value: opts.value
    , mode: modeName opts.mode
    }

setMode :: Handle -> Mode -> Effect Unit
setMode handle mode =
  setModeImpl handle (modeName mode)

modeName :: Mode -> String
modeName = case _ of
  Turtle -> "Turtle"
  Json -> "Json"

foreign import mountImpl :: Element -> RawMountOptions -> Effect Handle
foreign import getValue :: Handle -> Effect String
foreign import setValue :: Handle -> String -> Effect Unit
foreign import onChange :: Handle -> (String -> Effect Unit) -> Effect (Effect Unit)
foreign import setModeImpl :: Handle -> String -> Effect Unit
foreign import validate :: Handle -> Effect ValidationResult
foreign import dispose :: Handle -> Effect Unit
