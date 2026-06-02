"use client";

import { IdentifierKind, type Signer } from "@xmtp/browser-sdk";

/**
 * Bridge between the Circles host wallet (Safe via miniapp-sdk) and the
 * XMTP browser SDK.
 *
 * Ported from the reference repo's `createSCWSigner` at
 *   https://github.com/zengzengzenghuy/xmtp-circles-miniapp/blob/main/src/helpers/createSigner.js
 *
 * The Safe signs via EIP-1271 (`signatureType: "erc1271"`) — XMTP's
 * `VerifySmartContractWalletSignatures` calls `isValidSignature` on the
 * Safe to confirm, so the contract must be deployed on the target chain
 * BEFORE Client.create is invoked. Caller is responsible for that check.
 *
 * @param address Safe wallet address (host-injected).
 * @param signMessageAsync Async function that returns a hex signature string.
 * @param chainId Numeric chain ID where the Safe lives (Gnosis = 100).
 */
export function createCirclesSafeSigner(
  address: `0x${string}`,
  signMessageAsync: (message: string) => Promise<string>,
  chainId: number,
): Signer {
  return {
    type: "SCW",
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signature = await signMessageAsync(message);
      if (!signature || typeof signature !== "string") {
        throw new Error(
          `Circles host returned an invalid signature: ${JSON.stringify(signature)}`,
        );
      }
      // Drop the optional 0x prefix and decode.
      const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
      if (hex.length === 0 || hex.length % 2 !== 0) {
        throw new Error(
          `Signature has malformed hex length (${hex.length}). Raw: ${signature}`,
        );
      }
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      // EIP-1271 / Safe signatures are typically ≥65 bytes. Warn so debugging
      // a verification failure is easier — the reference does the same.
      if (bytes.length < 65) {
        console.warn(
          `[xmtp] Safe signature is only ${bytes.length} bytes; ` +
            `XMTP's VerifySmartContractWalletSignatures may reject it.`,
        );
      }
      return bytes;
    },
    getChainId: () => BigInt(chainId),
  };
}

/** Chain where the Circles Safe lives. */
export const GNOSIS_CHAIN_ID = 100;
