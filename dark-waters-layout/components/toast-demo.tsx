"use client"

import {
  Rocket,
  Crosshair,
  Shield,
  Ship,
  Swords,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"

const TOAST_ACTIONS = [
  {
    label: "Deploy Fleet",
    description: "Deploying Fleet...",
    icon: Rocket,
    tooltip: "Deploy your fleet to the target zone",
  },
  {
    label: "Attack",
    description: "Attack Confirmed",
    icon: Crosshair,
    tooltip: "Launch an attack on enemy position",
  },
  {
    label: "Defend",
    description: "Defensive Formation Active",
    icon: Shield,
    tooltip: "Activate defensive formation",
  },
  {
    label: "Scout",
    description: "Scouting Area...",
    icon: MapPin,
    tooltip: "Send scouts to reveal enemy positions",
  },
  {
    label: "Reinforce",
    description: "Reinforcements Dispatched",
    icon: Ship,
    tooltip: "Send reinforcements to the frontline",
  },
  {
    label: "Engage",
    description: "Engaging Enemy Fleet",
    icon: Swords,
    tooltip: "Engage in direct combat with enemy",
  },
]

export function ToastDemo() {
  const { toast } = useToast()

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {TOAST_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Tooltip key={action.label}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs bg-transparent"
                  onClick={() =>
                    toast({
                      title: action.label,
                      description: action.description,
                    })
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.tooltip}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
