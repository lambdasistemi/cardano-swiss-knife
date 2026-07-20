import { constructByronAddress, constructByronAddressFromMnemonic, constructIcarusAddress, constructIcarusAddressFromMnemonic, constructShelleyAddresses, deriveKeys } from "../index.js";
export const derive = ({ mnemonic, accountIndex, role, addressIndex }) => deriveKeys({ mnemonic: mnemonic.trim().split(/\s+/), accountIndex: Number(accountIndex), role, addressIndex: Number(addressIndex) });
export const shelley = ({ network, paymentXpub, stakeXpub }) => constructShelleyAddresses({ network, paymentXPubBech32: paymentXpub, stakeXPubBech32: stakeXpub });
export const icarus = ({ network, addressXpub }) => constructIcarusAddress({ network, addressXPubBech32: addressXpub });
export const byron = ({ network, addressXpub, rootXpub, derivationPath }) => constructByronAddress({ network, addressXPubBech32: addressXpub, rootXPubBech32: rootXpub, derivationPath: JSON.parse(derivationPath) });
export const restoreIcarus = ({ mnemonic, network, accountIndex, role, addressIndex }) => constructIcarusAddressFromMnemonic({ mnemonic: mnemonic.trim().split(/\s+/), network, accountIndex: Number(accountIndex), role, addressIndex: Number(addressIndex) });
export const restoreByron = ({ mnemonic, network, accountIndex, addressIndex }) => constructByronAddressFromMnemonic({ mnemonic: mnemonic.trim().split(/\s+/), network, accountIndex: Number(accountIndex), addressIndex: Number(addressIndex) });
