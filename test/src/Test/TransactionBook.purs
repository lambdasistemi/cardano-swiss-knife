module Test.TransactionBook (runTransactionBookTests) where

import Prelude

import Cardano.Transaction.Book
  ( BookInput(..)
  , blueprintArgs
  , classifyBookInput
  , importBooks
  , parseBook
  )
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits as CodeUnits
import Data.String.Pattern (Pattern(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runTransactionBookTests :: Aff Unit
runTransactionBookTests = do
  assertInput "pasted Turtle is classified by its own constructor" pastedTurtle isPasted
  assertInput "SHACL Turtle is classified by its own constructor" shaclTurtle isShacl
  assertInput "SHACL prefixes require a whitespace boundary" "xsh:NodeShapeX" isPasted
  assertInput "SHACL terms require a word boundary" "sh:NodeShapeX" isPasted
  assertInput "CIP-57 JSON is classified by its own constructor" sundaeBlueprint isBlueprint
  assertInput "Amaru journal JSON is classified by its own constructor" compactAmaru isAmaru
  assertInput "book-store JSON is classified by its own constructor" selectedStore isStore
  assertPastedAndShacl
  assertBlueprints
  assertAmaru
  assertParityCorners
  assertStoreAndFailures

assertPastedAndShacl :: Aff Unit
assertPastedAndShacl = do
  pasted <- assertRight "pasted Turtle parses" (parseBook pastedTurtle)
  assertBook "pasted Turtle preserves its complete book" pasted
    "Pasted overlay Turtle" "paste"
    [ part "pasted-turtle-7lyylb" "Pasted Turtle" "overlay" normalizedPasted "" ] normalizedPasted
  shacl <- assertRight "SHACL Turtle parses" (parseBook shaclTurtle)
  assertBook "SHACL Turtle preserves its complete book" shacl
    "Pasted SHACL shapes" "paste"
    [ part "pasted-shacl-1b8zvaj" "Pasted SHACL shapes" "shacl" normalizedShacl "" ] normalizedShacl

assertBlueprints :: Aff Unit
assertBlueprints = do
  sundae <- assertRight "Sundae blueprint parses" (parseBook sundaeBlueprint)
  generic <- assertRight "generic blueprint parses" (parseBook genericBlueprint)
  missing <- assertRight "missing-title blueprint parses" (parseBook missingTitleBlueprint)
  assertBook "Sundae blueprint preserves its complete book" sundae
    "SundaeSwap V3 blueprint" "CIP-57 plutus.json"
    [ part "sundaeswap-v3" "SundaeSwap V3 blueprint" "blueprint" "" sundaeBlueprint ] ""
  assertBook "generic blueprint preserves its complete book" generic
    "Test Book Title blueprint" "CIP-57 plutus.json"
    [ part "blueprint-test-book-title" "Test Book Title blueprint" "blueprint" "" genericBlueprint ] ""
  assertBook "missing-title blueprint preserves its complete book" missing
    "CIP-57 blueprint" "CIP-57 plutus.json"
    [ part "blueprint-blueprint" "CIP-57 blueprint" "blueprint" "" missingTitleBlueprint ] ""
  assertEqual
    "blueprint arguments retain ID and raw JSON"
    ("{\"blueprints\":[{\"id\":\"sundaeswap-v3\",\"plutus_json\":" <> show sundaeBlueprint <> "}]}")
    (blueprintArgs sundae.parts)

assertAmaru :: Aff Unit
assertAmaru = do
  book <- assertRight "compact Amaru journal parses" (parseBook compactAmaru)
  assertBook "Amaru journal preserves every record and Turtle byte" book
    "Amaru treasury 2026 overlay" "docs/inspector/protocols/amaru-treasury/journal-2026.json"
    [ part "amaru-treasury-alpha" "Alpha" "overlay" expectedAmaruAlpha ""
    , part "amaru-treasury-zeta" "Zeta" "overlay" expectedAmaruZeta ""
    ]
    (expectedAmaruAlpha <> "\n" <> expectedAmaruZeta)

assertParityCorners :: Aff Unit
assertParityCorners = do
  nullOwner <- assertRight "null-owner journal parses" (parseBook (journalWith "ops__and---use-cases" "null" "\"42\""))
  booleanBudget <- assertRight "boolean-budget journal parses" (parseBook (journalWith "boolean_budget" "null" "true"))
  arrayValues <- assertRight "array-coercion journal parses" (parseBook (journalWith "array_budget" "[\"owner-array\"]" "[\"42\"]"))
  dashedBlueprint <- assertRight "underscore and dash-run blueprint parses" (parseBook "{\"preamble\":{\"title\":\"---test__book---\"},\"validators\":[]}")
  nullOwnerPart <- firstPart "null-owner journal has a part" nullOwner.parts
  booleanBudgetPart <- firstPart "boolean-budget journal has a part" booleanBudget.parts
  arrayValuesPart <- firstPart "array-coercion journal has a part" arrayValues.parts
  dashedBlueprintPart <- firstPart "dashed blueprint has a part" dashedBlueprint.parts
  let
      nullOwnerTurtle = nullOwnerPart.turtle
      booleanBudgetTurtle = booleanBudgetPart.turtle
      arrayValuesTurtle = arrayValuesPart.turtle
  assertEqual "underscore and dash runs produce the legacy sentence label" "Ops and use cases" nullOwnerPart.label
  assertEqual "local identifiers retain legacy underscores and dash runs" "amaru-treasury-ops__and---use-cases" nullOwnerPart.id
  assertEqual "blueprint IDs strip every leading and trailing dash" "blueprint-test__book" dashedBlueprintPart.id
  assertEqual "blueprint labels split underscore and dash runs" "Test Book blueprint" dashedBlueprintPart.label
  assertContains "numeric strings render as unquoted numbers" "overlay:budgetAda 42 ;" nullOwnerTurtle
  assertNotContains "null owners stay absent" "overlay:owner <urn:cardano:id:key:null>" nullOwnerTurtle
  assertContains "boolean budgets use JavaScript String coercion" "overlay:budgetAda true ;" booleanBudgetTurtle
  assertContains "single-element owner arrays use JavaScript array coercion" "overlay:owner <urn:cardano:id:key:owner-array>" arrayValuesTurtle
  assertContains "single-element numeric arrays render unquoted" "overlay:budgetAda 42 ;" arrayValuesTurtle

assertStoreAndFailures :: Aff Unit
assertStoreAndFailures = do
  imported <- assertRight "selected store imports" (importBooks [ pastedTurtle, selectedStore ])
  assertEqual
    "store preserves caller and selected-entry source order"
    [ "turtle", "cardano-ledger-inspector.books.v1", "cardano-ledger-inspector.books.v1" ]
    (map _.source imported)
  assertEqual
    "store retains only selected entries in document order"
    [ normalizedPasted, "selected first Turtle\n", "selected second Turtle\n" ]
    (map _.turtle imported)
  assertLeft "invalid store is explicit" "book store books is not an array" (importBooks [ "{\"kind\":\"cardano-ledger-inspector.books.v1\",\"books\":{}}" ])
  assertLeft "arbitrary JSON is explicit" "unrecognized JSON shape." (parseBook "{\"unrelated\":true}")
  assertLeft "obsolete bundle kind remains rejected" "unsupported JSON kind: amaru.book.bundle.v1." (parseBook "{\"kind\":\"amaru.book.bundle.v1\"}")
  assertLeft "empty input is explicit" "overlay input is empty" (parseBook "  \n")

assertInput :: String -> String -> (BookInput -> Boolean) -> Aff Unit
assertInput label raw predicate =
  case classifyBookInput raw of
    Right input | predicate input -> pure unit
    _ -> fail label

isPasted :: BookInput -> Boolean
isPasted = case _ of
  PastedTurtle _ -> true
  _ -> false

isShacl :: BookInput -> Boolean
isShacl = case _ of
  ShaclTurtle _ -> true
  _ -> false

isBlueprint :: BookInput -> Boolean
isBlueprint = case _ of
  Cip57Blueprint _ -> true
  _ -> false

isAmaru :: BookInput -> Boolean
isAmaru = case _ of
  AmaruJournal _ -> true
  _ -> false

isStore :: BookInput -> Boolean
isStore = case _ of
  BookStore _ -> true
  _ -> false

type ExpectedPart =
  { id :: String
  , label :: String
  , kind :: String
  , turtle :: String
  , plutusJson :: String
  }

part :: String -> String -> String -> String -> String -> ExpectedPart
part id label kind turtle plutusJson = { id, label, kind, turtle, plutusJson }

assertBook
  :: String
  -> { title :: String, source :: String, parts :: Array ExpectedPart, turtle :: String, notice :: String }
  -> String
  -> String
  -> Array ExpectedPart
  -> String
  -> Aff Unit
assertBook label actual title source parts turtle =
  assertEqual label
    { title, source, parts, turtle, notice: "" }
    actual

assertRight :: forall a. String -> Either String a -> Aff a
assertRight label = case _ of
  Right value -> pure value
  Left _ -> fail label

firstPart :: String -> Array ExpectedPart -> Aff ExpectedPart
firstPart label parts = case Array.head parts of
  Just value -> pure value
  Nothing -> fail label

assertLeft :: forall a. String -> String -> Either String a -> Aff Unit
assertLeft label expected = case _ of
  Left actual | actual == expected -> pure unit
  _ -> fail label

assertEqual :: forall a. Eq a => String -> a -> a -> Aff Unit
assertEqual label expected actual = if expected == actual then pure unit else fail label

assertContains :: String -> String -> String -> Aff Unit
assertContains label needle haystack =
  if CodeUnits.contains (Pattern needle) haystack then pure unit else fail label

assertNotContains :: String -> String -> String -> Aff Unit
assertNotContains label needle haystack =
  if CodeUnits.contains (Pattern needle) haystack then fail label else pure unit

fail :: forall a. String -> Aff a
fail = liftEffect <<< throw

pastedTurtle :: String
pastedTurtle = "  @prefix ex: <urn:example:> .\nex:part ex:label \"Pasted\" .\n\n"

normalizedPasted :: String
normalizedPasted = "@prefix ex: <urn:example:> .\nex:part ex:label \"Pasted\" .\n"

shaclTurtle :: String
shaclTurtle = "@prefix sh: <http://www.w3.org/ns/shacl#> .\nex:Shape a sh:NodeShape .\n"

normalizedShacl :: String
normalizedShacl = "@prefix sh: <http://www.w3.org/ns/shacl#> .\nex:Shape a sh:NodeShape .\n"

sundaeBlueprint :: String
sundaeBlueprint = "{\"preamble\":{\"title\":\"SundaeSwap v3\"},\"validators\":[]}"

genericBlueprint :: String
genericBlueprint = "{\"preamble\":{\"title\":\"test-book title\"},\"validators\":[]}"

missingTitleBlueprint :: String
missingTitleBlueprint = "{\"preamble\":{},\"validators\":[]}"

compactAmaru :: String
compactAmaru = "{\"scope_owners\":\"scope#000\",\"treasuries\":{\"zeta\":{\"budget\":\"not-a-number\",\"address\":\"addr-z\",\"treasury_script\":{\"hash\":\"t-z\",\"deployed_at\":\"tx#0007\"},\"permissions_script\":{\"hash\":\"p-z\",\"deployed_at\":\"tx#0008\"},\"registry_script\":{\"hash\":\"r-z\",\"deployed_at\":\"tx#0009\"}},\"alpha\":{\"owner\":\"owner-a\",\"budget\":42,\"address\":\"addr-a\",\"treasury_script\":{\"hash\":\"t-a\",\"deployed_at\":\"tx#0000\"},\"permissions_script\":{\"hash\":\"p-a\",\"deployed_at\":\"tx#001\"},\"registry_script\":{\"hash\":\"r-a\",\"deployed_at\":\"tx#010\"}}}}"

journalWith :: String -> String -> String -> String
journalWith slug owner budget =
  "{\"scope_owners\":\"scope#000\",\"treasuries\":{\"" <> slug <> "\":{\"owner\":" <> owner <> ",\"budget\":" <> budget <> ",\"address\":\"addr-test\",\"treasury_script\":{\"hash\":\"treasury\",\"deployed_at\":\"tx#000\"},\"permissions_script\":{\"hash\":\"permissions\",\"deployed_at\":\"tx#001\"},\"registry_script\":{\"hash\":\"registry\",\"deployed_at\":\"tx#002\"}}}}"

expectedAmaruAlpha :: String
expectedAmaruAlpha = "@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix overlay: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#> .\n\noverlay:OverlayPart\n  a rdfs:Class ;\n  rdfs:label \"Overlay part\" .\n\noverlay:Treasury\n  a rdfs:Class ;\n  rdfs:label \"Budget treasury\" .\n\noverlay:Address\n  a rdfs:Class ;\n  rdfs:label \"Cardano address\" .\n\noverlay:CardanoScript\n  a rdfs:Class ;\n  rdfs:label \"Cardano script\" .\n\noverlay:Owner\n  a rdfs:Class ;\n  rdfs:label \"Owner key\" .\n\noverlay:ScopeOwners\n  a rdfs:Class ;\n  rdfs:label \"Scope owners reference\" .\n\noverlay:slug a rdf:Property ; rdfs:label \"Slug\" .\noverlay:budgetAda a rdf:Property ; rdfs:label \"Budget in ADA\" .\noverlay:address a rdf:Property ; rdfs:label \"Treasury address\" .\noverlay:owner a rdf:Property ; rdfs:label \"Treasury owner\" .\noverlay:scopeOwners a rdf:Property ; rdfs:label \"Scope owners\" .\noverlay:treasuryScript a rdf:Property ; rdfs:label \"Treasury script\" .\noverlay:permissionsScript a rdf:Property ; rdfs:label \"Permissions script\" .\noverlay:registryScript a rdf:Property ; rdfs:label \"Registry script\" .\noverlay:scriptRole a rdf:Property ; rdfs:label \"Script role\" .\n\noverlay:amaruScopeOwners\n  a overlay:ScopeOwners ;\n  rdfs:label \"Amaru treasury scope owners\" ;\n  cardano:txOutRef \"scope#0\" .\n\noverlay:amaruAddress-alpha\n  a overlay:Address ;\n  rdfs:label \"Amaru Alpha treasury address\" ;\n  cardano:bech32 \"addr-a\" .\n\n<urn:cardano:id:key:owner-a>\n  a overlay:Owner ;\n  rdfs:label \"Amaru Alpha owner key\" .\n\noverlay:amaruTreasury-alpha\n  a overlay:Treasury ;\n  rdfs:label \"Amaru Alpha treasury\" ;\n  overlay:slug \"alpha\" ;\n  overlay:budgetAda 42 ;\n  overlay:address overlay:amaruAddress-alpha ;\n  overlay:owner <urn:cardano:id:key:owner-a> ;\n  overlay:scopeOwners overlay:amaruScopeOwners ;\n  overlay:treasuryScript <urn:cardano:id:script:t-a> ;\n  overlay:permissionsScript <urn:cardano:id:script:p-a> ;\n  overlay:registryScript <urn:cardano:id:script:r-a> .\n\n<urn:cardano:id:script:t-a>\n  a overlay:CardanoScript ;\n  rdfs:label \"Amaru Alpha treasury script\" ;\n  overlay:scriptRole \"treasury_script\" ;\n  cardano:txOutRef \"tx#0\" ;\n  overlay:slug \"alpha-treasury_script\" .\n\n<urn:cardano:id:script:p-a>\n  a overlay:CardanoScript ;\n  rdfs:label \"Amaru Alpha permissions script\" ;\n  overlay:scriptRole \"permissions_script\" ;\n  cardano:txOutRef \"tx#1\" ;\n  overlay:slug \"alpha-permissions_script\" .\n\n<urn:cardano:id:script:r-a>\n  a overlay:CardanoScript ;\n  rdfs:label \"Amaru Alpha registry script\" ;\n  overlay:scriptRole \"registry_script\" ;\n  cardano:txOutRef \"tx#10\" ;\n  overlay:slug \"alpha-registry_script\" .\n"

expectedAmaruZeta :: String
expectedAmaruZeta = "@prefix cardano: <https://lambdasistemi.github.io/cardano-ledger-rdf/vocab/cardano#> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix overlay: <https://lambdasistemi.github.io/cardano-ledger-inspector/overlay/amaru-treasury#> .\n\noverlay:OverlayPart\n  a rdfs:Class ;\n  rdfs:label \"Overlay part\" .\n\noverlay:Treasury\n  a rdfs:Class ;\n  rdfs:label \"Budget treasury\" .\n\noverlay:Address\n  a rdfs:Class ;\n  rdfs:label \"Cardano address\" .\n\noverlay:CardanoScript\n  a rdfs:Class ;\n  rdfs:label \"Cardano script\" .\n\noverlay:Owner\n  a rdfs:Class ;\n  rdfs:label \"Owner key\" .\n\noverlay:ScopeOwners\n  a rdfs:Class ;\n  rdfs:label \"Scope owners reference\" .\n\noverlay:slug a rdf:Property ; rdfs:label \"Slug\" .\noverlay:budgetAda a rdf:Property ; rdfs:label \"Budget in ADA\" .\noverlay:address a rdf:Property ; rdfs:label \"Treasury address\" .\noverlay:owner a rdf:Property ; rdfs:label \"Treasury owner\" .\noverlay:scopeOwners a rdf:Property ; rdfs:label \"Scope owners\" .\noverlay:treasuryScript a rdf:Property ; rdfs:label \"Treasury script\" .\noverlay:permissionsScript a rdf:Property ; rdfs:label \"Permissions script\" .\noverlay:registryScript a rdf:Property ; rdfs:label \"Registry script\" .\noverlay:scriptRole a rdf:Property ; rdfs:label \"Script role\" .\n\noverlay:amaruScopeOwners\n  a overlay:ScopeOwners ;\n  rdfs:label \"Amaru treasury scope owners\" ;\n  cardano:txOutRef \"scope#0\" .\n\noverlay:amaruAddress-zeta\n  a overlay:Address ;\n  rdfs:label \"Amaru Zeta treasury address\" ;\n  cardano:bech32 \"addr-z\" .\n\noverlay:amaruTreasury-zeta\n  a overlay:Treasury ;\n  rdfs:label \"Amaru Zeta treasury\" ;\n  overlay:slug \"zeta\" ;\n  overlay:budgetAda \"not-a-number\" ;\n  overlay:address overlay:amaruAddress-zeta ;\n  overlay:scopeOwners overlay:amaruScopeOwners ;\n  overlay:treasuryScript <urn:cardano:id:script:t-z> ;\n  overlay:permissionsScript <urn:cardano:id:script:p-z> ;\n  overlay:registryScript <urn:cardano:id:script:r-z> .\n\n<urn:cardano:id:script:t-z>\n  a overlay:CardanoScript ;\n  rdfs:label \"Amaru Zeta treasury script\" ;\n  overlay:scriptRole \"treasury_script\" ;\n  cardano:txOutRef \"tx#7\" ;\n  overlay:slug \"zeta-treasury_script\" .\n\n<urn:cardano:id:script:p-z>\n  a overlay:CardanoScript ;\n  rdfs:label \"Amaru Zeta permissions script\" ;\n  overlay:scriptRole \"permissions_script\" ;\n  cardano:txOutRef \"tx#8\" ;\n  overlay:slug \"zeta-permissions_script\" .\n\n<urn:cardano:id:script:r-z>\n  a overlay:CardanoScript ;\n  rdfs:label \"Amaru Zeta registry script\" ;\n  overlay:scriptRole \"registry_script\" ;\n  cardano:txOutRef \"tx#9\" ;\n  overlay:slug \"zeta-registry_script\" .\n"

selectedStore :: String
selectedStore = "{\"kind\":\"cardano-ledger-inspector.books.v1\",\"books\":[{\"selected\":true,\"turtle\":\"selected first Turtle\\n\"},{\"selected\":false,\"turtle\":\"ignored Turtle\\n\"},{\"selected\":true,\"turtle\":\"selected second Turtle\\n\"}]}"
