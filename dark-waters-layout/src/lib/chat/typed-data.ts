import type { TypedData } from "starknet"

import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import type { ChatChallengePayload } from "@/src/lib/chat/types"

export function buildChatAuthTypedData(payload: ChatChallengePayload): TypedData {
  return {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      ChatAuth: [
        { name: "action", type: "shortstring" },
        { name: "gameId", type: "felt" },
        { name: "nonce", type: "felt" },
        { name: "issuedAt", type: "felt" },
        { name: "expiresAt", type: "felt" },
      ],
    },
    primaryType: "ChatAuth",
    domain: {
      name: "Dark Waters Chat",
      version: "1",
      chainId: SEPOLIA_CONFIG.CHAIN_ID,
      revision: "1",
    },
    message: {
      action: "dw_chat_auth",
      gameId: String(payload.gameId),
      nonce: payload.nonce,
      issuedAt: String(payload.issuedAt),
      expiresAt: String(payload.expiresAt),
    },
  }
}
