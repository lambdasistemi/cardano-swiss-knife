# Changelog

## [0.1.2](https://github.com/lambdasistemi/cardano-swiss-knife/compare/v0.1.1...v0.1.2) (2026-07-23)


### Features

* add Cardano TextEnvelope codec ([06f399a](https://github.com/lambdasistemi/cardano-swiss-knife/commit/06f399ae3a55e7e3d478c205c081a4068ca7a994))
* add offline csk vault lifecycle ([4810b19](https://github.com/lambdasistemi/cardano-swiss-knife/commit/4810b197f56c01fb1a968bd756dc120ca1cdf856))
* **cli:** enrich local transactions through providers ([d8a641c](https://github.com/lambdasistemi/cardano-swiss-knife/commit/d8a641c131599f40aa8d31ab1fb1c8850700a76c))
* **cli:** expose completed-entry submission ([a1ea810](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a1ea810497963fd4830bbf1802955854ea86a2ff))
* **cli:** expose transaction inspection commands ([cdc38f1](https://github.com/lambdasistemi/cardano-swiss-knife/commit/cdc38f17a2f542a2551d5d5cca0fef470a9db31a))
* **cli:** expose witness and ledger commands ([ba4cd8e](https://github.com/lambdasistemi/cardano-swiss-knife/commit/ba4cd8e7c8fbacb5c27605d7348bc5766395258c))
* define portable age vault core ([390596c](https://github.com/lambdasistemi/cardano-swiss-knife/commit/390596c2503609b10642e76b9619ecd7d4bdffd0))
* **inspector:** classify bookable identifier kinds ([811f009](https://github.com/lambdasistemi/cardano-swiss-knife/commit/811f0099e7b0ff10f56d7dcbe96d91c12bbb1639))
* **inspector:** expose resolved transaction inputs ([3097974](https://github.com/lambdasistemi/cardano-swiss-knife/commit/30979742cfa69512b90c5f9af056c10be4a76bbb))
* **inspector:** render decoded auxiliary metadata ([727f6f6](https://github.com/lambdasistemi/cardano-swiss-knife/commit/727f6f6f5c70d5f01d624df2d5b29b63b85fe3b3))
* **inspector:** render shared ledger operations ([ab6985b](https://github.com/lambdasistemi/cardano-swiss-knife/commit/ab6985bfa5fdee780777ebbfaf1af222b3997c0d))
* move web vaults to portable age files ([05da35d](https://github.com/lambdasistemi/cardano-swiss-knife/commit/05da35da37b4567f573261c4517ff028bed3531b))
* **node:** enrich local transactions through providers ([8e5c133](https://github.com/lambdasistemi/cardano-swiss-knife/commit/8e5c133e200ddd3171a4693c304478f444b82573))
* **node:** expose offline transaction inspection ([f8df6ab](https://github.com/lambdasistemi/cardano-swiss-knife/commit/f8df6abcbc3f68467ea54363c6e2ff76283df0a2))
* **node:** publish typed API facade ([08c14d5](https://github.com/lambdasistemi/cardano-swiss-knife/commit/08c14d547a439c94e5b26d94717fa82c584cc593))
* **provider:** share transaction loading and context ([08479d2](https://github.com/lambdasistemi/cardano-swiss-knife/commit/08479d220d4ec6a95312bae7b79e1a76b318cfb6))
* **provider:** submit completed transaction entries ([4b351eb](https://github.com/lambdasistemi/cardano-swiss-knife/commit/4b351eb07192ba50d4127867473b600a66b8ecb7))
* **transaction:** add shared TxEntry domain ([4eb2a81](https://github.com/lambdasistemi/cardano-swiss-knife/commit/4eb2a816024e2b18228b9478c6e36fb55e439f52))
* **transaction:** attach vkey witnesses safely ([00c3fa0](https://github.com/lambdasistemi/cardano-swiss-knife/commit/00c3fa01a8f8482b3bfe8604f9c7772bcc518ad6))
* **transaction:** expose shared ledger operations ([50a8185](https://github.com/lambdasistemi/cardano-swiss-knife/commit/50a81857908f4c3b7f996ac0da55e86e79fbcd17))
* **transaction:** resolve inspection books ([5b61a74](https://github.com/lambdasistemi/cardano-swiss-knife/commit/5b61a742748fb8165921427592f427f69fa7f6ce))
* **web:** add IndexedDB transaction entry store ([4d1162b](https://github.com/lambdasistemi/cardano-swiss-knife/commit/4d1162bfdeadc3af1822923adaa68c48e6d821e2))
* **web:** collect workbench transaction witnesses ([d279ffc](https://github.com/lambdasistemi/cardano-swiss-knife/commit/d279ffcd14e56e37ef324b357971f31863da41bf))
* **web:** manage persistent transaction workbench entries ([106ff85](https://github.com/lambdasistemi/cardano-swiss-knife/commit/106ff8505bee37fb5fcb5f16b6c1bbc05943573c))
* **workbench:** confirm completed-entry submission ([999c783](https://github.com/lambdasistemi/cardano-swiss-knife/commit/999c78363adefc1df38b3ecc2654fa9bfaaf1359))


### Bug Fixes

* **book:** reject non-Amaru JSON fallback ([efe8e30](https://github.com/lambdasistemi/cardano-swiss-knife/commit/efe8e30ea72ffee28c804881dcf1b706a3fc42c4))
* **ci:** use committed transaction fixture in package smoke ([5eb79af](https://github.com/lambdasistemi/cardano-swiss-knife/commit/5eb79af2d9c616a500aacaab966f0b48e67c76de))
* **inspector:** dedupe serialized book prefixes ([288001d](https://github.com/lambdasistemi/cardano-swiss-knife/commit/288001d40e68fa87330c129ceda9d1aaed7c0ff7))
* **inspector:** restrict labels to bookable identifiers ([a31bd94](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a31bd94dbc4466d32de295af3436efda3cb342e2))
* **inspector:** show address identity when labeling ([4f2b44e](https://github.com/lambdasistemi/cardano-swiss-knife/commit/4f2b44e3b187c8f618d4e17fcce9ba3bf201e587))
* resolve withdrawal account state for validation ([#116](https://github.com/lambdasistemi/cardano-swiss-knife/issues/116)) ([9c668e5](https://github.com/lambdasistemi/cardano-swiss-knife/commit/9c668e51a1c0b6b1ddcd8a52f68a954df9f8509e))
* stabilize vault CLI terminal lifecycle ([8644ecf](https://github.com/lambdasistemi/cardano-swiss-knife/commit/8644ecf40141cd8cdcccc1d6986ce4fbb6477012))
* **vault:** restore reliable interactive passphrase prompts ([#119](https://github.com/lambdasistemi/cardano-swiss-knife/issues/119)) ([41a2429](https://github.com/lambdasistemi/cardano-swiss-knife/commit/41a2429b02c869a26b972980c24d1df3d922ea4e))


### Documentation

* authorize Book dependency lock closure ([cd1ea24](https://github.com/lambdasistemi/cardano-swiss-knife/commit/cd1ea24392bf6523c4161ef8ef748b6a78108715))
* authorize inspector dependency closure ([28dbc6c](https://github.com/lambdasistemi/cardano-swiss-knife/commit/28dbc6c6bba17fe10b180907a5b5096fa63f0d08))
* authorize portable API docs package ([0944e6e](https://github.com/lambdasistemi/cardano-swiss-knife/commit/0944e6e5ef0471e6197133c903d816a32d645e13))
* enforce shared provider responsibility boundary ([66356d8](https://github.com/lambdasistemi/cardano-swiss-knife/commit/66356d80002d0004e4b159f35f2b560c9d5bd7fb))
* fix property-suite reference target ([8e6adfc](https://github.com/lambdasistemi/cardano-swiss-knife/commit/8e6adfcb6f168b9a6234441794bcf8416b16f199))
* freeze merged workbench submission seam ([ac53565](https://github.com/lambdasistemi/cardano-swiss-knife/commit/ac53565079c1859e6f0f33500fe9295edd6cca33))
* **node:** document every public export ([5c876d1](https://github.com/lambdasistemi/cardano-swiss-knife/commit/5c876d171c2dc463e93eea8f7647520603adbb65))
* **node:** publish generated API reference ([33301a0](https://github.com/lambdasistemi/cardano-swiss-knife/commit/33301a02f763cfca2166b552a92afa3fbec2c2b5))
* plan Book PureScript port ([f40d621](https://github.com/lambdasistemi/cardano-swiss-knife/commit/f40d621b2f9c4d398776f44fe6fd9c188555e1ba))
* plan bundle JSON removal ([728fc20](https://github.com/lambdasistemi/cardano-swiss-knife/commit/728fc20b4a3e488abd2f4121c04f6a555004a27e))
* plan Node API reference documentation ([c14f9d9](https://github.com/lambdasistemi/cardano-swiss-knife/commit/c14f9d98c909a5bbb1036368723c0f01baa452b5))
* plan safe Amaru book import ([58757e5](https://github.com/lambdasistemi/cardano-swiss-knife/commit/58757e58066e2fbcb63e2e796ecdab10872e6781))
* **plan:** design address-first label view ([a728be4](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a728be43bb31fb6d1d029c650a83b9dde5db4143))
* sharpen API drift RED proof ([2d15acd](https://github.com/lambdasistemi/cardano-swiss-knife/commit/2d15acd417735ec7935dfe7f49363817d27a69fa))
* **spec:** define address-first labeling ([639dbba](https://github.com/lambdasistemi/cardano-swiss-knife/commit/639dbba2313e85112dd87cdff1c9be34149fbfc7))
* specify auxiliary metadata rendering ([94b3b91](https://github.com/lambdasistemi/cardano-swiss-knife/commit/94b3b9169f6f5f4b2f4778c5fbc1d9f130ddf017))
* specify bookable identifier restriction ([d9f085d](https://github.com/lambdasistemi/cardano-swiss-knife/commit/d9f085d7e3b723fc886e658eaf70c73cd8a18fdb))
* specify completed-entry provider submission ([a1c5657](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a1c5657dfa4aacbe1cf5f24b3a6015884f973728))
* specify explicit provider context ([905a8df](https://github.com/lambdasistemi/cardano-swiss-knife/commit/905a8df847281ac9810c9f20f217b9833f086511))
* specify IndexedDB transaction workbench ([77f9680](https://github.com/lambdasistemi/cardano-swiss-knife/commit/77f96800bee7e3e09d896148e078d12da84a70ac))
* specify input reference resolution ([7b3bf80](https://github.com/lambdasistemi/cardano-swiss-knife/commit/7b3bf80a45fe97d88ca9f6086b97ee2be07893e4))
* specify Node API property contracts ([7761c55](https://github.com/lambdasistemi/cardano-swiss-knife/commit/7761c55e5cc24ed7fee824604bdb71f0fe617de9))
* specify portable age vault ([a4980fd](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a4980fd36c1fc20d9399daf0e7aa4c735b10cbac))
* specify shared provider capability core ([a34e44e](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a34e44edfac11a0158d04887b7f23f4a6d1cd1cc))
* specify shared TxEntry domain ([f7390f9](https://github.com/lambdasistemi/cardano-swiss-knife/commit/f7390f91649f1af34e10dd9a536cc9acfb1c99a4))
* specify TextEnvelope codec ([a092b2a](https://github.com/lambdasistemi/cardano-swiss-knife/commit/a092b2a0f6cd980d0bfde1bf2c10d5be075fe2fa))
* specify transaction inspection parity ([f7e2045](https://github.com/lambdasistemi/cardano-swiss-knife/commit/f7e204551084193fa85d591eced1c4ae7e1ccc55))
* specify witness and ledger-operation parity ([fbc8646](https://github.com/lambdasistemi/cardano-swiss-knife/commit/fbc86466f54386d9e9db472f3cfa8a1d45edbe1a))
* standardize Node property suite path ([7d55bd6](https://github.com/lambdasistemi/cardano-swiss-knife/commit/7d55bd6c8fff17ad61b94592d423eb4db54add45))
* **tasks:** define address-label implementation slice ([7c4682e](https://github.com/lambdasistemi/cardano-swiss-knife/commit/7c4682e43b0f3fd5aa3c754558d80944b285f0b1))

## [0.1.1](https://github.com/lambdasistemi/cardano-swiss-knife/compare/v0.1.0...v0.1.1) (2026-07-18)


### Features

* add a docs tab to the workbench ([ad19933](https://github.com/lambdasistemi/cardano-swiss-knife/commit/ad1993336568b9babb80528c618ff155106b5d6e))


### Bug Fixes

* **docs:** add the versions and releases user manual ([0c7f154](https://github.com/lambdasistemi/cardano-swiss-knife/commit/0c7f1544d217ad9e5be754496e24c1269f6fb0fc))
* **docs:** document the shipped-docs release convention ([486dffb](https://github.com/lambdasistemi/cardano-swiss-knife/commit/486dffbb03daf7848c29ccbd8f4bfc1731df5b13))
* **docs:** expand the releasing reference ([ddfd3e3](https://github.com/lambdasistemi/cardano-swiss-knife/commit/ddfd3e3bf44a3b5cc3f9701b2b1d5d0d97d4bd10))
* **docs:** fold the readme into the manual ([1814d68](https://github.com/lambdasistemi/cardano-swiss-knife/commit/1814d6866771db0a6d4608d281d032e562186993))


### Documentation

* note the pages environment tag policy ([b3923db](https://github.com/lambdasistemi/cardano-swiss-knife/commit/b3923db41d50540eb68681ae4033c677e55534c1))
* reshape slice D into the docs tab, add readme slice ([#58](https://github.com/lambdasistemi/cardano-swiss-knife/issues/58)) ([0776644](https://github.com/lambdasistemi/cardano-swiss-knife/commit/0776644443b7dd6dcb142b426da490f0b01803c0))
* spec release documentation ([#58](https://github.com/lambdasistemi/cardano-swiss-knife/issues/58)) ([e87d8e6](https://github.com/lambdasistemi/cardano-swiss-knife/commit/e87d8e6a6aee90895e4a2e201d915c61b8eb419a))

## 0.1.0 (2026-07-18)


### Features

* add release-please pipeline ([0986654](https://github.com/lambdasistemi/cardano-swiss-knife/commit/0986654b0fe3b0a04e3e3723bf2d4f26d4c5cbc9))
* deploy pages from release tags ([b52c050](https://github.com/lambdasistemi/cardano-swiss-knife/commit/b52c0503c75f497036cad7b5a774b68f6b9a0f0e))
* surface the released version in the footer ([0951439](https://github.com/lambdasistemi/cardano-swiss-knife/commit/09514396e3abdaf1c6b7301ec67faa555b8b39cd))


### Miscellaneous Chores

* pin the initial release version ([589455d](https://github.com/lambdasistemi/cardano-swiss-knife/commit/589455d45040dfb60b1b2843b6aa1248d9ec0ebd))
