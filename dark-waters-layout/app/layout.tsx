import React from "react"
import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, Rajdhani } from "next/font/google"

import "./globals.css"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { WalletProvider } from "@/components/wallet-provider"
import { TopBar } from "@/components/top-bar"

const _rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-rajdhani",
  weight: ["400", "500", "600", "700"],
})
const _ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  weight: ["400", "500", "600"],
})

export const metadata: Metadata = {
  title: "Dark Waters",
  description: "Naval command protocol on Starknet. Commit, reveal, verify, settle.",
}

export const viewport: Viewport = {
  themeColor: "#0b1117",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${_rajdhani.variable} ${_ibmMono.variable} font-sans antialiased`}>
        <WalletProvider>
          <TooltipProvider delayDuration={300}>
            <div className="flex min-h-screen flex-col">
              <TopBar />
              <main className="flex-1">{children}</main>
            </div>
            <Toaster />
          </TooltipProvider>
        </WalletProvider>
      </body>
    </html>
  )
}
