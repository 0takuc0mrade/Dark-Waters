"use client"

import React, { createContext, useContext, useState, useCallback } from "react"

interface WalletContextType {
  isConnected: boolean
  address: string | null
  connect: () => void
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  address: null,
  connect: () => {},
  disconnect: () => {},
})

export function useWallet() {
  return useContext(WalletContext)
}

const MOCK_ADDRESSES = [
  "0x1a2B3c4D5e6F7890AbCdEf1234567890aBcDeF12",
  "0xFe9876543210AbCdEf1234567890aBcDeF123456",
  "0xAb12Cd34Ef56789012345678901234567890AbCd",
]

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [address, setAddress] = useState<string | null>(null)

  const connect = useCallback(() => {
    const randomAddress =
      MOCK_ADDRESSES[Math.floor(Math.random() * MOCK_ADDRESSES.length)]
    setAddress(randomAddress)
    setIsConnected(true)
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setIsConnected(false)
  }, [])

  return (
    <WalletContext.Provider value={{ isConnected, address, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  )
}
