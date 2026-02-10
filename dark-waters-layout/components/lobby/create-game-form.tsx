"use client"

import React from "react"

import { useState, useCallback } from "react"
import { ClipboardPaste, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@/components/ui/tooltip"

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

function getValidationError(address: string): string | null {
  if (!address) return null
  if (!address.startsWith("0x")) return "Address must start with 0x"
  const hexPart = address.slice(2)
  if (hexPart.length < 40) return `Address is too short (${hexPart.length + 2}/42 characters)`
  if (hexPart.length > 40) return `Address is too long (${hexPart.length + 2}/42 characters)`
  if (!/^[a-fA-F0-9]+$/.test(hexPart)) return "Address contains invalid characters"
  return null
}

interface CreateGameFormProps {
  onBack: () => void
  onCreateGame: (address: string) => void
}

export function CreateGameForm({ onBack, onCreateGame }: CreateGameFormProps) {
  const [address, setAddress] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [touched, setTouched] = useState(false)

  const validationError = touched ? getValidationError(address) : null
  const isValid = isValidAddress(address)

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      setAddress(text.trim())
      setTouched(true)
    } catch {
      // Clipboard access denied
    }
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setTouched(true)
      if (!isValid) return
      setIsSubmitting(true)
      // Simulate transaction delay
      await new Promise((resolve) => setTimeout(resolve, 1500))
      onCreateGame(address)
      setIsSubmitting(false)
    },
    [isValid, address, onCreateGame]
  )

  return (
    <TooltipProvider>
      <Card className="mx-auto w-full max-w-lg border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={onBack}
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to lobby</TooltipContent>
            </Tooltip>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                New Operation
              </CardTitle>
              <CardDescription className="text-xs">
                Enter the opponent wallet address to begin
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="opponent-address"
                className="text-xs font-medium text-foreground"
              >
                Opponent Address
              </label>
              <div className="relative">
                <input
                  id="opponent-address"
                  type="text"
                  placeholder="0x..."
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value)
                    if (!touched) setTouched(true)
                  }}
                  onBlur={() => setTouched(true)}
                  className={`flex h-10 w-full rounded-md border bg-secondary/50 px-3 pr-10 font-mono text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    validationError
                      ? "border-destructive focus-visible:ring-destructive"
                      : "border-input"
                  }`}
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? "address-error" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Paste from clipboard"
                    >
                      <ClipboardPaste className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Paste from clipboard</TooltipContent>
                </Tooltip>
              </div>
              {validationError && (
                <p
                  id="address-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {validationError}
                </p>
              )}
              {isValid && (
                <p className="text-xs text-accent">
                  Valid address detected
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="w-full gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Operation...
                  </>
                ) : (
                  "Launch Operation"
                )}
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                This will create a new match and notify the opponent.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
