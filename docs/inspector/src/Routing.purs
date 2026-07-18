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
  | RouteAddresses
  | RouteKeys
  | RouteScripts
  | RouteVault
  | RouteSettings
  | RouteLibrary
  | RouteManual

derive instance eqRoute :: Eq Route

routePath :: Route -> String
routePath = case _ of
  RouteInspect -> "inspect"
  RouteAddresses -> "addresses"
  RouteKeys -> "keys"
  RouteScripts -> "scripts"
  RouteVault -> "vault"
  RouteSettings -> "settings"
  RouteLibrary -> "library"
  RouteManual -> "manual"

currentRoute :: Effect Route
currentRoute = do
  suffix <- _routeSuffix
  pure case suffix of
    "settings" -> RouteSettings
    "library" -> RouteLibrary
    "addresses" -> RouteAddresses
    "keys" -> RouteKeys
    "scripts" -> RouteScripts
    "vault" -> RouteVault
    "manual" -> RouteManual
    _ -> RouteInspect

currentBasePath :: Effect String
currentBasePath = _basePath

pushRoute :: String -> Route -> Effect Unit
pushRoute basePath = _pushPath basePath <<< routePath

foreign import _routeSuffix :: Effect String
foreign import _basePath :: Effect String
foreign import _pushPath :: String -> String -> Effect Unit
