"use client"

import { Wallet, LogOut, Copy, ExternalLink } from "lucide-react"
import { useWallet } from "@/components/wallet-provider"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletStatus() {
  const { isConnected, address, connect, disconnect } = useWallet()
  const { toast } = useToast()

  if (!isConnected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={connect}
              size="sm"
              className="animate-pulse-glow h-8 gap-2 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Wallet className="h-3.5 w-3.5" />
              Connect with Cartridge
            </Button>
          </TooltipTrigger>
          <TooltipContent>Connect your wallet to play</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 items-center gap-2 rounded-full border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Wallet menu"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-mono">{truncateAddress(address!)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground">Connected Wallet</p>
          <p className="mt-0.5 truncate font-mono text-xs text-foreground">
            {address}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs"
          onClick={async () => {
            if (!address) return
            try {
              await navigator.clipboard.writeText(address)
              toast({ title: "Address Copied", description: "Wallet address copied to clipboard." })
            } catch {
              toast({
                title: "Copy Failed",
                description: "Clipboard permission denied.",
                variant: "destructive",
              })
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-xs"
          onClick={() => {
            if (!address) return
            const explorerUrl = `https://sepolia.voyager.online/contract/${address}`
            window.open(explorerUrl, "_blank", "noopener,noreferrer")
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View on Explorer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={disconnect}
          className="gap-2 text-xs text-destructive focus:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
