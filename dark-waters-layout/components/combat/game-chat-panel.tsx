"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { Loader2, MessageSquare, SendHorizontal } from "lucide-react"

import { useGameChat } from "@/hooks/use-game-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function formatTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "--:--"
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function GameChatPanel({ gameId }: { gameId: number | null }) {
  const [draft, setDraft] = useState("")
  const { messages, error, isBootstrapping, isSending, canChat, isMine, sendMessage } = useGameChat(gameId)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.trim()) return

    const didSend = await sendMessage(draft)
    if (didSend) {
      setDraft("")
    }
  }

  return (
    <Card className="border-cyan-200/20 bg-card/85">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm uppercase tracking-[0.18em] text-cyan-100/90">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cyan-200" />
            Fleet Comms
          </span>
          <Badge className="border-cyan-300/35 bg-cyan-500/15 text-cyan-100">
            {gameId ? `Room ${gameId}` : "Offline"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="h-52 space-y-2 overflow-y-auto rounded-lg border border-cyan-200/20 bg-slate-950/35 p-2"
        >
          {!gameId && (
            <p className="px-1 py-2 text-xs text-cyan-100/70">
              Start or resume a game to open player chat.
            </p>
          )}

          {gameId && messages.length === 0 && (
            <p className="px-1 py-2 text-xs text-cyan-100/70">
              {isBootstrapping ? "Establishing secure chat channel..." : "No messages yet."}
            </p>
          )}

          {messages.map((entry) => {
            const mine = isMine(entry.sender)
            return (
              <div
                key={entry.id}
                className={cn(
                  "max-w-[92%] rounded-md border px-2.5 py-2 text-xs",
                  mine
                    ? "ml-auto border-cyan-300/35 bg-cyan-500/20 text-cyan-50"
                    : "border-slate-300/25 bg-slate-500/15 text-slate-100"
                )}
              >
                <p className="break-words">{entry.message}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] opacity-75">
                  {mine ? "You" : `${entry.sender.slice(0, 6)}...${entry.sender.slice(-4)}`} · {formatTime(entry.createdAt)}
                </p>
              </div>
            )
          })}
        </div>

        <form className="flex items-center gap-2" onSubmit={onSubmit}>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={canChat ? "Type secure message..." : "Chat unavailable"}
            disabled={!canChat || isSending}
            maxLength={280}
            className="border-cyan-200/30 bg-cyan-950/20 text-cyan-50 placeholder:text-cyan-100/40"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canChat || !draft.trim() || isSending}
            className="border border-cyan-200/35 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-400/30"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </form>

        {(isBootstrapping || error) && (
          <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <p className="flex items-center gap-2">
              {isBootstrapping && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isBootstrapping ? "Authorizing wallet for chat session..." : error}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
