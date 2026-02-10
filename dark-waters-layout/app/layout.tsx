import React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import "./globals.css"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { WalletProvider } from "@/components/wallet-provider"
import { TopBar } from "@/components/top-bar"

const _inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const _jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "Dark Waters",
  description: "Naval strategy on-chain. Command your fleet, conquer the seas.",
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
      <body className="font-sans antialiased">
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
