module Cardano.Provider
  ( Provider(..)
  , Network(..)
  , HttpRequest
  , HttpResponse
  , Transport
  , ProviderError(..)
  , ValidationContext
  , providerName
  , networkName
  , needsKey
  , providerErrorCategory
  , renderProviderError
  , fetchTxCbor
  , fetchTxCborWith
  , fetchTxCborForNode
  , fetchTxCborEffect
  , fetchValidationContext
  , fetchValidationContextWith
  , fetchValidationContextEffect
  , resolveProducerTxContext
  , resolveProducerTxContextWith
  ) where

import Prelude

import Control.Promise (Promise, fromAff, toAffE)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), Replacement(..), replaceAll) as String
import Effect (Effect)
import Effect.Aff (Aff, try, throwError)
import Effect.Exception (error, message)

data Provider = Blockfrost | Koios

derive instance eqProvider :: Eq Provider

data Network = Mainnet | Preprod | Preview

derive instance eqNetwork :: Eq Network

type HttpRequest = { url :: String, method :: String, headers :: Array { name :: String, value :: String }, body :: Maybe String }
type HttpResponse = { status :: Int, body :: String }
type Transport = HttpRequest -> Aff (Either String HttpResponse)
type ValidationContext = { network :: String, slot :: String, epoch :: String, protocolParameters :: String, source :: String }

data ProviderError
  = AuthenticationError Provider String Int String
  | RateLimitError Provider String Int String
  | ServerError Provider String Int String
  | TransportError Provider String String
  | DecodeError Provider String (Maybe Int) String

providerName :: Provider -> String
providerName = case _ of
  Blockfrost -> "Blockfrost"
  Koios -> "Koios"

networkName :: Network -> String
networkName = case _ of
  Mainnet -> "mainnet"
  Preprod -> "preprod"
  Preview -> "preview"

needsKey :: Provider -> Boolean
needsKey = case _ of
  Blockfrost -> true
  Koios -> false

providerErrorCategory :: ProviderError -> String
providerErrorCategory = case _ of
  AuthenticationError _ _ _ _ -> "authentication"
  RateLimitError _ _ _ _ -> "rate-limit"
  ServerError _ _ _ _ -> "server"
  TransportError _ _ _ -> "transport"
  DecodeError _ _ _ _ -> "decode"

renderProviderError :: ProviderError -> String
renderProviderError = case _ of
  AuthenticationError provider operation status detail -> renderHttp provider operation status detail
  RateLimitError provider operation status detail -> renderHttp provider operation status detail
  ServerError provider operation status detail -> renderHttp provider operation status detail
  TransportError _ _ detail -> detail
  DecodeError provider operation status detail -> case status of
    Just code -> renderHttp provider operation code detail
    Nothing -> providerName provider <> " " <> operation <> ": " <> detail

renderHttp :: Provider -> String -> Int -> String -> String
renderHttp provider operation status detail = providerName provider <> " " <> operation <> " " <> show status <> ": " <> detail

fetchTxCbor :: Provider -> Network -> String -> String -> Aff String
fetchTxCbor provider network credential txHash = do
  result <- fetchTxCborWith standardTransport provider network credential txHash
  unwrap result

fetchTxCborEffect :: Provider -> Network -> String -> String -> Effect (Promise String)
fetchTxCborEffect provider network credential txHash =
  fromAff (fetchTxCbor provider network credential txHash)

fetchTxCborWith :: Transport -> Provider -> Network -> String -> String -> Aff (Either ProviderError String)
fetchTxCborWith transport provider network credential txHash = do
  response <- runRequest transport provider "tx cbor" credential (txRequest provider network credential txHash)
  pure case response of
    Left err -> Left err
    Right body ->
      let
        decoded = decodeTxCbor body.body
      in
        if decoded.ok then Right decoded.value else Left (DecodeError provider "tx cbor" (Just body.status) decoded.error)

fetchTxCborForNode :: Provider -> Network -> String -> String -> Aff String
fetchTxCborForNode provider network credential txHash = do
  result <- fetchTxCborWith standardTransport provider network credential txHash
  case result of
    Right value -> pure value
    Left err -> throwProviderError credential err

fetchValidationContext :: Provider -> Network -> String -> Aff String
fetchValidationContext provider network credential = do
  result <- fetchValidationContextWith standardTransport provider network credential
  case result of
    Left err -> throwError (error (renderProviderError err))
    Right context -> pure (encodeValidationContext context)

fetchValidationContextEffect :: Provider -> Network -> String -> Effect (Promise String)
fetchValidationContextEffect provider network credential =
  fromAff (fetchValidationContext provider network credential)

fetchValidationContextWith :: Transport -> Provider -> Network -> String -> Aff (Either ProviderError ValidationContext)
fetchValidationContextWith transport provider network credential = do
  first <- runRequest transport provider "validation context" credential (contextFirstRequest provider network credential)
  second <- runRequest transport provider "validation context" credential (contextSecondRequest provider network credential)
  pure case first, second of
    Left err, _ -> Left err
    _, Left err -> Left err
    Right firstResponse, Right secondResponse ->
      let
        decoded = decodeValidationContext (providerName provider) (networkName network) firstResponse.body secondResponse.body
      in
        if decoded.ok then Right { network: decoded.network, slot: decoded.slot, epoch: decoded.epoch, protocolParameters: decoded.protocolParameters, source: decoded.source }
        else Left (DecodeError provider "validation context" (Just secondResponse.status) decoded.error)

resolveProducerTxContext :: Provider -> Network -> String -> Boolean -> String -> Aff String
resolveProducerTxContext provider network credential canFetchProducerTxs inspectionResponse =
  resolveProducerTxContextWith standardTransport provider network credential canFetchProducerTxs inspectionResponse

resolveProducerTxContextWith :: Transport -> Provider -> Network -> String -> Boolean -> String -> Aff String
resolveProducerTxContextWith transport provider network credential canFetchProducerTxs inspectionResponse =
  toAffE
    ( resolveProducerTxContextImpl
        (resolutionProvider provider)
        (producerTxSource provider)
        inspectionResponse
        (\txHash -> fromAff (fetchTxCborWithTransport transport provider network credential txHash))
        (fromAff (fetchValidationContextWithTransport transport provider network credential))
        (not (needsKey provider) || credential /= "")
        canFetchProducerTxs
    )

fetchTxCborWithTransport :: Transport -> Provider -> Network -> String -> String -> Aff String
fetchTxCborWithTransport transport provider network credential txHash = do
  result <- fetchTxCborWith transport provider network credential txHash
  case result of
    Right value -> pure value
    Left err -> throwProviderError credential err

fetchValidationContextWithTransport :: Transport -> Provider -> Network -> String -> Aff String
fetchValidationContextWithTransport transport provider network credential = do
  result <- fetchValidationContextWith transport provider network credential
  case result of
    Left err -> throwProviderError credential err
    Right context -> pure (encodeValidationContext context)

standardTransport :: Transport
standardTransport request = do
  result <- try (toAffE (fetchHttpResponse request))
  pure case result of
    Left err -> Left (message err)
    Right response -> Right response

runRequest :: Transport -> Provider -> String -> String -> HttpRequest -> Aff (Either ProviderError HttpResponse)
runRequest transport provider operation credential request
  | needsKey provider && credential == "" = pure (Left (AuthenticationError provider operation 401 "credentials not supplied"))
  | otherwise = do
      result <- transport request
      pure case result of
        Left detail -> Left (TransportError provider operation detail)
        Right response
          | response.status == 401 || response.status == 403 -> Left (AuthenticationError provider operation response.status response.body)
          | response.status == 429 -> Left (RateLimitError provider operation response.status response.body)
          | response.status >= 500 && response.status < 600 -> Left (ServerError provider operation response.status response.body)
          | response.status >= 200 && response.status < 300 -> Right response
          | otherwise -> Left (DecodeError provider operation (Just response.status) response.body)

txRequest :: Provider -> Network -> String -> String -> HttpRequest
txRequest provider network credential txHash = case provider of
  Blockfrost -> { url: blockfrostBase network <> "/txs/" <> txHash <> "/cbor", method: "GET", headers: [ { name: "project_id", value: credential } ], body: Nothing }
  Koios -> { url: koiosBase network <> "/tx_cbor", method: "POST", headers: koiosHeaders credential, body: Just ("{\"_tx_hashes\":[\"" <> txHash <> "\"]}") }

contextFirstRequest :: Provider -> Network -> String -> HttpRequest
contextFirstRequest provider network credential = case provider of
  Blockfrost -> { url: blockfrostBase network <> "/blocks/latest", method: "GET", headers: [ { name: "project_id", value: credential } ], body: Nothing }
  Koios -> { url: koiosBase network <> "/tip", method: "GET", headers: koiosHeaders credential, body: Nothing }

contextSecondRequest :: Provider -> Network -> String -> HttpRequest
contextSecondRequest provider network credential = case provider of
  Blockfrost -> { url: blockfrostBase network <> "/epochs/latest/parameters", method: "GET", headers: [ { name: "project_id", value: credential } ], body: Nothing }
  Koios -> { url: koiosBase network <> "/cli_protocol_params", method: "GET", headers: koiosHeaders credential, body: Nothing }

blockfrostBase :: Network -> String
blockfrostBase = case _ of
  Mainnet -> "https://cardano-mainnet.blockfrost.io/api/v0"
  Preprod -> "https://cardano-preprod.blockfrost.io/api/v0"
  Preview -> "https://cardano-preview.blockfrost.io/api/v0"

koiosBase :: Network -> String
koiosBase = case _ of
  Mainnet -> "https://api.koios.rest/api/v1"
  Preprod -> "https://preprod.koios.rest/api/v1"
  Preview -> "https://preview.koios.rest/api/v1"

koiosHeaders :: String -> Array { name :: String, value :: String }
koiosHeaders credential =
  if credential == "" then [ { name: "Content-Type", value: "application/json" } ]
  else [ { name: "Content-Type", value: "application/json" }, { name: "Authorization", value: "Bearer " <> credential } ]

resolutionProvider :: Provider -> String
resolutionProvider = case _ of
  Blockfrost -> "blockfrost"
  Koios -> "koios"

producerTxSource :: Provider -> String
producerTxSource = case _ of
  Blockfrost -> "blockfrost.txs.cbor"
  Koios -> "koios.tx_cbor"

providerNodeErrorCode :: ProviderError -> String
providerNodeErrorCode = case _ of
  AuthenticationError _ _ _ _ -> "PROVIDER_AUTHENTICATION"
  RateLimitError _ _ _ _ -> "PROVIDER_RATE_LIMIT"
  ServerError _ _ _ _ -> "PROVIDER_SERVER"
  TransportError _ _ _ -> "PROVIDER_TRANSPORT"
  DecodeError _ _ _ _ -> "PROVIDER_DECODE"

redactCredential :: String -> String -> String
redactCredential credential detail
  | credential == "" = detail
  | otherwise = String.replaceAll (String.Pattern credential) (String.Replacement "[redacted]") detail

throwProviderError :: String -> ProviderError -> Aff String
throwProviderError credential err =
  throwError (error ("[" <> providerNodeErrorCode err <> "] " <> redactCredential credential (renderProviderError err)))

unwrap :: Either ProviderError String -> Aff String
unwrap = case _ of
  Left err -> throwError (error (renderProviderError err))
  Right value -> pure value

foreign import fetchHttpResponse :: HttpRequest -> Effect (Promise HttpResponse)
foreign import decodeTxCbor :: String -> { ok :: Boolean, value :: String, error :: String }
foreign import decodeValidationContext :: String -> String -> String -> String -> { ok :: Boolean, network :: String, slot :: String, epoch :: String, protocolParameters :: String, source :: String, error :: String }
foreign import encodeValidationContext :: ValidationContext -> String
foreign import resolveProducerTxContextImpl :: String -> String -> String -> (String -> Effect (Promise String)) -> Effect (Promise String) -> Boolean -> Boolean -> Effect (Promise String)
