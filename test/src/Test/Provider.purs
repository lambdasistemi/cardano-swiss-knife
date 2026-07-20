module Test.Provider (runProviderContractTests) where

import Prelude

import Cardano.Provider as Provider
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Exception (throw)

runProviderContractTests :: Aff Unit
runProviderContractTests = do
  assertTxSuccess Provider.Blockfrost Provider.Mainnet "blockfrost-key"
    "https://cardano-mainnet.blockfrost.io/api/v0/txs/tx-hash/cbor"
    { method: "GET", headers: [ { name: "project_id", value: "blockfrost-key" } ], body: Nothing }
    "{\"cbor\":\"deadbeef\"}"
  assertTxSuccess Provider.Koios Provider.Preprod ""
    "https://preprod.koios.rest/api/v1/tx_cbor"
    { method: "POST", headers: [ { name: "Content-Type", value: "application/json" } ], body: Just "{\"_tx_hashes\":[\"tx-hash\"]}" }
    "[{\"cbor\":\"deadbeef\"}]"
  assertContextSuccess Provider.Blockfrost Provider.Preprod "blockfrost-key" "testnet"
  assertContextSuccess Provider.Koios Provider.Preview "koios-token" "testnet"
  assertContextFailure Provider.Blockfrost Provider.Preprod "blockfrost-key" (status 401 "denied") "authentication"
  assertContextFailure Provider.Koios Provider.Preview "" (Left "network rejected") "transport"
  assertBlankBlockfrostCredential
  assertFailures Provider.Blockfrost Provider.Mainnet "blockfrost-key"
  assertFailures Provider.Koios Provider.Mainnet ""

assertTxSuccess
  :: Provider.Provider
  -> Provider.Network
  -> String
  -> String
  -> { method :: String, headers :: Array { name :: String, value :: String }, body :: Maybe String }
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
  -> { method :: String, headers :: Array { name :: String, value :: String }, body :: Maybe String }
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
