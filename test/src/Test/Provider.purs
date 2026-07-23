module Test.Provider (runProviderContractTests) where

import Prelude

import Cardano.Provider as Provider
import Cardano.Transaction.Entry as Entry
import Data.Array as Array
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
  assertWithdrawalAccountState

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

-- Withdrawal account-state resolution (issue #113)

assertWithdrawalAccountState :: Aff Unit
assertWithdrawalAccountState = do
  traverse_ assertWithdrawalCombo withdrawalCombos
  assertWithdrawalDeduplication
  assertWithdrawalZeroBalance
  assertWithdrawalCompleteMultipleAccounts
  assertWithdrawalMissingBlockfrost
  assertWithdrawalMissingKoios
  assertWithdrawalUnregisteredBlockfrost
  assertWithdrawalUnregisteredKoios
  assertWithdrawalMissingIdentityBlockfrost
  assertWithdrawalMalformedBlockfrost
  assertWithdrawalMalformedKoios
  assertWithdrawalMismatchedBlockfrost
  assertWithdrawalMismatchedKoios
  assertWithdrawalDuplicateRowsKoios
  assertWithdrawalPartialFailureOmitsCertState
  assertWithdrawalProviderTransportFailures
  assertWithdrawalCredentialRedaction
  assertWithdrawalLegacyInspectionCompatibility
  assertWithdrawalNoWithdrawalsCompatibility

type WithdrawalCombo =
  { provider :: Provider.Provider
  , network :: Provider.Network
  , credential :: String
  , kind :: String
  , hash :: String
  , accountHex :: String
  , stakeAddress :: String
  , balance :: String
  }

withdrawalCombos :: Array WithdrawalCombo
withdrawalCombos =
  [ { provider: Provider.Blockfrost, network: Provider.Mainnet, credential: "blockfrost-key", kind: "key", hash: "01010101010101010101010101010101010101010101010101010101", accountHex: "e101010101010101010101010101010101010101010101010101010101", stakeAddress: "stake1uyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqg6jacpu", balance: "1000000" }
  , { provider: Provider.Blockfrost, network: Provider.Mainnet, credential: "blockfrost-key", kind: "script", hash: "02020202020202020202020202020202020202020202020202020202", accountHex: "f102020202020202020202020202020202020202020202020202020202", stakeAddress: "stake17ypqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqsq5av3s", balance: "2000000" }
  , { provider: Provider.Blockfrost, network: Provider.Preprod, credential: "blockfrost-key", kind: "key", hash: "03030303030303030303030303030303030303030303030303030303", accountHex: "e003030303030303030303030303030303030303030303030303030303", stakeAddress: "stake_test1uqpsxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpsxqc7rfyyd", balance: "3000000" }
  , { provider: Provider.Blockfrost, network: Provider.Preprod, credential: "blockfrost-key", kind: "script", hash: "04040404040404040404040404040404040404040404040404040404", accountHex: "f004040404040404040404040404040404040404040404040404040404", stakeAddress: "stake_test17qzqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqgq2fvm", balance: "4000000" }
  , { provider: Provider.Blockfrost, network: Provider.Preview, credential: "blockfrost-key", kind: "key", hash: "05050505050505050505050505050505050505050505050505050505", accountHex: "e005050505050505050505050505050505050505050505050505050505", stakeAddress: "stake_test1uqzs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg3a5ram", balance: "5000000" }
  , { provider: Provider.Blockfrost, network: Provider.Preview, credential: "blockfrost-key", kind: "script", hash: "06060606060606060606060606060606060606060606060606060606", accountHex: "f006060606060606060606060606060606060606060606060606060606", stakeAddress: "stake_test17qrqvpsxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpstm5hdh", balance: "6000000" }
  , { provider: Provider.Koios, network: Provider.Mainnet, credential: "koios-token", kind: "key", hash: "07070707070707070707070707070707070707070707070707070707", accountHex: "e107070707070707070707070707070707070707070707070707070707", stakeAddress: "stake1uyrswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc4vqlc2", balance: "7000000" }
  , { provider: Provider.Koios, network: Provider.Mainnet, credential: "koios-token", kind: "script", hash: "08080808080808080808080808080808080808080808080808080808", accountHex: "f108080808080808080808080808080808080808080808080808080808", stakeAddress: "stake17yyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszq8w6xpt", balance: "8000000" }
  , { provider: Provider.Koios, network: Provider.Preprod, credential: "koios-token", kind: "key", hash: "09090909090909090909090909090909090909090909090909090909", accountHex: "e009090909090909090909090909090909090909090909090909090909", stakeAddress: "stake_test1uqysjzgfpyysjzgfpyysjzgfpyysjzgfpyysjzgfpyysjzgeeww5k", balance: "9000000" }
  , { provider: Provider.Koios, network: Provider.Preprod, credential: "koios-token", kind: "script", hash: "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a", accountHex: "f00a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a", stakeAddress: "stake_test17q9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zsrlw6y6", balance: "10000000" }
  , { provider: Provider.Koios, network: Provider.Preview, credential: "koios-token", kind: "key", hash: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", accountHex: "e00b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", stakeAddress: "stake_test1uq9skzctpv9skzctpv9skzctpv9skzctpv9skzctpv9skzc6zss46", balance: "11000000" }
  , { provider: Provider.Koios, network: Provider.Preview, credential: "koios-token", kind: "script", hash: "0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c", accountHex: "f00c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c", stakeAddress: "stake_test17qxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpsxqcrqvpnaav", balance: "12000000" }
  ]

assertWithdrawalCombo :: WithdrawalCombo -> Aff Unit
assertWithdrawalCombo combo = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: combo.kind, hash: combo.hash, hex: combo.accountHex } ])
    stub = accountStub combo.provider combo.network combo.credential combo.stakeAddress (success (accountResponseBody combo.provider combo.stakeAddress true combo.balance))
    label = Provider.providerName combo.provider <> " " <> Provider.networkName combo.network <> " " <> combo.kind <> " withdrawal"
  outcome <- resolveWithdrawals combo.provider combo.network combo.credential [ stub ] discovery
  if outcome.callCount == 1 then pure unit else fail (label <> " reached the account endpoint " <> show outcome.callCount <> " times instead of once")
  assertContains label outcome.resolved
    ("\"cert_state\":{\"rewards\":[{\"credential\":{\"kind\":\"" <> combo.kind <> "\",\"hash\":\"" <> combo.hash <> "\"},\"balance_lovelace\":\"" <> combo.balance <> "\"}]}")
  assertContains label outcome.resolved "\"producer_txs\":{}"

dedupHash :: String
dedupHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

dedupAccountHex :: String
dedupAccountHex = "e1" <> dedupHash

dedupStakeAddress :: String
dedupStakeAddress = "stake1ux42424242424242424242424242424242424242424242ser95fn"

assertWithdrawalDeduplication :: Aff Unit
assertWithdrawalDeduplication = do
  let
    discovery = compositeEnvelope emptyInspectionJson
      ( intentWithWithdrawals
          [ { kind: "key", hash: dedupHash, hex: dedupAccountHex }
          , { kind: "key", hash: dedupHash, hex: dedupAccountHex }
          ]
      )
    stub = accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" dedupStakeAddress (success (accountResponseBody Provider.Blockfrost dedupStakeAddress true "1500000"))
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" [ stub ] discovery
  if outcome.callCount == 1 then pure unit else fail ("duplicate withdrawal entries for one reward account reached the account endpoint " <> show outcome.callCount <> " times instead of once")
  assertContains "withdrawal dedup" outcome.resolved
    ("\"cert_state\":{\"rewards\":[{\"credential\":{\"kind\":\"key\",\"hash\":\"" <> dedupHash <> "\"},\"balance_lovelace\":\"1500000\"}]}")

zeroBalanceHash :: String
zeroBalanceHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

zeroBalanceAccountHex :: String
zeroBalanceAccountHex = "e1" <> zeroBalanceHash

zeroBalanceStakeAddress :: String
zeroBalanceStakeAddress = "stake1uxamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwcj9kcqz"

assertWithdrawalZeroBalance :: Aff Unit
assertWithdrawalZeroBalance = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: zeroBalanceHash, hex: zeroBalanceAccountHex } ])
    stub = accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" zeroBalanceStakeAddress (success (accountResponseBody Provider.Blockfrost zeroBalanceStakeAddress true "0"))
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" [ stub ] discovery
  assertContains "withdrawal zero balance" outcome.resolved
    ("\"cert_state\":{\"rewards\":[{\"credential\":{\"kind\":\"key\",\"hash\":\"" <> zeroBalanceHash <> "\"},\"balance_lovelace\":\"0\"}]}")

thirdAccountHash :: String
thirdAccountHash = "d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3"

thirdAccountHex :: String
thirdAccountHex = "e1" <> thirdAccountHash

thirdAccountAddress :: String
thirdAccountAddress = "stake1u8fa857n60fa857n60fa857n60fa857n60fa857n60fa85cr2x9xe"

assertWithdrawalCompleteMultipleAccounts :: Aff Unit
assertWithdrawalCompleteMultipleAccounts = do
  let
    firstCombo = withdrawalComboAt 0
    secondCombo = withdrawalComboAt 1
    discovery = compositeEnvelope emptyInspectionJson
      ( intentWithWithdrawals
          [ { kind: firstCombo.kind, hash: firstCombo.hash, hex: firstCombo.accountHex }
          , { kind: secondCombo.kind, hash: secondCombo.hash, hex: secondCombo.accountHex }
          , { kind: "key", hash: thirdAccountHash, hex: thirdAccountHex }
          ]
      )
    stubs =
      [ accountStub firstCombo.provider firstCombo.network firstCombo.credential firstCombo.stakeAddress (success (accountResponseBody firstCombo.provider firstCombo.stakeAddress true firstCombo.balance))
      , accountStub secondCombo.provider secondCombo.network secondCombo.credential secondCombo.stakeAddress (success (accountResponseBody secondCombo.provider secondCombo.stakeAddress true secondCombo.balance))
      , accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" thirdAccountAddress (success (accountResponseBody Provider.Blockfrost thirdAccountAddress true "300000"))
      ]
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" stubs discovery
  assertContains "withdrawal complete set" outcome.resolved "\"cert_state\":{\"rewards\":["
  assertContains "withdrawal complete set" outcome.resolved ("\"hash\":\"" <> firstCombo.hash <> "\"")
  assertContains "withdrawal complete set" outcome.resolved ("\"hash\":\"" <> secondCombo.hash <> "\"")
  assertContains "withdrawal complete set" outcome.resolved ("\"hash\":\"" <> thirdAccountHash <> "\"")
  assertContains "withdrawal complete set" outcome.resolved "\"resolved_count\":3"
  assertContains "withdrawal complete set" outcome.resolved "\"requested_count\":3"

withdrawalComboAt :: Int -> WithdrawalCombo
withdrawalComboAt index = case Array.index withdrawalCombos index of
  Just combo -> combo
  Nothing -> fixtureIndexOutOfRange

fixtureIndexOutOfRange :: WithdrawalCombo
fixtureIndexOutOfRange =
  { provider: Provider.Blockfrost, network: Provider.Mainnet, credential: "", kind: "key", hash: "", accountHex: "", stakeAddress: "", balance: "" }

missingKoiosHash :: String
missingKoiosHash = "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"

missingKoiosHex :: String
missingKoiosHex = "e1" <> missingKoiosHash

missingKoiosAddress :: String
missingKoiosAddress = "stake1u82df4x56n2df4x56n2df4x56n2df4x56n2df4x56n2df4qupege0"

assertWithdrawalMissingKoios :: Aff Unit
assertWithdrawalMissingKoios = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: missingKoiosHash, hex: missingKoiosHex } ])
    stub = accountStub Provider.Koios Provider.Mainnet "koios-token" missingKoiosAddress (success "[]")
  outcome <- resolveWithdrawals Provider.Koios Provider.Mainnet "koios-token" [ stub ] discovery
  assertAbsent "withdrawal missing (Koios)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal missing (Koios)" outcome.resolved "\"code\":\"WITHDRAWAL_MISSING\""

missingBlockfrostHash :: String
missingBlockfrostHash = "d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5"

missingBlockfrostHex :: String
missingBlockfrostHex = "e0" <> missingBlockfrostHash

missingBlockfrostAddress :: String
missingBlockfrostAddress = "stake_test1ur2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2at4gt73qmj"

assertWithdrawalMissingBlockfrost :: Aff Unit
assertWithdrawalMissingBlockfrost = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: missingBlockfrostHash, hex: missingBlockfrostHex } ])
    stub = accountStub Provider.Blockfrost Provider.Preprod "blockfrost-key" missingBlockfrostAddress (status 404 "not found")
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Preprod "blockfrost-key" [ stub ] discovery
  assertAbsent "withdrawal missing (Blockfrost)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal missing (Blockfrost)" outcome.resolved "\"code\":\"PROVIDER_DECODE\""

unregBlockfrostHash :: String
unregBlockfrostHash = "d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6"

unregBlockfrostHex :: String
unregBlockfrostHex = "e0" <> unregBlockfrostHash

unregBlockfrostAddress :: String
unregBlockfrostAddress = "stake_test1urtdd4kk6mtdd4kk6mtdd4kk6mtdd4kk6mtdd4kk6mtdd4scsd5u7"

assertWithdrawalUnregisteredBlockfrost :: Aff Unit
assertWithdrawalUnregisteredBlockfrost = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: unregBlockfrostHash, hex: unregBlockfrostHex } ])
    stub = accountStub Provider.Blockfrost Provider.Preprod "blockfrost-key" unregBlockfrostAddress (success (accountResponseBody Provider.Blockfrost unregBlockfrostAddress false "0"))
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Preprod "blockfrost-key" [ stub ] discovery
  assertAbsent "withdrawal unregistered (Blockfrost)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal unregistered (Blockfrost)" outcome.resolved "\"code\":\"WITHDRAWAL_UNREGISTERED\""

missingIdentityHash :: String
missingIdentityHash = "f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7"

missingIdentityHex :: String
missingIdentityHex = "e1" <> missingIdentityHash

missingIdentityAddress :: String
missingIdentityAddress = "stake1u8ml0alh7lml0alh7lml0alh7lml0alh7lml0alh7lml0ac0v8zts"

assertWithdrawalMissingIdentityBlockfrost :: Aff Unit
assertWithdrawalMissingIdentityBlockfrost = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: missingIdentityHash, hex: missingIdentityHex } ])
    body = "{\"registered\":true,\"withdrawable_amount\":\"500\"}"
    stub = accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" missingIdentityAddress (success body)
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" [ stub ] discovery
  assertAbsent "withdrawal missing identity (Blockfrost)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal missing identity (Blockfrost)" outcome.resolved "\"code\":\"WITHDRAWAL_MISMATCHED\""

unregKoiosHash :: String
unregKoiosHash = "d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7"

unregKoiosHex :: String
unregKoiosHex = "e1" <> unregKoiosHash

unregKoiosAddress :: String
unregKoiosAddress = "stake1u8ta047h6lta047h6lta047h6lta047h6lta047h6lta04c009u7r"

assertWithdrawalUnregisteredKoios :: Aff Unit
assertWithdrawalUnregisteredKoios = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: unregKoiosHash, hex: unregKoiosHex } ])
    body = "[{\"stake_address\":\"" <> unregKoiosAddress <> "\",\"status\":\"not_registered\",\"rewards_available\":\"0\"}]"
    stub = accountStub Provider.Koios Provider.Mainnet "koios-token" unregKoiosAddress (success body)
  outcome <- resolveWithdrawals Provider.Koios Provider.Mainnet "koios-token" [ stub ] discovery
  assertAbsent "withdrawal unregistered (Koios)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal unregistered (Koios)" outcome.resolved "\"code\":\"WITHDRAWAL_UNREGISTERED\""

malformedBlockfrostHash :: String
malformedBlockfrostHash = "d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8"

malformedBlockfrostHex :: String
malformedBlockfrostHex = "e0" <> malformedBlockfrostHash

malformedBlockfrostAddress :: String
malformedBlockfrostAddress = "stake_test1urvd3kxcmrvd3kxcmrvd3kxcmrvd3kxcmrvd3kxcmrvd3kqn0f85l"

assertWithdrawalMalformedBlockfrost :: Aff Unit
assertWithdrawalMalformedBlockfrost = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: malformedBlockfrostHash, hex: malformedBlockfrostHex } ])
    body = "{\"stake_address\":\"" <> malformedBlockfrostAddress <> "\",\"registered\":true,\"withdrawable_amount\":\"-5\"}"
    stub = accountStub Provider.Blockfrost Provider.Preprod "blockfrost-key" malformedBlockfrostAddress (success body)
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Preprod "blockfrost-key" [ stub ] discovery
  assertAbsent "withdrawal malformed negative (Blockfrost)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal malformed negative (Blockfrost)" outcome.resolved "\"code\":\"WITHDRAWAL_MALFORMED\""

malformedKoiosHash :: String
malformedKoiosHash = "d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9"

malformedKoiosHex :: String
malformedKoiosHex = "e1" <> malformedKoiosHash

malformedKoiosAddress :: String
malformedKoiosAddress = "stake1u8vankwem8vankwem8vankwem8vankwem8vankwem8vankgysp0kz"

assertWithdrawalMalformedKoios :: Aff Unit
assertWithdrawalMalformedKoios = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: malformedKoiosHash, hex: malformedKoiosHex } ])
    body = "[{\"stake_address\":\"" <> malformedKoiosAddress <> "\",\"status\":\"registered\",\"rewards_available\":\"not-a-number\"}]"
    stub = accountStub Provider.Koios Provider.Mainnet "koios-token" malformedKoiosAddress (success body)
  outcome <- resolveWithdrawals Provider.Koios Provider.Mainnet "koios-token" [ stub ] discovery
  assertAbsent "withdrawal malformed (Koios)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal malformed (Koios)" outcome.resolved "\"code\":\"WITHDRAWAL_MALFORMED\""

mismatchBlockfrostHash :: String
mismatchBlockfrostHash = "dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb"

mismatchBlockfrostHex :: String
mismatchBlockfrostHex = "f0" <> mismatchBlockfrostHash

mismatchBlockfrostAddress :: String
mismatchBlockfrostAddress = "stake_test17rdahk7mm0dahk7mm0dahk7mm0dahk7mm0dahk7mm0dahkcfffnyn"

assertWithdrawalMismatchedBlockfrost :: Aff Unit
assertWithdrawalMismatchedBlockfrost = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "script", hash: mismatchBlockfrostHash, hex: mismatchBlockfrostHex } ])
    body = "{\"stake_address\":\"" <> thirdAccountAddress <> "\",\"registered\":true,\"withdrawable_amount\":\"500\"}"
    stub = accountStub Provider.Blockfrost Provider.Preprod "blockfrost-key" mismatchBlockfrostAddress (success body)
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Preprod "blockfrost-key" [ stub ] discovery
  assertAbsent "withdrawal mismatched (Blockfrost)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal mismatched (Blockfrost)" outcome.resolved "\"code\":\"WITHDRAWAL_MISMATCHED\""

mismatchKoiosHash :: String
mismatchKoiosHash = "dadadadadadadadadadadadadadadadadadadadadadadadadadadada"

mismatchKoiosHex :: String
mismatchKoiosHex = "f1" <> mismatchKoiosHash

mismatchKoiosAddress :: String
mismatchKoiosAddress = "stake178dd4kk6mtdd4kk6mtdd4kk6mtdd4kk6mtdd4kk6mtdd4ks7kpmxw"

assertWithdrawalMismatchedKoios :: Aff Unit
assertWithdrawalMismatchedKoios = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "script", hash: mismatchKoiosHash, hex: mismatchKoiosHex } ])
    body = "[{\"stake_address\":\"" <> thirdAccountAddress <> "\",\"status\":\"registered\",\"rewards_available\":\"500\"}]"
    stub = accountStub Provider.Koios Provider.Mainnet "koios-token" mismatchKoiosAddress (success body)
  outcome <- resolveWithdrawals Provider.Koios Provider.Mainnet "koios-token" [ stub ] discovery
  assertAbsent "withdrawal mismatched (Koios)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal mismatched (Koios)" outcome.resolved "\"code\":\"WITHDRAWAL_MISMATCHED\""

duplicateKoiosHash :: String
duplicateKoiosHash = "dcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdc"

duplicateKoiosHex :: String
duplicateKoiosHex = "f0" <> duplicateKoiosHash

duplicateKoiosAddress :: String
duplicateKoiosAddress = "stake_test17rwdehxumnwdehxumnwdehxumnwdehxumnwdehxumnwdehqkzk7m9"

assertWithdrawalDuplicateRowsKoios :: Aff Unit
assertWithdrawalDuplicateRowsKoios = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "script", hash: duplicateKoiosHash, hex: duplicateKoiosHex } ])
    row = "{\"stake_address\":\"" <> duplicateKoiosAddress <> "\",\"status\":\"registered\",\"rewards_available\":\"500\"}"
    body = "[" <> row <> "," <> row <> "]"
    stub = accountStub Provider.Koios Provider.Preprod "koios-token" duplicateKoiosAddress (success body)
  outcome <- resolveWithdrawals Provider.Koios Provider.Preprod "koios-token" [ stub ] discovery
  assertAbsent "withdrawal duplicate rows (Koios)" outcome.resolved "\"cert_state\""
  assertContains "withdrawal duplicate rows (Koios)" outcome.resolved "\"code\":\"WITHDRAWAL_DUPLICATE\""

partialOkHash :: String
partialOkHash = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddd"

partialOkHex :: String
partialOkHex = "e1" <> partialOkHash

partialOkAddress :: String
partialOkAddress = "stake1u8wamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhgg4zkwc"

partialFailHash :: String
partialFailHash = "dededededededededededededededededededededededededededede"

partialFailHex :: String
partialFailHex = "e1" <> partialFailHash

partialFailAddress :: String
partialFailAddress = "stake1u80dahk7mm0dahk7mm0dahk7mm0dahk7mm0dahk7mm0dahsmm7zf5"

assertWithdrawalPartialFailureOmitsCertState :: Aff Unit
assertWithdrawalPartialFailureOmitsCertState = do
  let
    discovery = compositeEnvelope emptyInspectionJson
      ( intentWithWithdrawals
          [ { kind: "key", hash: partialOkHash, hex: partialOkHex }
          , { kind: "key", hash: partialFailHash, hex: partialFailHex }
          ]
      )
    stubs =
      [ accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" partialOkAddress (success (accountResponseBody Provider.Blockfrost partialOkAddress true "700000"))
      , accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" partialFailAddress (success (accountResponseBody Provider.Blockfrost partialFailAddress false "0"))
      ]
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" stubs discovery
  assertAbsent "withdrawal partial failure" outcome.resolved "\"cert_state\""
  assertContains "withdrawal partial failure" outcome.resolved "\"requested_count\":2"
  assertContains "withdrawal partial failure" outcome.resolved "\"resolved_count\":1"
  assertContains "withdrawal partial failure" outcome.resolved "\"code\":\"WITHDRAWAL_UNREGISTERED\""

authFailHash :: String
authFailHash = "dfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdfdf"

authFailHex :: String
authFailHex = "e1" <> authFailHash

authFailAddress :: String
authFailAddress = "stake1u80alh7lml0alh7lml0alh7lml0alh7lml0alh7lml0alhctwug05"

rateLimitHash :: String
rateLimitHash = "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"

rateLimitHex :: String
rateLimitHex = "e1" <> rateLimitHash

rateLimitAddress :: String
rateLimitAddress = "stake1u8s7rc0pu8s7rc0pu8s7rc0pu8s7rc0pu8s7rc0pu8s7rcgmptrah"

serverFailHash :: String
serverFailHash = "e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"

serverFailHex :: String
serverFailHex = "e1" <> serverFailHash

serverFailAddress :: String
serverFailAddress = "stake1u83w9chzut3w9chzut3w9chzut3w9chzut3w9chzut3w9csg0hh6m"

transportFailHash :: String
transportFailHash = "e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3"

transportFailHex :: String
transportFailHex = "e1" <> transportFailHash

transportFailAddress :: String
transportFailAddress = "stake1u8378clru0378clru0378clru0378clru0378clru0378ccc64aum"

koiosAuthFailHash :: String
koiosAuthFailHash = "f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2"

koiosAuthFailHex :: String
koiosAuthFailHex = "e1" <> koiosAuthFailHash

koiosAuthFailAddress :: String
koiosAuthFailAddress = "stake1u8e09uhj7te09uhj7te09uhj7te09uhj7te09uhj7te09usnux342"

koiosRateLimitHash :: String
koiosRateLimitHash = "f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3"

koiosRateLimitHex :: String
koiosRateLimitHex = "e1" <> koiosRateLimitHash

koiosRateLimitAddress :: String
koiosRateLimitAddress = "stake1u8el8uln70el8uln70el8uln70el8uln70el8uln70el8ucrfymn2"

koiosServerFailHash :: String
koiosServerFailHash = "f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4"

koiosServerFailHex :: String
koiosServerFailHex = "e1" <> koiosServerFailHash

koiosServerFailAddress :: String
koiosServerFailAddress = "stake1u860fa857n60fa857n60fa857n60fa857n60fa857n60faquzmkvu"

koiosTransportFailHash :: String
koiosTransportFailHash = "f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5"

koiosTransportFailHex :: String
koiosTransportFailHex = "e1" <> koiosTransportFailHash

koiosTransportFailAddress :: String
koiosTransportFailAddress = "stake1u86lta047h6lta047h6lta047h6lta047h6lta047h6ltagvheu2u"

assertWithdrawalProviderTransportFailures :: Aff Unit
assertWithdrawalProviderTransportFailures = do
  assertWithdrawalTransportFailure Provider.Blockfrost "blockfrost-key" "authentication" authFailHash authFailHex authFailAddress (status 401 "denied") "PROVIDER_AUTHENTICATION"
  assertWithdrawalTransportFailure Provider.Blockfrost "blockfrost-key" "rate limit" rateLimitHash rateLimitHex rateLimitAddress (status 429 "slow down") "PROVIDER_RATE_LIMIT"
  assertWithdrawalTransportFailure Provider.Blockfrost "blockfrost-key" "server" serverFailHash serverFailHex serverFailAddress (status 503 "unavailable") "PROVIDER_SERVER"
  assertWithdrawalTransportFailure Provider.Blockfrost "blockfrost-key" "transport" transportFailHash transportFailHex transportFailAddress (Left "network rejected") "PROVIDER_TRANSPORT"
  assertWithdrawalTransportFailure Provider.Koios "koios-token" "authentication" koiosAuthFailHash koiosAuthFailHex koiosAuthFailAddress (status 401 "denied") "PROVIDER_AUTHENTICATION"
  assertWithdrawalTransportFailure Provider.Koios "koios-token" "rate limit" koiosRateLimitHash koiosRateLimitHex koiosRateLimitAddress (status 429 "slow down") "PROVIDER_RATE_LIMIT"
  assertWithdrawalTransportFailure Provider.Koios "koios-token" "server" koiosServerFailHash koiosServerFailHex koiosServerFailAddress (status 503 "unavailable") "PROVIDER_SERVER"
  assertWithdrawalTransportFailure Provider.Koios "koios-token" "transport" koiosTransportFailHash koiosTransportFailHex koiosTransportFailAddress (Left "network rejected") "PROVIDER_TRANSPORT"

assertWithdrawalTransportFailure :: Provider.Provider -> String -> String -> String -> String -> String -> Either String Provider.HttpResponse -> String -> Aff Unit
assertWithdrawalTransportFailure provider credential label hash hex stakeAddress response expectedCode = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash, hex } ])
    stub = accountStub provider Provider.Mainnet credential stakeAddress response
  outcome <- resolveWithdrawals provider Provider.Mainnet credential [ stub ] discovery
  assertAbsent (Provider.providerName provider <> " withdrawal " <> label <> " failure") outcome.resolved "\"cert_state\""
  assertContains (Provider.providerName provider <> " withdrawal " <> label <> " failure") outcome.resolved ("\"code\":\"" <> expectedCode <> "\"")

redactHash :: String
redactHash = "e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4"

redactHex :: String
redactHex = "e1" <> redactHash

redactAddress :: String
redactAddress = "stake1u8jwfe8yunjwfe8yunjwfe8yunjwfe8yunjwfe8yunjwfeq832srd"

koiosRedactHash :: String
koiosRedactHash = "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6"

koiosRedactHex :: String
koiosRedactHex = "e1" <> koiosRedactHash

koiosRedactAddress :: String
koiosRedactAddress = "stake1u8m0dahk7mm0dahk7mm0dahk7mm0dahk7mm0dahk7mm0dasle9gds"

assertWithdrawalCredentialRedaction :: Aff Unit
assertWithdrawalCredentialRedaction = do
  let
    discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: redactHash, hex: redactHex } ])
    stub = accountStub Provider.Blockfrost Provider.Mainnet "blockfrost-key" redactAddress (status 503 "unavailable blockfrost-key")
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" [ stub ] discovery
  assertAbsent "withdrawal credential redaction (Blockfrost)" outcome.resolved "blockfrost-key"
  let
    koiosDiscovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [ { kind: "key", hash: koiosRedactHash, hex: koiosRedactHex } ])
    koiosStub = accountStub Provider.Koios Provider.Mainnet "koios-token" koiosRedactAddress (status 503 "unavailable koios-token")
  koiosOutcome <- resolveWithdrawals Provider.Koios Provider.Mainnet "koios-token" [ koiosStub ] koiosDiscovery
  assertAbsent "withdrawal credential redaction (Koios)" koiosOutcome.resolved "koios-token"

assertWithdrawalLegacyInspectionCompatibility :: Aff Unit
assertWithdrawalLegacyInspectionCompatibility = do
  resolved <- Provider.resolveProducerTxContextWith completeContextTransport Provider.Blockfrost Provider.Mainnet "blockfrost-key" true inspectionWithTwoInputs
  assertAbsent "legacy inspection-only input" resolved "\"cert_state\""

assertWithdrawalNoWithdrawalsCompatibility :: Aff Unit
assertWithdrawalNoWithdrawalsCompatibility = do
  let discovery = compositeEnvelope emptyInspectionJson (intentWithWithdrawals [])
  outcome <- resolveWithdrawals Provider.Blockfrost Provider.Mainnet "blockfrost-key" [] discovery
  if outcome.callCount == 0 then pure unit else fail ("no-withdrawal transaction reached the account endpoint " <> show outcome.callCount <> " times")
  assertAbsent "no withdrawals" outcome.resolved "\"cert_state\""

assertAbsent :: String -> String -> String -> Aff Unit
assertAbsent label value forbidden =
  if StringCodeUnits.contains (String.Pattern forbidden) value then fail (label <> " unexpectedly retained " <> forbidden) else pure unit

type AccountStub = { request :: Provider.HttpRequest, response :: Either String Provider.HttpResponse }

accountStub :: Provider.Provider -> Provider.Network -> String -> String -> Either String Provider.HttpResponse -> AccountStub
accountStub provider network credential stakeAddress response =
  { request: expectedAccountRequest provider network credential stakeAddress, response }

resolveWithdrawals :: Provider.Provider -> Provider.Network -> String -> Array AccountStub -> String -> Aff { resolved :: String, callCount :: Int }
resolveWithdrawals provider network credential stubs discovery = do
  calls <- liftEffect (Ref.new 0)
  resolved <- Provider.resolveProducerTxContextWith (withdrawalTransport provider calls stubs) provider network credential true discovery
  callCount <- liftEffect (Ref.read calls)
  pure { resolved, callCount }

withdrawalTransport :: Provider.Provider -> Ref.Ref Int -> Array AccountStub -> Provider.Transport
withdrawalTransport provider calls stubs request
  | isContextRequest provider request = pure (contextCannedResponse provider request)
  | otherwise = case Array.find (\stub -> matchesRequest stub.request request) stubs of
      Just stub -> do
        liftEffect (Ref.modify_ (_ + 1) calls)
        pure stub.response
      Nothing -> pure (Left ("unexpected account request: " <> request.method <> " " <> request.url))

matchesRequest :: Provider.HttpRequest -> Provider.HttpRequest -> Boolean
matchesRequest expected actual =
  expected.url == actual.url && expected.method == actual.method && expected.headers == actual.headers && expected.body == actual.body

isContextRequest :: Provider.Provider -> Provider.HttpRequest -> Boolean
isContextRequest Provider.Blockfrost request =
  StringCodeUnits.contains (String.Pattern "/blocks/latest") request.url || StringCodeUnits.contains (String.Pattern "/epochs/latest/parameters") request.url
isContextRequest Provider.Koios request =
  StringCodeUnits.contains (String.Pattern "/tip") request.url || StringCodeUnits.contains (String.Pattern "/cli_protocol_params") request.url

contextCannedResponse :: Provider.Provider -> Provider.HttpRequest -> Either String Provider.HttpResponse
contextCannedResponse Provider.Blockfrost request
  | StringCodeUnits.contains (String.Pattern "/blocks/latest") request.url = success "{\"slot\":42,\"epoch\":9}"
  | otherwise = success "{\"min_fee_a\":44,\"protocol_major_ver\":9,\"protocol_minor_ver\":0}"
contextCannedResponse Provider.Koios request
  | StringCodeUnits.contains (String.Pattern "/tip") request.url = success "[{\"abs_slot\":42,\"epoch_no\":9}]"
  | otherwise = success "[{\"minFeeA\":44}]"

blockfrostAccountBase :: Provider.Network -> String
blockfrostAccountBase = case _ of
  Provider.Mainnet -> "https://cardano-mainnet.blockfrost.io/api/v0"
  Provider.Preprod -> "https://cardano-preprod.blockfrost.io/api/v0"
  Provider.Preview -> "https://cardano-preview.blockfrost.io/api/v0"

koiosAccountBase :: Provider.Network -> String
koiosAccountBase = case _ of
  Provider.Mainnet -> "https://api.koios.rest/api/v1"
  Provider.Preprod -> "https://preprod.koios.rest/api/v1"
  Provider.Preview -> "https://preview.koios.rest/api/v1"

koiosAccountHeaders :: String -> Array { name :: String, value :: String }
koiosAccountHeaders credential
  | credential == "" = [ { name: "Content-Type", value: "application/json" } ]
  | otherwise = [ { name: "Content-Type", value: "application/json" }, { name: "Authorization", value: "Bearer " <> credential } ]

expectedAccountRequest :: Provider.Provider -> Provider.Network -> String -> String -> Provider.HttpRequest
expectedAccountRequest provider network credential stakeAddress = case provider of
  Provider.Blockfrost -> { url: blockfrostAccountBase network <> "/accounts/" <> stakeAddress, method: "GET", headers: [ { name: "project_id", value: credential } ], body: Nothing }
  Provider.Koios -> { url: koiosAccountBase network <> "/account_info", method: "POST", headers: koiosAccountHeaders credential, body: Just { encoding: "text", value: "{\"_stake_addresses\":[\"" <> stakeAddress <> "\"]}" } }

accountResponseBody :: Provider.Provider -> String -> Boolean -> String -> String
accountResponseBody Provider.Blockfrost stakeAddress registered balance =
  "{\"stake_address\":\"" <> stakeAddress <> "\",\"registered\":" <> (if registered then "true" else "false") <> ",\"withdrawable_amount\":\"" <> balance <> "\"}"
accountResponseBody Provider.Koios stakeAddress registered balance =
  "[{\"stake_address\":\"" <> stakeAddress <> "\",\"status\":\"" <> (if registered then "registered" else "not_registered") <> "\",\"rewards_available\":\"" <> balance <> "\"}]"

emptyInspectionJson :: String
emptyInspectionJson = "{\"inspection\":{\"inputs\":[],\"reference_inputs\":[]}}"

compositeEnvelope :: String -> String -> String
compositeEnvelope inspectionJson intentJson = "{\"inspection_response\":" <> inspectionJson <> ",\"intent_response\":" <> intentJson <> "}"

intentWithWithdrawals :: Array { kind :: String, hash :: String, hex :: String } -> String
intentWithWithdrawals withdrawals = "{\"intent\":{\"withdrawals\":[" <> String.joinWith "," (map withdrawalJson withdrawals) <> "]}}"

withdrawalJson :: { kind :: String, hash :: String, hex :: String } -> String
withdrawalJson w = "{\"credential\":{\"kind\":\"" <> w.kind <> "\",\"hash\":\"" <> w.hash <> "\"},\"reward_account_hex\":\"" <> w.hex <> "\"}"

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
