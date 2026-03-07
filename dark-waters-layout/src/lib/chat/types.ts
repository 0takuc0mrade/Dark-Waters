export interface ChatMessage {
  id: number
  gameId: number
  sender: string
  message: string
  clientMessageId: string
  createdAt: string
}

export interface ChatChallengePayload {
  gameId: number
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface ChatTokenPayload {
  sub: string
  gameId: number
  iat: number
  exp: number
  aud: "dark-waters-chat"
  iss: "dark-waters-api"
}
