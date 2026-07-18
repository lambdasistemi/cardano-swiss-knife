module Version (versionLabel) where

import Prelude

import Data.String.CodeUnits as StringCodeUnits

foreign import versionTag :: String

-- Dev bundles keep the placeholder unsubstituted. Detect it by the leading
-- underscores — never write the placeholder literal a second time, or the
-- build-time sed would rewrite the comparison too and break dev detection.
versionLabel :: String
versionLabel =
  if StringCodeUnits.take 2 versionTag == "__" then "dev"
  else "v" <> versionTag
