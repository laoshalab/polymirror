/**
 * POLY_1271 deposit-wallet CLOB API key derivation.
 *
 * @polymarket/client binds L1 API keys to the EOA, but POLY_1271 orders use the
 * deposit wallet as signer — CLOB rejects those orders. This module mirrors the
 * SDK order-signing ERC-7739 wrap for ClobAuth L1 registration.
 */
import { Wallet, utils } from "ethers";
import { createPublicClient, type ApiKeyCreds } from "@polymarket/client";
import { createOrDeriveApiKey } from "@polymarket/client/actions";
import type { EvmAddress, EvmSignature } from "@polymarket/types";
import { ensureUndiciGlobalProxy } from "../util/proxy.js";

const CLOBAUTH_TYPE_STRING =
  "ClobAuth(address address,string timestamp,uint256 nonce,string message)";
const CLOBAUTH_TYPE_HASH = utils.keccak256(utils.toUtf8Bytes(CLOBAUTH_TYPE_STRING));
const DOMAIN_TYPE_HASH = utils.keccak256(
  utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId)")
);
const CLOBAUTH_DOMAIN_NAME_HASH = utils.keccak256(utils.toUtf8Bytes("ClobAuthDomain"));
const CLOBAUTH_DOMAIN_VERSION_HASH = utils.keccak256(utils.toUtf8Bytes("1"));
const DEPOSIT_WALLET_NAME = "DepositWallet";
const BYTES32_ZERO =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const TYPED_DATA_SIGN_TYPE = [
  { name: "contents", type: "ClobAuth" },
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "salt", type: "bytes32" },
];

const CLOBAUTH_TYPE = [
  { name: "address", type: "address" },
  { name: "timestamp", type: "string" },
  { name: "nonce", type: "uint256" },
  { name: "message", type: "string" },
];

function asEvmAddress(value: string): EvmAddress {
  if (!utils.isAddress(value)) {
    throw new Error(`Invalid EVM address: ${value}`);
  }
  return value as EvmAddress;
}

function clobAuthDomainSeparator(chainId: number): string {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256"],
      [DOMAIN_TYPE_HASH, CLOBAUTH_DOMAIN_NAME_HASH, CLOBAUTH_DOMAIN_VERSION_HASH, chainId]
    )
  );
}

function clobAuthContentsHash(
  depositWallet: string,
  timestamp: number,
  nonce: number
): string {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ["bytes32", "address", "string", "uint256", "string"],
      [
        CLOBAUTH_TYPE_HASH,
        depositWallet,
        String(timestamp),
        nonce,
        "This message attests that I control the given wallet",
      ]
    )
  );
}

function wrapPoly1271Signature(
  eoaSignature: string,
  chainId: number,
  depositWallet: string,
  timestamp: number,
  nonce: number
): string {
  const contentsTypeHex = utils.hexlify(utils.toUtf8Bytes(CLOBAUTH_TYPE_STRING));
  const contentsTypeLength = CLOBAUTH_TYPE_STRING.length.toString(16).padStart(4, "0");
  const domainSep = clobAuthDomainSeparator(chainId).slice(2);
  const contentsHash = clobAuthContentsHash(depositWallet, timestamp, nonce).slice(2);
  const sig = eoaSignature.startsWith("0x") ? eoaSignature.slice(2) : eoaSignature;
  return `0x${sig}${domainSep}${contentsHash}${contentsTypeHex.slice(2)}${contentsTypeLength}`;
}

export async function deriveDepositWalletClobCredentials(
  privateKey: string,
  depositWallet: string,
  chainId = 137,
  nonce = 0
): Promise<ApiKeyCreds> {
  await ensureUndiciGlobalProxy();
  const wallet = new Wallet(privateKey);
  const timestamp = Math.floor(Date.now() / 1000);
  const clobAuthMessage = {
    address: depositWallet,
    timestamp: String(timestamp),
    nonce,
    message: "This message attests that I control the given wallet",
  };

  const typedData = {
    domain: {
      chainId,
      name: "ClobAuthDomain",
      version: "1",
    },
    types: {
      ClobAuth: CLOBAUTH_TYPE,
      TypedDataSign: TYPED_DATA_SIGN_TYPE,
    },
    primaryType: "TypedDataSign" as const,
    message: {
      contents: clobAuthMessage,
      name: DEPOSIT_WALLET_NAME,
      version: "1",
      chainId,
      verifyingContract: depositWallet,
      salt: BYTES32_ZERO,
    },
  };

  const eoaSig = await wallet._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  );
  const wrapped = wrapPoly1271Signature(
    eoaSig,
    chainId,
    depositWallet,
    timestamp,
    nonce
  );

  const client = createPublicClient();
  return createOrDeriveApiKey(client, {
    address: asEvmAddress(depositWallet),
    nonce,
    signature: wrapped as EvmSignature,
    timestamp,
  });
}
