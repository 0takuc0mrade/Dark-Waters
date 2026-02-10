"use client"

import { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type ModalPhase = "processing" | "success"

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  onComplete?: () => void
  /** Duration in ms for the processing phase before auto-succeeding */
  processingDuration?: number
  /** Duration in ms for the success phase before auto-closing */
  successDuration?: number
  /** The coordinate being attacked, e.g. "B5" */
  coordinate?: string
}

function ProcessingRadar() {
  return (
    <div className="animate-modal-radar-glow relative mx-auto flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-primary"
      >
        {/* Outer ring */}
        <circle
          cx="80"
          cy="80"
          r="72"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
        {/* Middle ring */}
        <circle
          cx="80"
          cy="80"
          r="48"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        {/* Inner ring */}
        <circle
          cx="80"
          cy="80"
          r="24"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="1"
        />
        {/* Center dot */}
        <circle
          cx="80"
          cy="80"
          r="3"
          fill="currentColor"
          fillOpacity="0.6"
        />

        {/* Crosshair horizontal */}
        <line
          x1="8"
          y1="80"
          x2="152"
          y2="80"
          stroke="currentColor"
          strokeOpacity="0.07"
          strokeWidth="0.5"
        />
        {/* Crosshair vertical */}
        <line
          x1="80"
          y1="8"
          x2="80"
          y2="152"
          stroke="currentColor"
          strokeOpacity="0.07"
          strokeWidth="0.5"
        />

        {/* Sweep line group */}
        <g
          className="animate-radar-sweep"
          style={{ transformOrigin: "80px 80px" }}
        >
          <defs>
            <linearGradient id="modalSweepGrad" x1="0" y1="0" x2="1" y2="0">
              <stop
                offset="0%"
                stopColor="hsl(187, 70%, 48%)"
                stopOpacity="0"
              />
              <stop
                offset="100%"
                stopColor="hsl(187, 70%, 48%)"
                stopOpacity="0.3"
              />
            </linearGradient>
          </defs>
          {/* Sweep wedge */}
          <path
            d="M80 80 L80 8 A72 72 0 0 1 130.9 29.1 Z"
            fill="url(#modalSweepGrad)"
          />
          {/* Sweep leading line */}
          <line
            x1="80"
            y1="80"
            x2="80"
            y2="8"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
        </g>

        {/* Blips */}
        <circle
          cx="105"
          cy="45"
          r="2"
          fill="currentColor"
          fillOpacity="0.5"
          className="animate-radar-ping"
          style={{ animationDelay: "0s" }}
        />
        <circle
          cx="52"
          cy="62"
          r="1.5"
          fill="currentColor"
          fillOpacity="0.35"
          className="animate-radar-ping"
          style={{ animationDelay: "0.6s" }}
        />
        <circle
          cx="115"
          cy="98"
          r="1.5"
          fill="currentColor"
          fillOpacity="0.3"
          className="animate-radar-ping"
          style={{ animationDelay: "1.2s" }}
        />
      </svg>

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/5 blur-2xl" />
    </div>
  )
}

function SuccessCheckmark() {
  return (
    <div className="animate-fade-scale-in relative mx-auto flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
      {/* Success circle */}
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer glow ring */}
        <circle
          cx="60"
          cy="60"
          r="56"
          stroke="hsl(150 60% 44%)"
          strokeOpacity="0.15"
          strokeWidth="1"
          className="animate-scale-circle"
        />
        {/* Main circle */}
        <circle
          cx="60"
          cy="60"
          r="46"
          stroke="hsl(150 60% 44%)"
          strokeWidth="2.5"
          fill="hsl(150 60% 44% / 0.08)"
          className="animate-scale-circle"
        />
        {/* Checkmark */}
        <path
          d="M38 60 L52 74 L82 44"
          stroke="hsl(150 60% 44%)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          className="animate-draw-check"
        />
      </svg>

      {/* Success glow */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-accent/8 blur-2xl" />
    </div>
  )
}

function ProcessingDots() {
  return (
    <span className="inline-flex gap-1">
      <span
        className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary"
        style={{ animationDelay: "300ms" }}
      />
      <span
        className="inline-block h-1 w-1 animate-pulse rounded-full bg-primary"
        style={{ animationDelay: "600ms" }}
      />
    </span>
  )
}

export function TransactionModal({
  open,
  onClose,
  onComplete,
  processingDuration = 2800,
  successDuration = 1600,
  coordinate,
}: TransactionModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("processing")

  // Reset phase when modal opens
  useEffect(() => {
    if (open) {
      setPhase("processing")
    }
  }, [open])

  // Processing phase timer
  useEffect(() => {
    if (!open || phase !== "processing") return
    const timer = setTimeout(() => {
      setPhase("success")
    }, processingDuration)
    return () => clearTimeout(timer)
  }, [open, phase, processingDuration])

  // Success phase timer (auto-close)
  useEffect(() => {
    if (!open || phase !== "success") return
    const timer = setTimeout(() => {
      onComplete?.()
      onClose()
    }, successDuration)
    return () => clearTimeout(timer)
  }, [open, phase, successDuration, onComplete, onClose])

  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-background/80 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border bg-card shadow-2xl shadow-primary/5",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            "duration-200"
          )}
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby="tx-modal-desc"
        >
          {/* Accessible title (visually hidden) */}
          <DialogPrimitive.Title className="sr-only">
            {phase === "processing"
              ? "Transaction Processing"
              : "Transaction Successful"}
          </DialogPrimitive.Title>

          <div className="flex flex-col items-center px-6 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10">
            {/* Phase visual */}
            {phase === "processing" ? (
              <ProcessingRadar />
            ) : (
              <SuccessCheckmark />
            )}

            {/* Text content */}
            <div className="mt-5 text-center sm:mt-6">
              {phase === "processing" ? (
                <>
                  <h3 className="animate-text-shimmer text-base font-semibold sm:text-lg">
                    Encrypting Coordinates
                  </h3>
                  <p
                    id="tx-modal-desc"
                    className="mt-2 text-sm text-muted-foreground leading-relaxed"
                  >
                    {coordinate
                      ? `Locking target at sector ${coordinate}...`
                      : "Locking target coordinates..."}
                    <br />
                    Please sign in your wallet.
                  </p>

                  {/* Simulated progress steps */}
                  <div className="mt-5 flex flex-col gap-2 text-left text-xs">
                    <StepRow
                      label="Computing zero-knowledge proof"
                      status="active"
                    />
                    <StepRow
                      label="Encrypting coordinates"
                      status="pending"
                    />
                    <StepRow
                      label="Submitting on-chain transaction"
                      status="pending"
                    />
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-accent sm:text-lg">
                    Transaction Confirmed
                  </h3>
                  <p
                    id="tx-modal-desc"
                    className="mt-2 text-sm text-muted-foreground leading-relaxed"
                  >
                    {coordinate
                      ? `Strike at ${coordinate} has been verified on-chain.`
                      : "Your action has been verified on-chain."}
                  </p>

                  {/* All steps completed */}
                  <div className="mt-5 flex flex-col gap-2 text-left text-xs">
                    <StepRow
                      label="Computing zero-knowledge proof"
                      status="done"
                    />
                    <StepRow
                      label="Encrypting coordinates"
                      status="done"
                    />
                    <StepRow
                      label="Submitting on-chain transaction"
                      status="done"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Cancel / Close button */}
            <div className="mt-6 w-full sm:mt-8">
              {phase === "processing" ? (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-border/60 text-muted-foreground hover:border-destructive/40 hover:text-destructive bg-transparent"
                  onClick={handleCancel}
                >
                  <X className="h-4 w-4" />
                  Cancel Transaction
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Closing automatically...
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

function StepRow({
  label,
  status,
}: {
  label: string
  status: "pending" | "active" | "done"
}) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Status indicator */}
      {status === "done" ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <circle cx="7" cy="7" r="6.5" stroke="hsl(150 60% 44%)" strokeWidth="1" fill="hsl(150 60% 44% / 0.1)" />
          <path
            d="M4.5 7 L6 8.5 L9.5 5"
            stroke="hsl(150 60% 44%)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      ) : status === "active" ? (
        <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <div className="absolute h-3.5 w-3.5 animate-ping rounded-full bg-primary/30" />
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      ) : (
        <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        </div>
      )}

      {/* Label */}
      <span
        className={cn(
          "transition-colors",
          status === "done" && "text-accent",
          status === "active" && "text-foreground",
          status === "pending" && "text-muted-foreground/60"
        )}
      >
        {label}
      </span>

      {/* Dots for active state */}
      {status === "active" && <ProcessingDots />}
    </div>
  )
}
