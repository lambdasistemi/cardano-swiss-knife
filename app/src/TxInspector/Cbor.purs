module TxInspector.Cbor
  ( PatchResult
  , patchSignedTxCbor
  ) where

import Prelude

import Cardano.Address.Hex as Hex
import Data.Array as Array
import Data.ArrayBuffer.Types (Uint8Array)
import Data.Either (Either(..))
import Data.Foldable (fold, foldMap)
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits as CodeUnits
import Data.Tuple (Tuple(..))

type PatchResult =
  { signedTxCborHex :: String
  , witnessPatchAction :: String
  }

data Cbor
  = CborScalar String
  | CborBytes String
  | CborText String
  | CborArray (Array Cbor)
  | CborMap (Array (Tuple Cbor Cbor))
  | CborTag String Cbor

data DecodedItem
  = DecodedValue Cbor
  | DecodedBreak

type DecodeResult =
  { item :: DecodedItem
  , cursor :: Int
  }

type LengthResult =
  { valueLength :: Maybe Int
  , cursor :: Int
  }

type WitnessCollection =
  { witnesses :: Array Cbor
  , wrap :: Array Cbor -> Cbor
  }

foreign import encodeUtf8HexImpl :: String -> String

patchSignedTxCbor :: String -> String -> Either String PatchResult
patchSignedTxCbor txCborHex witnessCborHex = do
  normalizedTx <- normalizeHex "transaction" txCborHex
  normalizedWitness <- normalizeHex "generated vkey witness" witnessCborHex
  tx <- decodeSingle normalizedTx
  witness <- decodeSingle normalizedWitness

  txArray <- expectArray tx "Expected the transaction to decode as a CBOR array."
  txWitnessSet <- case Array.index txArray 1 of
    Just value -> pure value
    Nothing -> Left "Expected the transaction array to contain a witness set."

  witnessSetEntries <- expectMap
    txWitnessSet
    "Expected the transaction witness set to decode as a CBOR map."

  witnessTuple <- expectArray
    witness
    "Expected the generated vkey witness to decode as a 2-element CBOR array."

  if Array.length witnessTuple /= 2 then
    Left "Expected the generated vkey witness to contain key and signature bytes."
  else do
    witnessKeyHex <- case Array.index witnessTuple 0 of
      Just value ->
        expectBytes
          value
          "Expected the generated witness verification key to decode as bytes."
      Nothing ->
        Left "Expected the generated witness verification key to decode as bytes."

    _ <- case Array.index witnessTuple 1 of
      Just value ->
        expectBytes
          value
          "Expected the generated witness signature to decode as bytes."
      Nothing ->
        Left "Expected the generated witness signature to decode as bytes."

    let
      vkeyEntryIndex = Array.findIndex (isVkeyWitnessEntry <<< (\(Tuple key _) -> key)) witnessSetEntries

    { updatedWitnessSetEntries, witnessPatchAction } <- case vkeyEntryIndex of
      Nothing ->
        pure
          { updatedWitnessSetEntries:
              [ Tuple (CborScalar "00") (CborArray [ witness ]) ] <> witnessSetEntries
          , witnessPatchAction: "inserted"
          }
      Just entryIndex -> do
        Tuple entryKey entryValue <- case Array.index witnessSetEntries entryIndex of
          Just entry -> pure entry
          Nothing -> Left "Failed to locate the vkey witness collection."

        { witnesses, wrap } <- normalizeWitnessCollection entryValue

        let
          existingIndex =
            Array.findIndex (candidateHasWitnessKey witnessKeyHex) witnesses

        let
          nextWitnesses = case existingIndex of
            Just witnessIndex ->
              case Array.updateAt witnessIndex witness witnesses of
                Just replaced -> replaced
                Nothing -> witnesses
            Nothing ->
              Array.snoc witnesses witness

          action = case existingIndex of
            Just _ -> "replaced"
            Nothing -> "inserted"

          nextEntries = case Array.updateAt entryIndex (Tuple entryKey (wrap nextWitnesses)) witnessSetEntries of
            Just replaced -> replaced
            Nothing -> witnessSetEntries

        pure
          { updatedWitnessSetEntries: nextEntries
          , witnessPatchAction: action
          }

    updatedTxArray <- case Array.updateAt 1 (CborMap updatedWitnessSetEntries) txArray of
      Just next -> pure next
      Nothing -> Left "Failed to write the patched witness set back into the transaction."

    pure
      { signedTxCborHex: encodeItem (CborArray updatedTxArray)
      , witnessPatchAction
      }

normalizeHex :: String -> String -> Either String String
normalizeHex label value =
  case Hex.fromHex value of
    Left _ -> Left ("Expected canonical " <> label <> " CBOR encoded as hex.")
    Right bytes -> Right (Hex.toHex bytes)

decodeSingle :: String -> Either String Cbor
decodeSingle hex = do
  decoded <- decodeItem hex 0
  case decoded.item of
    DecodedBreak ->
      Left "Unexpected CBOR break marker."
    DecodedValue value ->
      if decoded.cursor == CodeUnits.length hex then
        pure value
      else
        Left "Unconsumed bytes remaining after CBOR decode."

decodeItem :: String -> Int -> Either String DecodeResult
decodeItem hex cursor = do
  { byte: initial, cursor: afterInitial } <- readByte hex cursor
  let major = div initial 32
  let additional = mod initial 32

  if major == 7 && additional == 31 then
    pure { item: DecodedBreak, cursor: afterInitial }
  else
    case major of
      0 -> decodeScalar hex cursor afterInitial additional
      1 -> decodeScalar hex cursor afterInitial additional
      2 -> decodeByteString hex afterInitial additional
      3 -> decodeTextString hex afterInitial additional
      4 -> decodeArray hex afterInitial additional
      5 -> decodeMap hex afterInitial additional
      6 -> decodeTag hex cursor afterInitial additional
      7 -> decodeSimple hex cursor additional afterInitial
      _ -> Left ("Unsupported CBOR major type: " <> show major)

decodeScalar :: String -> Int -> Int -> Int -> Either String DecodeResult
decodeScalar hex itemStart cursor additional = do
  end <- advanceAdditionalCursor hex cursor additional
  pure
    { item: DecodedValue (CborScalar (CodeUnits.slice itemStart end hex))
    , cursor: end
    }

decodeByteString :: String -> Int -> Int -> Either String DecodeResult
decodeByteString hex cursor additional = do
  lengthResult <- readLengthValue hex cursor additional
  case lengthResult.valueLength of
    Nothing -> do
      { chunks, cursor: end } <- decodeIndefiniteBytes hex lengthResult.cursor []
      pure
        { item: DecodedValue (CborBytes (fold chunks))
        , cursor: end
        }
    Just byteCount -> do
      end <- advanceByteCount hex lengthResult.cursor byteCount "Unexpected end of CBOR byte string."
      pure
        { item: DecodedValue (CborBytes (CodeUnits.slice lengthResult.cursor end hex))
        , cursor: end
        }

decodeTextString :: String -> Int -> Int -> Either String DecodeResult
decodeTextString hex cursor additional = do
  lengthResult <- readLengthValue hex cursor additional
  case lengthResult.valueLength of
    Nothing -> do
      { chunks, cursor: end } <- decodeIndefiniteText hex lengthResult.cursor []
      pure
        { item: DecodedValue (CborText (fold chunks))
        , cursor: end
        }
    Just byteCount -> do
      end <- advanceByteCount hex lengthResult.cursor byteCount "Unexpected end of CBOR text string."
      chunkBytes <- expectCanonicalHex "CBOR text string chunk" (CodeUnits.slice lengthResult.cursor end hex)
      pure
        { item: DecodedValue (CborText (Hex.decodeUtf8 chunkBytes))
        , cursor: end
        }

decodeArray :: String -> Int -> Int -> Either String DecodeResult
decodeArray hex cursor additional = do
  lengthResult <- readLengthValue hex cursor additional
  case lengthResult.valueLength of
    Nothing -> do
      { items, cursor: end } <- decodeIndefiniteArray hex lengthResult.cursor []
      pure
        { item: DecodedValue (CborArray items)
        , cursor: end
        }
    Just itemCount -> do
      { items, cursor: end } <- decodeFixedArray hex lengthResult.cursor itemCount []
      pure
        { item: DecodedValue (CborArray items)
        , cursor: end
        }

decodeMap :: String -> Int -> Int -> Either String DecodeResult
decodeMap hex cursor additional = do
  lengthResult <- readLengthValue hex cursor additional
  case lengthResult.valueLength of
    Nothing -> do
      { entries, cursor: end } <- decodeIndefiniteMap hex lengthResult.cursor []
      pure
        { item: DecodedValue (CborMap entries)
        , cursor: end
        }
    Just entryCount -> do
      { entries, cursor: end } <- decodeFixedMap hex lengthResult.cursor entryCount []
      pure
        { item: DecodedValue (CborMap entries)
        , cursor: end
        }

decodeTag :: String -> Int -> Int -> Int -> Either String DecodeResult
decodeTag hex itemStart cursor additional = do
  tagEnd <- advanceAdditionalCursor hex cursor additional
  inner <- decodeItem hex tagEnd
  case inner.item of
    DecodedBreak ->
      Left "Unexpected CBOR break marker after tag."
    DecodedValue value ->
      pure
        { item: DecodedValue (CborTag (CodeUnits.slice itemStart tagEnd hex) value)
        , cursor: inner.cursor
        }

decodeSimple :: String -> Int -> Int -> Int -> Either String DecodeResult
decodeSimple hex itemStart additional cursor = case additional of
  20 -> scalar
  21 -> scalar
  22 -> scalar
  23 -> scalar
  _ -> Left ("Unsupported CBOR simple value: " <> show additional)
  where
  scalar =
    pure
      { item: DecodedValue (CborScalar (CodeUnits.slice itemStart cursor hex))
      , cursor
      }

decodeFixedArray
  :: String
  -> Int
  -> Int
  -> Array Cbor
  -> Either String { items :: Array Cbor, cursor :: Int }
decodeFixedArray _ cursor 0 items =
  pure { items, cursor }
decodeFixedArray hex cursor remaining items = do
  decoded <- decodeItem hex cursor
  case decoded.item of
    DecodedBreak ->
      Left "Unexpected break marker inside a fixed-length CBOR array."
    DecodedValue value ->
      decodeFixedArray hex decoded.cursor (remaining - 1) (Array.snoc items value)

decodeIndefiniteArray
  :: String
  -> Int
  -> Array Cbor
  -> Either String { items :: Array Cbor, cursor :: Int }
decodeIndefiniteArray hex cursor items = do
  decoded <- decodeItem hex cursor
  case decoded.item of
    DecodedBreak ->
      pure { items, cursor: decoded.cursor }
    DecodedValue value ->
      decodeIndefiniteArray hex decoded.cursor (Array.snoc items value)

decodeFixedMap
  :: String
  -> Int
  -> Int
  -> Array (Tuple Cbor Cbor)
  -> Either String { entries :: Array (Tuple Cbor Cbor), cursor :: Int }
decodeFixedMap _ cursor 0 entries =
  pure { entries, cursor }
decodeFixedMap hex cursor remaining entries = do
  { entry, cursor: nextCursor } <- decodeMapEntry hex cursor
  decodeFixedMap hex nextCursor (remaining - 1) (Array.snoc entries entry)

decodeIndefiniteMap
  :: String
  -> Int
  -> Array (Tuple Cbor Cbor)
  -> Either String { entries :: Array (Tuple Cbor Cbor), cursor :: Int }
decodeIndefiniteMap hex cursor entries = do
  decodedKey <- decodeItem hex cursor
  case decodedKey.item of
    DecodedBreak ->
      pure { entries, cursor: decodedKey.cursor }
    DecodedValue key -> do
      decodedValue <- decodeItem hex decodedKey.cursor
      case decodedValue.item of
        DecodedBreak ->
          Left "Unexpected break marker inside an indefinite-length CBOR map."
        DecodedValue value ->
          decodeIndefiniteMap
            hex
            decodedValue.cursor
            (Array.snoc entries (Tuple key value))

decodeMapEntry
  :: String
  -> Int
  -> Either String { entry :: Tuple Cbor Cbor, cursor :: Int }
decodeMapEntry hex cursor = do
  decodedKey <- decodeItem hex cursor
  key <- case decodedKey.item of
    DecodedBreak ->
      Left "Unexpected break marker inside a fixed-length CBOR map."
    DecodedValue value ->
      pure value

  decodedValue <- decodeItem hex decodedKey.cursor
  value <- case decodedValue.item of
    DecodedBreak ->
      Left "Unexpected break marker inside a fixed-length CBOR map."
    DecodedValue item ->
      pure item

  pure
    { entry: Tuple key value
    , cursor: decodedValue.cursor
    }

decodeIndefiniteBytes
  :: String
  -> Int
  -> Array String
  -> Either String { chunks :: Array String, cursor :: Int }
decodeIndefiniteBytes hex cursor chunks = do
  decoded <- decodeItem hex cursor
  case decoded.item of
    DecodedBreak ->
      pure { chunks, cursor: decoded.cursor }
    DecodedValue value -> case value of
      CborBytes chunk ->
        decodeIndefiniteBytes hex decoded.cursor (Array.snoc chunks chunk)
      _ ->
        Left "Invalid indefinite byte string chunk."

decodeIndefiniteText
  :: String
  -> Int
  -> Array String
  -> Either String { chunks :: Array String, cursor :: Int }
decodeIndefiniteText hex cursor chunks = do
  decoded <- decodeItem hex cursor
  case decoded.item of
    DecodedBreak ->
      pure { chunks, cursor: decoded.cursor }
    DecodedValue value -> case value of
      CborText chunk ->
        decodeIndefiniteText hex decoded.cursor (Array.snoc chunks chunk)
      _ ->
        Left "Invalid indefinite text string chunk."

readLengthValue :: String -> Int -> Int -> Either String LengthResult
readLengthValue hex cursor additional
  | additional < 24 =
      pure { valueLength: Just additional, cursor }
  | additional == 24 = do
      { byte, cursor: nextCursor } <- readByte hex cursor
      pure { valueLength: Just byte, cursor: nextCursor }
  | additional == 25 = do
      { bytes, cursor: nextCursor } <- readBytes hex cursor 2
      valueLength <- decodeTwoBytes bytes
      pure { valueLength: Just valueLength, cursor: nextCursor }
  | additional == 26 = do
      { bytes, cursor: nextCursor } <- readBytes hex cursor 4
      valueLength <- decodeFourBytes bytes
      pure { valueLength: Just valueLength, cursor: nextCursor }
  | additional == 27 = do
      { bytes, cursor: nextCursor } <- readBytes hex cursor 8
      valueLength <- decodeEightByteLength bytes
      pure { valueLength: Just valueLength, cursor: nextCursor }
  | additional == 31 =
      pure { valueLength: Nothing, cursor }
  | otherwise =
      Left ("Unsupported CBOR additional info: " <> show additional)

advanceAdditionalCursor :: String -> Int -> Int -> Either String Int
advanceAdditionalCursor hex cursor additional
  | additional < 24 = pure cursor
  | additional == 24 = advanceByteCount hex cursor 1 "Unexpected end of CBOR input."
  | additional == 25 = advanceByteCount hex cursor 2 "Unexpected end of CBOR input."
  | additional == 26 = advanceByteCount hex cursor 4 "Unexpected end of CBOR input."
  | additional == 27 = advanceByteCount hex cursor 8 "Unexpected end of CBOR input."
  | otherwise = Left ("Unsupported CBOR additional info: " <> show additional)

readByte :: String -> Int -> Either String { byte :: Int, cursor :: Int }
readByte hex cursor = do
  nextCursor <- advanceHexCursor hex cursor 2 "Unexpected end of CBOR input."
  let chunk = CodeUnits.slice cursor nextCursor hex
  case Int.fromStringAs Int.hexadecimal chunk of
    Just byte ->
      pure { byte, cursor: nextCursor }
    Nothing ->
      Left "Encountered invalid hexadecimal while decoding CBOR."

readBytes
  :: String
  -> Int
  -> Int
  -> Either String { bytes :: Array Int, cursor :: Int }
readBytes _ cursor 0 =
  pure { bytes: [], cursor }
readBytes hex cursor remaining = do
  { byte, cursor: nextCursor } <- readByte hex cursor
  { bytes, cursor: endCursor } <- readBytes hex nextCursor (remaining - 1)
  pure
    { bytes: [ byte ] <> bytes
    , cursor: endCursor
    }

advanceByteCount :: String -> Int -> Int -> String -> Either String Int
advanceByteCount hex cursor byteCount message =
  advanceHexCursor hex cursor (byteCount * 2) message

advanceHexCursor :: String -> Int -> Int -> String -> Either String Int
advanceHexCursor hex cursor width message =
  let
    nextCursor = cursor + width
  in
    if nextCursor <= CodeUnits.length hex then
      Right nextCursor
    else
      Left message

decodeTwoBytes :: Array Int -> Either String Int
decodeTwoBytes bytes = case bytes of
  [ high, low ] -> Right (high * 256 + low)
  _ -> Left "Failed to decode a 2-byte CBOR length."

decodeFourBytes :: Array Int -> Either String Int
decodeFourBytes bytes = case bytes of
  [ b0, b1, b2, b3 ] ->
    Right ((((b0 * 256) + b1) * 256 + b2) * 256 + b3)
  _ -> Left "Failed to decode a 4-byte CBOR length."

decodeEightByteLength :: Array Int -> Either String Int
decodeEightByteLength bytes = case bytes of
  [ 0, 0, 0, 0, b4, b5, b6, b7 ] ->
    decodeFourBytes [ b4, b5, b6, b7 ]
  _ ->
    Left "CBOR lengths above 32 bits are not supported."

expectCanonicalHex :: String -> String -> Either String Uint8Array
expectCanonicalHex label raw = case Hex.fromHex raw of
  Left _ -> Left ("Invalid " <> label <> ".")
  Right bytes -> Right bytes

expectArray :: Cbor -> String -> Either String (Array Cbor)
expectArray value message = case value of
  CborArray items -> Right items
  _ -> Left message

expectBytes :: Cbor -> String -> Either String String
expectBytes value message = case value of
  CborBytes bytes -> Right bytes
  _ -> Left message

expectMap :: Cbor -> String -> Either String (Array (Tuple Cbor Cbor))
expectMap value message = case value of
  CborMap entries -> Right entries
  _ -> Left message

normalizeWitnessCollection :: Cbor -> Either String WitnessCollection
normalizeWitnessCollection value = case value of
  CborArray witnesses ->
    Right { witnesses, wrap: CborArray }
  CborTag rawHead (CborArray witnesses) ->
    Right { witnesses, wrap: CborTag rawHead <<< CborArray }
  _ ->
    Left "Expected the vkey witness collection to be a CBOR array."

isVkeyWitnessEntry :: Cbor -> Boolean
isVkeyWitnessEntry (CborScalar "00") = true
isVkeyWitnessEntry _ = false

candidateHasWitnessKey :: String -> Cbor -> Boolean
candidateHasWitnessKey witnessKeyHex value = case value of
  CborArray candidate ->
    case Array.index candidate 0 of
      Just (CborBytes candidateKeyHex) -> candidateKeyHex == witnessKeyHex
      _ -> false
  _ ->
    false

encodeItem :: Cbor -> String
encodeItem = case _ of
  CborScalar rawHex ->
    rawHex
  CborBytes bytesHex ->
    encodeUnsignedHead 2 (hexByteLength bytesHex) <> bytesHex
  CborText text ->
    let
      utf8Hex = encodeUtf8HexImpl text
    in
      encodeUnsignedHead 3 (hexByteLength utf8Hex) <> utf8Hex
  CborArray items ->
    encodeUnsignedHead 4 (Array.length items) <> foldMap encodeItem items
  CborMap entries ->
    encodeUnsignedHead 5 (Array.length entries) <>
      foldMap (\(Tuple key value) -> encodeItem key <> encodeItem value) entries
  CborTag rawHead value ->
    rawHead <> encodeItem value

encodeUnsignedHead :: Int -> Int -> String
encodeUnsignedHead major value
  | value < 24 =
      encodeByte (major * 32 + value)
  | value < 256 =
      encodeByte (major * 32 + 24) <> encodeByte value
  | value < 65536 =
      encodeByte (major * 32 + 25) <> encodeTwoByteValue value
  | otherwise =
      encodeByte (major * 32 + 26) <> encodeFourByteValue value

encodeTwoByteValue :: Int -> String
encodeTwoByteValue value =
  encodeByte (div value 256) <> encodeByte (mod value 256)

encodeFourByteValue :: Int -> String
encodeFourByteValue value =
  encodeByte (div value 16777216)
    <> encodeByte (mod (div value 65536) 256)
    <> encodeByte (mod (div value 256) 256)
    <>
      encodeByte (mod value 256)

encodeByte :: Int -> String
encodeByte value =
  let
    rendered = Int.toStringAs Int.hexadecimal value
  in
    if value < 16 then "0" <> rendered else rendered

hexByteLength :: String -> Int
hexByteLength bytesHex =
  div (CodeUnits.length bytesHex) 2
