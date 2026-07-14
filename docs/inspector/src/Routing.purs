module Routing
  ( Route(..)
  , currentRoute
  , currentBasePath
  , routePath
  , pushRoute
  ) where

import Prelude

import Effect (Effect)

data Route
  = RouteInspect
  | RouteSettings
  | RouteLibrary

derive instance eqRoute :: Eq Route

routePath :: Route -> String
routePath = case _ of
  RouteInspect -> "inspect"
  RouteSettings -> "settings"
  RouteLibrary -> "library"

currentRoute :: Effect Route
currentRoute = do
  suffix <- _routeSuffix
  pure case suffix of
    "settings" -> RouteSettings
    "library" -> RouteLibrary
    _ -> RouteInspect

currentBasePath :: Effect String
currentBasePath = _basePath

pushRoute :: String -> Route -> Effect Unit
pushRoute basePath = _pushPath basePath <<< routePath

foreign import _routeSuffix :: Effect String
foreign import _basePath :: Effect String
foreign import _pushPath :: String -> String -> Effect Unit
