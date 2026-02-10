"use client"

import React from "react"

import {
  Anchor,
  Ship,
  Shield,
  Crosshair,
  Users,
  Activity,
  Waves,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ToastDemo } from "@/components/toast-demo"
import { useWallet } from "@/components/wallet-provider"

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub: string
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardContent() {
  const { isConnected } = useWallet()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      {!isConnected ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Anchor className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-balance text-center text-2xl font-bold tracking-tight text-foreground">
            Welcome to Dark Waters
          </h1>
          <p className="mt-2 max-w-md text-pretty text-center text-sm leading-relaxed text-muted-foreground">
            Connect your wallet to access the command bridge. Deploy fleets,
            launch attacks, and conquer the seas.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Command Bridge
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fleet overview and tactical operations
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Ship}
              label="Active Fleets"
              value="7"
              sub="3 in combat, 4 patrolling"
            />
            <StatCard
              icon={Shield}
              label="Defense Rating"
              value="94%"
              sub="+2.1% from last epoch"
            />
            <StatCard
              icon={Crosshair}
              label="Engagements Won"
              value="128"
              sub="87% win rate"
            />
            <StatCard
              icon={Users}
              label="Alliance Members"
              value="24"
              sub="3 pending invites"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      action: "Fleet Alpha deployed to Sector 7",
                      time: "2 min ago",
                      status: "active",
                    },
                    {
                      action: "Defensive position established at coordinates (12, 8)",
                      time: "5 min ago",
                      status: "complete",
                    },
                    {
                      action: "Scout report: Enemy fleet spotted near Reef Delta",
                      time: "12 min ago",
                      status: "warning",
                    },
                    {
                      action: "Alliance trade route secured",
                      time: "24 min ago",
                      status: "complete",
                    },
                    {
                      action: "Reinforcements requested at Harbor Nine",
                      time: "31 min ago",
                      status: "pending",
                    },
                  ].map((item) => (
                    <div
                      key={item.action}
                      className="flex items-center justify-between rounded-md border bg-secondary/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.status === "active"
                              ? "bg-primary"
                              : item.status === "complete"
                                ? "bg-accent"
                                : item.status === "warning"
                                  ? "bg-destructive"
                                  : "bg-muted-foreground"
                          }`}
                        />
                        <span className="text-xs text-foreground">
                          {item.action}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Waves className="h-4 w-4 text-primary" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                  Trigger tactical commands. Transaction confirmations will
                  appear as toast notifications in the bottom-right corner.
                </p>
                <ToastDemo />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
