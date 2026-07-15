module Shell
  ( topbar
  , siteFooter
  , placeholderPage
  , initialTheme
  , toggleThemeEff
  , themeLabel
  ) where

import Prelude

import Data.Maybe (Maybe(..))
import Data.String (Pattern(..))
import Data.String.CodeUnits as StringCodeUnits
import Effect (Effect)
import Halogen.HTML as HH
import Halogen.HTML.Events as HE
import Halogen.HTML.Properties as HP
import Web.UIEvent.MouseEvent (MouseEvent)

import Routing (Route(..), routePath)
import Theme as Theme

topbar
  :: forall w i
   . Route
  -> { themeLabel :: String
     , basePath :: String
     , onToggleTheme :: i
     , onNavigate :: Route -> MouseEvent -> i
     }
  -> HH.HTML w i
topbar active opts =
  HH.header
    [ classNames [ "site-header" ] ]
    [ HH.div
        [ classNames [ "page-frame", "topbar" ] ]
        [ HH.div
            [ classNames [ "brand" ] ]
            [ HH.strong_ [ HH.text "Ledger Inspector" ]
            , HH.span_ [ HH.text "Cardano transaction inspector" ]
            ]
        , HH.nav
            [ classNames [ "topbar-nav" ]
            , HH.attr (HH.AttrName "aria-label") "Primary"
            ]
            [ navLink opts.basePath RouteInspect active "Inspect" opts.onNavigate
            , navLink opts.basePath RouteAddresses active "Addresses" opts.onNavigate
            , navLink opts.basePath RouteScripts active "Scripts" opts.onNavigate
            , navLink opts.basePath RouteLibrary active "Library" opts.onNavigate
            , navLink opts.basePath RouteSettings active "Settings" opts.onNavigate
            ]
        , HH.element (HH.ElemName "md-icon-button")
            [ classNames [ "topbar-theme" ]
            , HH.attr (HH.AttrName "role") "button"
            , HH.attr (HH.AttrName "aria-label") "Toggle theme"
            , HP.title ("Switch to " <> opts.themeLabel <> " theme")
            , HE.onClick (\_ -> opts.onToggleTheme)
            ]
            [ HH.element (HH.ElemName "md-icon") []
                [ HH.text
                    ( if opts.themeLabel == "Dark" then
                        "dark_mode"
                      else
                        "light_mode"
                    )
                ]
            , HH.span
                [ classNames [ "visually-hidden" ] ]
                [ HH.text opts.themeLabel ]
            ]
        ]
    ]

navLink
  :: forall w i
   . String
  -> Route
  -> Route
  -> String
  -> (Route -> MouseEvent -> i)
  -> HH.HTML w i
navLink basePath target active label onNavigate =
  HH.a
    ( [ HP.href (routeHref basePath target)
      , classNames [ "topbar-nav-link" ]
      , HE.onClick (onNavigate target)
      ]
        <> if target == active then
          [ HH.attr (HH.AttrName "aria-current") "page" ]
        else []
    )
    [ HH.text label ]

routeHref :: String -> Route -> String
routeHref basePath route =
  normalizedBase <> routePath route
  where
  normalizedBase =
    case StringCodeUnits.stripSuffix (Pattern "/") basePath of
      Just _ -> basePath
      Nothing -> basePath <> "/"

siteFooter :: forall w i. HH.HTML w i
siteFooter =
  HH.footer
    [ classNames [ "page-frame", "site-footer" ] ]
    [ HH.div
        [ classNames [ "site-footer-links" ] ]
        [ extLink "https://lambdasistemi.github.io/cardano-ledger-inspector/" "Docs"
        , extLink "https://github.com/lambdasistemi/cardano-ledger-inspector" "Source"
        ]
    , HH.div_
        [ HH.text "Browser-based Cardano transaction inspection with explicit chain-data context." ]
    ]
  where
  extLink href label =
    HH.a
      [ HP.href href
      , HP.target "_blank"
      , HP.rel "noopener noreferrer"
      ]
      [ HH.text label ]

placeholderPage :: forall w i. String -> HH.HTML w i
placeholderPage title =
  HH.section
    [ classNames [ "panel", "placeholder-page" ] ]
    [ HH.div
        [ classNames [ "panel-heading" ] ]
        [ HH.h1_ [ HH.text title ] ]
    , HH.div
        [ classNames [ "empty-state" ] ]
        [ HH.text (title <> " placeholder") ]
    ]

initialTheme :: Effect Theme.Theme
initialTheme = do
  theme <- Theme.initialTheme
  Theme.applyTheme theme
  pure theme

toggleThemeEff :: Theme.Theme -> Effect Theme.Theme
toggleThemeEff theme = do
  let nextTheme = Theme.next theme
  Theme.applyTheme nextTheme
  Theme.persistTheme nextTheme
  pure nextTheme

themeLabel :: Theme.Theme -> String
themeLabel = case _ of
  Theme.Light -> "Dark"
  Theme.Dark -> "Light"

classNames :: forall r a. Array String -> HP.IProp (class :: String | r) a
classNames names = HP.classes (map HH.ClassName names)
