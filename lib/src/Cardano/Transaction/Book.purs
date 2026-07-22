module Cardano.Transaction.Book
  ( Book
  , BookInput(..)
  , BookPart
  , ImportDocument
  , ImportedBook
  , blueprintArgs
  , bundledAmaruJournal
  , bundledCardanoShaclShapes
  , bundledSundaeSwapBlueprint
  , classifyBookInput
  , importBooks
  , importBooksWithSources
  , parseBook
  ) where

import Prelude

import Data.Argonaut.Core (Json, stringify, toArray, toObject, toString)
import Data.Argonaut.Core as Json
import Data.Argonaut.Parser (jsonParser)
import Data.Array as Array
import Data.Char (toCharCode)
import Data.Either (Either(..))
import Data.Int (base36, toStringAs)
import Data.Int.Bits ((.&.), (.|.), (.^.), shl, zshr)
import Data.Maybe (Maybe(..), fromMaybe, isJust, maybe)
import Data.String.CodeUnits as CodeUnits
import Data.String.Common as String
import Data.String.Pattern (Pattern(..), Replacement(..))
import Foreign.Object as Object

type BookPart =
  { id :: String
  , label :: String
  , kind :: String
  , turtle :: String
  , plutusJson :: String
  }

type Book =
  { title :: String
  , source :: String
  , parts :: Array BookPart
  , turtle :: String
  , notice :: String
  }

type ImportedBook =
  { source :: String
  , turtle :: String
  , parts :: Array BookPart
  }

type ImportDocument = { input :: String, source :: String }

data BookInput
  = PastedTurtle String
  | ShaclTurtle String
  | Cip57Blueprint { raw :: String, value :: Json }
  | AmaruJournal Json
  | BookStore Json

foreign import bundledAmaruJournal :: String
foreign import bundledCardanoShaclShapes :: String
foreign import bundledSundaeSwapBlueprint :: String

prefixes :: String
prefixes = "@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix overlay: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#> .\n"

vocab :: String
vocab = "overlay:OverlayPart\n  a rdfs:Class ;\n  rdfs:label \"Overlay part\" .\n\noverlay:Treasury\n  a rdfs:Class ;\n  rdfs:label \"Budget treasury\" .\n\noverlay:Address\n  a rdfs:Class ;\n  rdfs:label \"Cardano address\" .\n\noverlay:CardanoScript\n  a rdfs:Class ;\n  rdfs:label \"Cardano script\" .\n\noverlay:Owner\n  a rdfs:Class ;\n  rdfs:label \"Owner key\" .\n\noverlay:ScopeOwners\n  a rdfs:Class ;\n  rdfs:label \"Scope owners reference\" .\n\noverlay:slug a rdf:Property ; rdfs:label \"Slug\" .\noverlay:budgetAda a rdf:Property ; rdfs:label \"Budget in ADA\" .\noverlay:address a rdf:Property ; rdfs:label \"Treasury address\" .\noverlay:owner a rdf:Property ; rdfs:label \"Treasury owner\" .\noverlay:scopeOwners a rdf:Property ; rdfs:label \"Scope owners\" .\noverlay:treasuryScript a rdf:Property ; rdfs:label \"Treasury script\" .\noverlay:permissionsScript a rdf:Property ; rdfs:label \"Permissions script\" .\noverlay:registryScript a rdf:Property ; rdfs:label \"Registry script\" .\noverlay:scriptRole a rdf:Property ; rdfs:label \"Script role\" .\n"

classifyBookInput :: String -> Either String BookInput
classifyBookInput input =
  let raw = String.trim input
  in if raw == "" then Left "overlay input is empty"
  else if CodeUnits.take 1 raw == "{" then do
    value <- jsonParser raw
    object <- maybeLeft "unrecognized JSON shape." (toObject value)
    case Object.lookup "kind" object of
      Just kind -> case toString kind of
        Just "cardano-ledger-inspector.books.v1" -> Right (BookStore value)
        _ -> Left ("unsupported JSON kind: " <> jsonText kind <> ".")
      Nothing | isBlueprint value -> Right (Cip57Blueprint { raw, value })
      Nothing | isAmaru value -> Right (AmaruJournal value)
      Nothing -> Left "unrecognized JSON shape."
  else if isShaclTurtle raw then Right (ShaclTurtle raw)
  else Right (PastedTurtle raw)

parseBook :: String -> Either String Book
parseBook input = classifyBookInput input >>= renderBook

renderBook :: BookInput -> Either String Book
renderBook = case _ of
  PastedTurtle raw -> Right (pastedTurtleBook raw)
  ShaclTurtle raw -> Right (shaclTurtleBook raw)
  Cip57Blueprint blueprint -> Right (blueprintBook blueprint)
  AmaruJournal journal -> amaruBook journal
  BookStore _ -> Left "book stores must be imported as documents"

importBooks :: Array String -> Either String (Array ImportedBook)
importBooks = importBooksWithSources <<< map (\input -> { input, source: "turtle" })

importBooksWithSources :: Array ImportDocument -> Either String (Array ImportedBook)
importBooksWithSources = Array.foldl (\acc document -> acc >>= \books -> map (\newBooks -> books <> newBooks) (importDocument document)) (Right [])

importDocument :: ImportDocument -> Either String (Array ImportedBook)
importDocument document = do
  input <- classifyBookInput document.input
  case input of
    BookStore store -> importStore store
    _ -> do
      book <- renderBook input
      pure [ { source: if document.source == "" then book.source else document.source, turtle: book.turtle, parts: book.parts } ]

importStore :: Json -> Either String (Array ImportedBook)
importStore value = do
  object <- maybeLeft "book store is not an object" (toObject value)
  booksValue <- maybeLeft "book store books is not an array" (Object.lookup "books" object >>= toArray)
  pure $ booksValue # Array.mapMaybe selectedBook
  where
  selectedBook entry = do
    object <- toObject entry
    selected <- Object.lookup "selected" object >>= Json.toBoolean
    if selected then
      Just
        { source: "cardano-ledger-inspector.books.v1"
        , turtle: textValue (Object.lookup "turtle" object)
        , parts: []
        }
    else Nothing

pastedTurtleBook :: String -> Book
pastedTurtleBook raw =
  let turtle = normalizedTurtle raw
      part = { id: "pasted-turtle-" <> hashText turtle, label: "Pasted Turtle", kind: "overlay", turtle, plutusJson: "" }
  in { title: "Pasted overlay Turtle", source: "paste", parts: [ part ], turtle, notice: "" }

shaclTurtleBook :: String -> Book
shaclTurtleBook raw =
  let turtle = normalizedTurtle raw
      bundled = String.trim turtle == String.trim bundledCardanoShaclShapes
      part =
        { id: if bundled then "cardano-rdf-shacl-shapes" else "pasted-shacl-" <> hashText turtle
        , label: if bundled then "Cardano transaction SHACL shapes" else "Pasted SHACL shapes"
        , kind: "shacl"
        , turtle
        , plutusJson: ""
        }
  in
    { title: if bundled then "Cardano RDF SHACL shapes" else "Pasted SHACL shapes"
    , source: if bundled then "docs/inspector/protocols/cardano-rdf/shapes.ttl" else "paste"
    , parts: [ part ]
    , turtle
    , notice: ""
    }

blueprintBook :: { raw :: String, value :: Json } -> Book
blueprintBook { raw, value } =
  let title = textValue (valueObject value >>= Object.lookup "preamble" >>= toObject >>= Object.lookup "title")
      lowerTitle = String.toLower title
      label = if contains "sundae" lowerTitle then "SundaeSwap V3 blueprint" else if title == "" then "CIP-57 blueprint" else titleLabel title <> " blueprint"
      slug = trimDashes (String.toLower (localName (if title == "" then "blueprint" else title)))
      identifier = if contains "sundae" lowerTitle then "sundaeswap-v3" else if slug == "" then "blueprint-" <> hashText raw else "blueprint-" <> slug
      part = { id: identifier, label, kind: "blueprint", turtle: "", plutusJson: raw }
  in { title: label, source: "CIP-57 plutus.json", parts: [ part ], turtle: "", notice: "" }

amaruBook :: Json -> Either String Book
amaruBook journal = do
  object <- maybeLeft "journal is not an object" (toObject journal)
  treasuries <- maybeLeft "journal missing treasuries" (Object.lookup "treasuries" object >>= toObject)
  let scopeOwners = textValue (Object.lookup "scope_owners" object)
      parts = Object.keys treasuries # Array.sort # map (\slug -> buildAmaruPart slug (fromMaybe Json.jsonEmptyObject (Object.lookup slug treasuries)) scopeOwners)
      turtle = String.joinWith "\n" (map _.turtle parts)
  pure { title: "Amaru treasury 2026 overlay", source: "docs/inspector/protocols/amaru-treasury/journal-2026.json", parts, turtle, notice: "" }

buildAmaruPart :: String -> Json -> String -> BookPart
buildAmaruPart slug treasuryValue scopeOwners =
  let treasury = fromMaybe Object.empty (toObject treasuryValue)
      safeSlug = localName slug
      title = titleLabel slug
      ownerValue = Object.lookup "owner" treasury
      owner = textValue ownerValue
      hasOwner = fromMaybe false (map truthyJson ownerValue)
      script key = fromMaybe Object.empty (Object.lookup key treasury >>= toObject)
      treasuryScript = script "treasury_script"
      permissionsScript = script "permissions_script"
      registryScript = script "registry_script"
      predicates =
        [ mkPredicate "a" "overlay:Treasury"
        , mkPredicate "rdfs:label" (literal ("Amaru " <> title <> " treasury"))
        , mkPredicate "overlay:slug" (literal slug)
        , mkPredicate "overlay:budgetAda" (turtleNumber (Object.lookup "budget" treasury))
        , mkPredicate "overlay:address" ("overlay:amaruAddress-" <> safeSlug)
        ] <> (if hasOwner then [ mkPredicate "overlay:owner" (iri "key" owner) ] else []) <>
        [ mkPredicate "overlay:scopeOwners" "overlay:amaruScopeOwners"
        , mkPredicate "overlay:treasuryScript" (iri "script" (textValue (Object.lookup "hash" treasuryScript)))
        , mkPredicate "overlay:permissionsScript" (iri "script" (textValue (Object.lookup "hash" permissionsScript)))
        , mkPredicate "overlay:registryScript" (iri "script" (textValue (Object.lookup "hash" registryScript)))
        ]
      ownerBlock = if hasOwner then block (iri "key" owner) [ mkPredicate "a" "overlay:Owner", mkPredicate "rdfs:label" (literal ("Amaru " <> title <> " owner key")) ] <> "\n" else ""
      turtle = prefixes <> "\n" <> vocab <> "\n"
        <> block "overlay:amaruScopeOwners" [ mkPredicate "a" "overlay:ScopeOwners", mkPredicate "rdfs:label" (literal "Amaru treasury scope owners"), mkPredicate "cardano:txOutRef" (literal (txOutRef scopeOwners)) ] <> "\n"
        <> block ("overlay:amaruAddress-" <> safeSlug) [ mkPredicate "a" "overlay:Address", mkPredicate "rdfs:label" (literal ("Amaru " <> title <> " treasury address")), mkPredicate "cardano:bech32" (literal (textValue (Object.lookup "address" treasury))) ] <> "\n"
        <> ownerBlock <> block ("overlay:amaruTreasury-" <> safeSlug) predicates <> "\n"
        <> scriptBlock slug "treasury_script" treasuryScript <> "\n"
        <> scriptBlock slug "permissions_script" permissionsScript <> "\n"
        <> scriptBlock slug "registry_script" registryScript
  in { id: "amaru-treasury-" <> safeSlug, label: sentenceLabel slug, kind: "overlay", turtle: normalizedTurtle turtle, plutusJson: "" }

scriptBlock :: String -> String -> Object.Object Json -> String
scriptBlock slug role script =
  block (iri "script" (textValue (Object.lookup "hash" script)))
    [ mkPredicate "a" "overlay:CardanoScript"
    , mkPredicate "rdfs:label" (literal ("Amaru " <> titleLabel slug <> " " <> String.replaceAll (Pattern "_") (Replacement " ") role))
    , mkPredicate "overlay:scriptRole" (literal role)
    , mkPredicate "cardano:txOutRef" (literal (txOutRef (textValue (Object.lookup "deployed_at" script))))
    , mkPredicate "overlay:slug" (literal (localName slug <> "-" <> role))
    ]

mkPredicate :: String -> String -> { predicate :: String, object :: String }
mkPredicate name object = { predicate: name, object }

block :: String -> Array { predicate :: String, object :: String } -> String
block subject predicates =
  subject <> "\n" <> String.joinWith "\n" (Array.mapWithIndex (\index row -> "  " <> row.predicate <> " " <> row.object <> if index == Array.length predicates - 1 then " ." else " ;") predicates) <> "\n"

blueprintArgs :: Array BookPart -> String
blueprintArgs parts =
  let blueprints = parts # Array.filter (\part -> part.kind == "blueprint" && part.plutusJson /= "") # map (\part -> "{\"id\":" <> literal part.id <> ",\"plutus_json\":" <> literal part.plutusJson <> "}")
  in if Array.null blueprints then "{}" else "{\"blueprints\":[" <> String.joinWith "," blueprints <> "]}"

isBlueprint :: Json -> Boolean
isBlueprint value = isJust (valueObject value >>= Object.lookup "preamble" >>= toObject) && isJust (valueObject value >>= Object.lookup "validators" >>= toArray)

isAmaru :: Json -> Boolean
isAmaru value = isJust (valueObject value >>= Object.lookup "scope_owners" >>= toString) && isJust (valueObject value >>= Object.lookup "treasuries" >>= toObject)

isShaclTurtle :: String -> Boolean
isShaclTurtle raw = contains "http://www.w3.org/ns/shacl#" raw || Array.any (\word -> hasShaclToken ("sh:" <> word) raw) [ "NodeShape", "targetClass", "property", "path", "minCount", "datatype" ]

hasShaclToken :: String -> String -> Boolean
hasShaclToken token = go Nothing
  where
  go previous remaining = case CodeUnits.stripPrefix (Pattern token) remaining of
    Just suffix | startsAtBoundary previous && endsAtBoundary suffix -> true
    _ -> case CodeUnits.uncons remaining of
      Nothing -> false
      Just { head, tail } -> go (Just head) tail

startsAtBoundary :: Maybe Char -> Boolean
startsAtBoundary = case _ of
  Nothing -> true
  Just char -> isWhitespace char

endsAtBoundary :: String -> Boolean
endsAtBoundary value = case CodeUnits.charAt 0 value of
  Nothing -> true
  Just char -> not (isWordChar char)

isWhitespace :: Char -> Boolean
isWhitespace char = char == ' ' || char == '\t' || char == '\n' || char == '\r'

isWordChar :: Char -> Boolean
isWordChar char = (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '_'

normalizedTurtle :: String -> String
normalizedTurtle raw = String.trim raw <> "\n"

textValue :: Maybe Json -> String
textValue = maybe "" jsonText

jsonText :: Json -> String
jsonText value
  | Json.isNull value = ""
  | Json.isBoolean value = if fromMaybe false (Json.toBoolean value) then "true" else "false"
  | Json.isNumber value = stringify value
  | otherwise = case toString value of
      Just text -> text
      Nothing -> case toArray value of
        Just values -> String.joinWith "," (map jsonText values)
        Nothing -> "[object Object]"

turtleNumber :: Maybe Json -> String
turtleNumber = case _ of
  Just value | finiteNumber value -> jsonTextForNumber value
  Just value -> literal (jsonText value)
  Nothing -> literal ""

jsonTextForNumber :: Json -> String
jsonTextForNumber value
  | Json.isNull value = "null"
  | otherwise = jsonText value

finiteNumber :: Json -> Boolean
finiteNumber value
  | Json.isNull value || Json.isBoolean value || Json.isNumber value = true
  | otherwise = case toString value of
      Just text -> isFiniteNumberText text
      Nothing -> case toArray value of
        Just [] -> true
        Just [ single ] -> finiteNumber single
        _ -> false

isFiniteNumberText :: String -> Boolean
isFiniteNumberText raw =
  let text = String.trim raw
      chars = CodeUnits.toCharArray text
      valid char = (char >= '0' && char <= '9') || char == '+' || char == '-' || char == '.' || char == 'e' || char == 'E'
      hasDigit = Array.any (\char -> char >= '0' && char <= '9') chars
  in text == "" || (hasDigit && Array.all valid chars)

truthyJson :: Json -> Boolean
truthyJson value
  | Json.isNull value = false
  | Json.isBoolean value = fromMaybe false (Json.toBoolean value)
  | Json.isNumber value = stringify value /= "0"
  | otherwise = case toString value of
      Just text -> text /= ""
      Nothing -> true

literal :: String -> String
literal = stringify <<< Json.fromString

iri :: String -> String -> String
iri kind value = "<urn:cardano:id:" <> kind <> ":" <> value <> ">"

txOutRef :: String -> String
txOutRef value = case CodeUnits.lastIndexOf (Pattern "#") value of
  Nothing -> value
  Just position ->
    let prefix = CodeUnits.take (position + 1) value
        suffix = CodeUnits.drop (position + 1) value
        stripped = dropLeadingZeros suffix
    in if suffix /= "" && allDigits suffix then prefix <> if stripped == "" then "0" else stripped else value

dropLeadingZeros :: String -> String
dropLeadingZeros value = case CodeUnits.charAt 0 value of
  Just '0' -> dropLeadingZeros (CodeUnits.drop 1 value)
  _ -> value

allDigits :: String -> Boolean
allDigits value = value /= "" && Array.all (\char -> char >= '0' && char <= '9') (CodeUnits.toCharArray value)

localName :: String -> String
localName = CodeUnits.fromCharArray <<< map (\char -> if isNameChar char then char else '-') <<< CodeUnits.toCharArray

isNameChar :: Char -> Boolean
isNameChar char = (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '_' || char == '-'

words :: String -> Array String
words = Array.filter (_ /= "") <<< String.split (Pattern "-") <<< String.replaceAll (Pattern "_") (Replacement "-") <<< localName

capitalize :: String -> String
capitalize word = String.toUpper (CodeUnits.take 1 word) <> String.toLower (CodeUnits.drop 1 word)

sentenceLabel :: String -> String
sentenceLabel slug = case Array.uncons (map String.toLower (words slug)) of
  Nothing -> "Overlay part"
  Just { head, tail } -> capitalize head <> if Array.null tail then "" else " " <> String.joinWith " " tail

titleLabel :: String -> String
titleLabel = String.joinWith " " <<< map capitalize <<< words

trimDashes :: String -> String
trimDashes value = trimTrailingDashes (trimLeadingDashes value)

trimLeadingDashes :: String -> String
trimLeadingDashes value = case CodeUnits.charAt 0 value of
  Just '-' -> trimLeadingDashes (CodeUnits.drop 1 value)
  _ -> value

trimTrailingDashes :: String -> String
trimTrailingDashes value = case CodeUnits.stripSuffix (Pattern "-") value of
  Just withoutDash -> trimTrailingDashes withoutDash
  Nothing -> value

contains :: String -> String -> Boolean
contains needle = CodeUnits.contains (Pattern needle)

valueObject :: Json -> Maybe (Object.Object Json)
valueObject = toObject

maybeLeft :: forall a. String -> Maybe a -> Either String a
maybeLeft message = case _ of
  Just value -> Right value
  Nothing -> Left message

hashText :: String -> String
hashText raw = toStringAs base36 (zshr (Array.foldl hashStep (-2128831035) (CodeUnits.toCharArray raw)) 0)
  where
  hashStep hash char = imul32 (hash .^. toCharCode char) 16777619

imul32 :: Int -> Int -> Int
imul32 left right = ((left .&. 65535) * right + ((((left `zshr` 16) * right) .&. 65535) `shl` 16)) .|. 0
