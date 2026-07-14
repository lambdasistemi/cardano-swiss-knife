module Theme
  ( Theme(..)
  , label
  , next
  , initialTheme
  , applyTheme
  , persistTheme
  ) where

import Prelude

import Data.Maybe (Maybe(..))
import Effect (Effect)

data Theme = Light | Dark

derive instance eqTheme :: Eq Theme

label :: Theme -> String
label = case _ of
  Light -> "light"
  Dark -> "dark"

next :: Theme -> Theme
next = case _ of
  Light -> Dark
  Dark -> Light

fromLabel :: String -> Maybe Theme
fromLabel = case _ of
  "light" -> Just Light
  "dark" -> Just Dark
  _ -> Nothing

initialTheme :: Effect Theme
initialTheme = do
  stored <- _getStored
  case fromLabel stored of
    Just theme -> pure theme
    Nothing -> do
      prefersDark <- _prefersDark
      pure (if prefersDark then Dark else Light)

applyTheme :: Theme -> Effect Unit
applyTheme = _setHtmlTheme <<< label

persistTheme :: Theme -> Effect Unit
persistTheme = _setStored <<< label

foreign import _getStored :: Effect String
foreign import _setStored :: String -> Effect Unit
foreign import _prefersDark :: Effect Boolean
foreign import _setHtmlTheme :: String -> Effect Unit
