module Test.Provider (runProviderContractTests) where

import Prelude

import Cardano.Provider as Provider
import Cardano.Transaction.Entry as Entry
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String as String
import Data.String.CodeUnits as StringCodeUnits
import Data.Traversable (traverse_)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)
import Effect.Ref as Ref

runProviderContractTests :: Aff Unit
runProviderContractTests = do
  assertTxSuccess Provider.Blockfrost Provider.Mainnet "blockfrost-key"
    "https://cardano-mainnet.blockfrost.io/api/v0/txs/tx-hash/cbor"
    { method: "GET", headers: [ { name: "project_id", value: "blockfrost-key" } ], body: Nothing }
    "{\"cbor\":\"deadbeef\"}"
  assertTxSuccess Provider.Koios Provider.Preprod ""
    "https://preprod.koios.rest/api/v1/tx_cbor"
    { method: "POST", headers: [ { name: "Content-Type", value: "application/json" } ], body: Just { encoding: "text", value: "{\"_tx_hashes\":[\"tx-hash\"]}" } }
    "[{\"cbor\":\"deadbeef\"}]"
  assertContextSuccess Provider.Blockfrost Provider.Preprod "blockfrost-key" "testnet"
  assertContextSuccess Provider.Koios Provider.Preview "koios-token" "testnet"
  assertContextFailure Provider.Blockfrost Provider.Preprod "blockfrost-key" (status 401 "denied") "authentication"
  assertContextFailure Provider.Koios Provider.Preview "" (Left "network rejected") "transport"
  assertBlankBlockfrostCredential
  assertFailures Provider.Blockfrost Provider.Mainnet "blockfrost-key"
  assertFailures Provider.Koios Provider.Mainnet ""
  assertProducerContextOutcomes
  assertSubmitRoutes
  assertSubmitRejectsIneligibleEntries
  assertSubmitRejectsMalformedInputAndReceipts

submissionId :: String
submissionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

completeEntry :: Entry.TxEntry
completeEntry =
  { entryId: "entry-1"
  , unsignedTxCborHex: "deadbeef"
  , requiredSigners: [ "alice", "bob" ]
  , collectedWitnesses:
      [ { signerId: "alice", witnessCborHex: "a1" }
      , { signerId: "bob", witnessCborHex: "b2" }
      ]
  , invalidAfterSlot: 100
  , status: Entry.Open
  }

assertSubmitRoutes :: Aff Unit
assertSubmitRoutes = do
  if Provider.cborHexBodyByteValues { encoding: "cbor-hex", value: "deadbeef" } == [ 222, 173, 190, 239 ] then pure unit
  else fail "submission CBOR hex did not decode to the expected bytes"
  assertSubmitSuccess Provider.Blockfrost Provider.Mainnet "blockfrost-key"
    "https://cardano-mainnet.blockfrost.io/api/v0/tx/submit"
    [ { name: "project_id", value: "blockfrost-key" }, { name: "Content-Type", value: "application/cbor" } ]
    200
  assertSubmitSuccess Provider.Blockfrost Provider.Preprod "blockfrost-key"
    "https://cardano-preprod.blockfrost.io/api/v0/tx/submit"
    [ { name: "project_id", value: "blockfrost-key" }, { name: "Content-Type", value: "application/cbor" } ]
    200
  assertSubmitSuccess Provider.Blockfrost Provider.Preview "blockfrost-key"
    "https://cardano-preview.blockfrost.io/api/v0/tx/submit"
    [ { name: "project_id", value: "blockfrost-key" }, { name: "Content-Type", value: "application/cbor" } ]
    200
  assertSubmitSuccess Provider.Koios Provider.Mainnet "koios-token"
    "https://api.koios.rest/api/v1/submittx"
    [ { name: "Content-Type", value: "application/cbor" }, { name: "Authorization", value: "Bearer koios-token" } ]
    202
  assertSubmitSuccess Provider.Koios Provider.Preprod ""
    "https://preprod.koios.rest/api/v1/submittx"
    [ { name: "Content-Type", value: "application/cbor" } ]
    202
  assertSubmitSuccess Provider.Koios Provider.Preview "koios-token"
    "https://preview.koios.rest/api/v1/submittx"
    [ { name: "Content-Type", value: "application/cbor" }, { name: "Authorization", value: "Bearer koios-token" } ]
    202

assertSubmitSuccess
  :: Provider.Provider
  -> Provider.Network
  -> String
  -> String
  -> Array { name :: String, value :: String }
  -> Int
  -> Aff Unit
assertSubmitSuccess provider network credential expectedUrl expectedHeaders responseStatus = do
  result <- Provider.submitTxEntryWith
    (singleResponse expectedUrl { method: "POST", headers: expectedHeaders, body: Just { encoding: "cbor-hex", value: "deadbeef" } } (status responseStatus ("\"" <> submissionId <> "\"")))
    provider
    network
    credential
    10
    "deadbeef"
    completeEntry
  case result of
    Right receipt
      | receipt.txId == submissionId
          && receipt.provider == provider
          && receipt.network == network
          && receipt.entry == (completeEntry { status = Entry.Submitted }) -> pure unit
    Right _ -> fail (Provider.providerName provider <> " submit receipt decoded unexpectedly")
    Left err -> fail (Provider.renderSubmissionError err)

assertSubmitRejectsIneligibleEntries :: Aff Unit
assertSubmitRejectsIneligibleEntries = do
  assertSubmitRejectedBeforeTransport "incomplete" "entry-incomplete" (completeEntry { collectedWitnesses = [ { signerId: "alice", witnessCborHex: "a1" } ] }) 10
  assertSubmitRejectedBeforeTransport "expired" "entry-expired" completeEntry 100
  assertSubmitRejectedBeforeTransport "submitted" "entry-submitted" (completeEntry { status = Entry.Submitted }) 10

assertSubmitRejectedBeforeTransport :: String -> String -> Entry.TxEntry -> Int -> Aff Unit
assertSubmitRejectedBeforeTransport label expectedCategory entry currentSlot = do
  calls <- liftEffect (Ref.new 0)
  result <- Provider.submitTxEntryWith
    (countingTransport calls)
    Provider.Blockfrost
    Provider.Mainnet
    "blockfrost-key"
    currentSlot
    "deadbeef"
    entry
  callCount <- liftEffect (Ref.read calls)
  case result of
    Left err
      | Provider.submissionErrorCategory err == expectedCategory
          && callCount == 0 -> pure unit
    Left err -> fail (label <> " entry returned " <> Provider.submissionErrorCategory err <> " or invoked transport " <> show callCount <> " times")
    Right _ -> fail (label <> " entry submitted unexpectedly")

assertSubmitRejectsMalformedInputAndReceipts :: Aff Unit
assertSubmitRejectsMalformedInputAndReceipts = do
  assertSubmitInvalidCborRejectedBeforeTransport "invalid hex" "abc"
  assertSubmitInvalidCborRejectedBeforeTransport "empty CBOR" ""
  assertSubmitFailure "rejection" "provider-decode" "deadbeef" (status 400 "rejected blockfrost-key") "blockfrost-key"
  assertSubmitFailure "malformed json" "invalid-provider-receipt" "deadbeef" (success "not-json") "blockfrost-key"
  assertSubmitFailure "invalid id" "invalid-provider-receipt" "deadbeef" (success "\"not-a-transaction-id\"") "blockfrost-key"

assertSubmitInvalidCborRejectedBeforeTransport :: String -> String -> Aff Unit
assertSubmitInvalidCborRejectedBeforeTransport label signedCborHex = do
  calls <- liftEffect (Ref.new 0)
  result <- Provider.submitTxEntryWith
    (countingTransport calls)
    Provider.Blockfrost
    Provider.Mainnet
    "blockfrost-key"
    10
    signedCborHex
    completeEntry
  callCount <- liftEffect (Ref.read calls)
  case result of
    Left err
      | Provider.submissionErrorCategory err == "invalid-cbor-hex"
          && callCount == 0 -> pure unit
    Left err -> fail (label <> " returned " <> Provider.submissionErrorCategory err <> " or invoked transport " <> show callCount <> " times")
    Right _ -> fail (label <> " submit unexpectedly succeeded")

countingTransport :: Ref.Ref Int -> Provider.Transport
countingTransport calls _ = do
  liftEffect (Ref.modify_ (_ + 1) calls)
  pure (Left "transport invoked")

assertSubmitFailure :: String -> String -> String -> Either String Provider.HttpResponse -> String -> Aff Unit
assertSubmitFailure label expectedCategory signedCborHex response credential = do
  result <- Provider.submitTxEntryWith
    (\_ -> pure response)
    Provider.Blockfrost
    Provider.Mainnet
    credential
    10
    signedCborHex
    completeEntry
  case result of
    Left err
      | Provider.submissionErrorCategory err == expectedCategory
          && not (StringCodeUnits.contains (String.Pattern credential) (Provider.renderSubmissionError err)) -> pure unit
    Left err -> fail (label <> " submit error returned " <> Provider.submissionErrorCategory err <> " instead of " <> expectedCategory <> " or leaked credential")
    Right _ -> fail (label <> " submit unexpectedly succeeded")

assertProducerContextOutcomes :: Aff Unit
assertProducerContextOutcomes = do
  assertContextOutcome "complete" completeContextTransport
    [ "\"resolved_count\":2", "\"missing\":[]", "\"errors\":[]", "\"error_codes\":[]" ]
  assertContextOutcome "partial" partialContextTransport
    [ "\"resolved_count\":1", "\"missing\":[\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"]", "\"errors\":[\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: Blockfrost tx cbor 503: unavailable [redacted]\"]", "\"error_codes\":[{\"tx_id\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"code\":\"PROVIDER_SERVER\",\"message\":\"Blockfrost tx cbor 503: unavailable [redacted]\"}]" ]
  assertContextOutcome "total" totalContextTransport
    [ "\"resolved_count\":0", "\"missing\":[\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"]", "\"errors\":[\"validation_context: Blockfrost validation context 503: unavailable [redacted]\",\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: Blockfrost tx cbor 503: unavailable [redacted]\",\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: Blockfrost tx cbor 503: unavailable [redacted]\"]", "\"error_codes\":[{\"code\":\"PROVIDER_SERVER\",\"message\":\"Blockfrost validation context 503: unavailable [redacted]\"},{\"tx_id\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"code\":\"PROVIDER_SERVER\",\"message\":\"Blockfrost tx cbor 503: unavailable [redacted]\"},{\"tx_id\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"code\":\"PROVIDER_SERVER\",\"message\":\"Blockfrost tx cbor 503: unavailable [redacted]\"}]" ]
  assertContextDoesNotContain "partial" partialContextTransport "blockfrost-key"
  assertContextDoesNotContain "total" totalContextTransport "blockfrost-key"

assertContextOutcome :: String -> Provider.Transport -> Array String -> Aff Unit
assertContextOutcome label transport expectedFragments = do
  resolved <- Provider.resolveProducerTxContextWith transport Provider.Blockfrost Provider.Mainnet "blockfrost-key" true inspectionWithTwoInputs
  traverse_ (assertContains label resolved) expectedFragments

assertContains :: String -> String -> String -> Aff Unit
assertContains label value expected =
  if StringCodeUnits.contains (String.Pattern expected) value then pure unit
  else fail (label <> " context did not retain " <> expected)

assertContextDoesNotContain :: String -> Provider.Transport -> String -> Aff Unit
assertContextDoesNotContain label transport forbidden = do
  resolved <- Provider.resolveProducerTxContextWith transport Provider.Blockfrost Provider.Mainnet "blockfrost-key" true inspectionWithTwoInputs
  if StringCodeUnits.contains (String.Pattern forbidden) resolved then fail (label <> " context leaked credential") else pure unit

inspectionWithTwoInputs :: String
inspectionWithTwoInputs = "{\"inspection\":{\"inputs\":[{\"tx_id\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"index\":0},{\"tx_id\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"index\":1}]}}"

completeContextTransport :: Provider.Transport
completeContextTransport = contextTransport (success "{\"cbor\":\"deadbeef\"}") (success "{\"cbor\":\"cafebabe\"}")

partialContextTransport :: Provider.Transport
partialContextTransport = contextTransport (success "{\"cbor\":\"deadbeef\"}") (status 503 "unavailable blockfrost-key")

totalContextTransport :: Provider.Transport
totalContextTransport = totalContextTransportImpl

contextTransport :: Either String Provider.HttpResponse -> Either String Provider.HttpResponse -> Provider.Transport
contextTransport firstProducer secondProducer request
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest" = pure (success "{\"slot\":42,\"epoch\":9}")
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/epochs/latest/parameters" = pure (success "{\"min_fee_a\":44,\"protocol_major_ver\":9,\"protocol_minor_ver\":0}")
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/txs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cbor" = pure firstProducer
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/txs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/cbor" = pure secondProducer
  | otherwise = pure (Left "unexpected provider request")

totalContextTransportImpl :: Provider.Transport
totalContextTransportImpl request
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest" = pure (status 503 "unavailable blockfrost-key")
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/txs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cbor" = pure (status 503 "unavailable blockfrost-key")
  | request.url == "https://cardano-mainnet.blockfrost.io/api/v0/txs/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/cbor" = pure (status 503 "unavailable blockfrost-key")
  | otherwise = pure (Left "unexpected provider request")

assertTxSuccess
  :: Provider.Provider
  -> Provider.Network
  -> String
  -> String
  -> { method :: String, headers :: Array { name :: String, value :: String }, body :: Maybe Provider.HttpBody }
  -> String
  -> Aff Unit
assertTxSuccess provider network credential expectedUrl expectedRequest responseBody = do
  result <- Provider.fetchTxCborWith (singleResponse expectedUrl expectedRequest (success responseBody)) provider network credential "tx-hash"
  case result of
    Right "deadbeef" -> pure unit
    Right _ -> fail (Provider.providerName provider <> " transaction CBOR decoded unexpectedly")
    Left err -> fail (Provider.renderProviderError err)

assertContextSuccess :: Provider.Provider -> Provider.Network -> String -> String -> Aff Unit
assertContextSuccess provider network credential expectedLedgerNetwork = do
  result <- Provider.fetchValidationContextWith (contextResponses provider) provider network credential
  case result of
    Right context | context.network == expectedLedgerNetwork && context.slot == "42" && context.epoch == "9" -> pure unit
    Right context -> fail (Provider.providerName provider <> " validation context decoded unexpectedly: network=" <> context.network <> " slot=" <> context.slot <> " epoch=" <> context.epoch)
    Left err -> fail (Provider.renderProviderError err)

assertContextFailure
  :: Provider.Provider
  -> Provider.Network
  -> String
  -> Either String Provider.HttpResponse
  -> String
  -> Aff Unit
assertContextFailure provider network credential failure expectedCategory = do
  result <- Provider.fetchValidationContextWith (contextFailureResponses provider failure) provider network credential
  case result of
    Left err | Provider.providerErrorCategory err == expectedCategory -> pure unit
    Left err -> fail (Provider.providerName provider <> " context failure classified as " <> Provider.providerErrorCategory err)
    Right _ -> fail (Provider.providerName provider <> " context unexpectedly returned partial success")

assertBlankBlockfrostCredential :: Aff Unit
assertBlankBlockfrostCredential = do
  result <- Provider.fetchTxCborWith (\_ -> pure (Left "transport was called despite blank Blockfrost credentials")) Provider.Blockfrost Provider.Mainnet "" "tx-hash"
  case result of
    Left err | Provider.providerErrorCategory err == "authentication" -> pure unit
    Left err -> fail ("blank Blockfrost credential classified as " <> Provider.providerErrorCategory err)
    Right _ -> fail "blank Blockfrost credential unexpectedly reached the transport"

assertFailures :: Provider.Provider -> Provider.Network -> String -> Aff Unit
assertFailures provider network credential = do
  assertFailure provider network credential "authentication" (status 401 "denied") "authentication"
  assertFailure provider network credential "rate limit" (status 429 "slow down") "rate-limit"
  assertFailure provider network credential "server" (status 503 "unavailable") "server"
  assertFailure provider network credential "transport" (Left "network rejected") "transport"
  assertFailure provider network credential "decode" (success "{\"not_cbor\":true}") "decode"

assertFailure
  :: Provider.Provider
  -> Provider.Network
  -> String
  -> String
  -> Either String Provider.HttpResponse
  -> String
  -> Aff Unit
assertFailure provider network credential label response expectedCategory = do
  result <- Provider.fetchTxCborWith (\_ -> pure response) provider network credential "tx-hash"
  case result of
    Left err | Provider.providerErrorCategory err == expectedCategory -> pure unit
    Left err -> fail (Provider.providerName provider <> " " <> label <> " classified as " <> Provider.providerErrorCategory err)
    Right _ -> fail (Provider.providerName provider <> " " <> label <> " unexpectedly succeeded")

singleResponse
  :: String
  -> { method :: String, headers :: Array { name :: String, value :: String }, body :: Maybe Provider.HttpBody }
  -> Either String Provider.HttpResponse
  -> Provider.Transport
singleResponse expectedUrl expected response request
  | request.url == expectedUrl && request.method == expected.method && request.headers == expected.headers && request.body == expected.body = pure response
  | otherwise = pure (Left "request reached an unselected provider or did not preserve its contract")

contextResponses :: Provider.Provider -> Provider.Transport
contextResponses provider request =
  case provider of
    Provider.Blockfrost
      | request.url == "https://cardano-preprod.blockfrost.io/api/v0/blocks/latest" && request.method == "GET" && request.headers == [ { name: "project_id", value: "blockfrost-key" } ] -> pure (success "{\"slot\":42,\"epoch\":9}")
      | request.url == "https://cardano-preprod.blockfrost.io/api/v0/epochs/latest/parameters" && request.method == "GET" && request.headers == [ { name: "project_id", value: "blockfrost-key" } ] -> pure (success "{\"min_fee_a\":44,\"protocol_major_ver\":9,\"protocol_minor_ver\":0}")
      | otherwise -> pure (Left "Blockfrost context attempted a non-Blockfrost request")
    Provider.Koios
      | request.url == "https://preview.koios.rest/api/v1/tip" && request.method == "GET" && request.headers == [ { name: "Content-Type", value: "application/json" }, { name: "Authorization", value: "Bearer koios-token" } ] -> pure (success "[{\"abs_slot\":42,\"epoch_no\":9}]")
      | request.url == "https://preview.koios.rest/api/v1/cli_protocol_params" && request.method == "GET" && request.headers == [ { name: "Content-Type", value: "application/json" }, { name: "Authorization", value: "Bearer koios-token" } ] -> pure (success "[{\"minFeeA\":44}]")
      | otherwise -> pure (Left "Koios context attempted a non-Koios request")

contextFailureResponses :: Provider.Provider -> Either String Provider.HttpResponse -> Provider.Transport
contextFailureResponses provider failure request =
  case provider of
    Provider.Blockfrost
      | request.url == "https://cardano-preprod.blockfrost.io/api/v0/blocks/latest" && request.method == "GET" && request.headers == [ { name: "project_id", value: "blockfrost-key" } ] -> pure (success "{\"slot\":42,\"epoch\":9}")
      | request.url == "https://cardano-preprod.blockfrost.io/api/v0/epochs/latest/parameters" && request.method == "GET" && request.headers == [ { name: "project_id", value: "blockfrost-key" } ] -> pure failure
      | otherwise -> pure (Left "Blockfrost context failure attempted a non-Blockfrost request")
    Provider.Koios
      | request.url == "https://preview.koios.rest/api/v1/tip" && request.method == "GET" && request.headers == [ { name: "Content-Type", value: "application/json" } ] -> pure (success "[{\"abs_slot\":42,\"epoch_no\":9}]")
      | request.url == "https://preview.koios.rest/api/v1/cli_protocol_params" && request.method == "GET" && request.headers == [ { name: "Content-Type", value: "application/json" } ] -> pure failure
      | otherwise -> pure (Left "Koios context failure attempted a non-Koios request")

success :: String -> Either String Provider.HttpResponse
success body = Right { status: 200, body }

status :: Int -> String -> Either String Provider.HttpResponse
status code body = Right { status: code, body }

fail :: String -> Aff Unit
fail = liftEffect <<< throw
