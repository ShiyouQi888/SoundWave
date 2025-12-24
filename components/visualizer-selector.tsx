"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BarChart3, Waves, Circle, Activity, Radio, Orbit, Dna, Binary, Flame, Sun, Loader, Zap, Shapes } from "lucide-react"
import type { VisualizerType } from "@/lib/audio-context"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface VisualizerSelectorProps {
  selected: VisualizerType
  onSelect: (type: VisualizerType) => void
  layout?: "horizontal" | "grid" | "list"
}

const visualizers: { type: VisualizerType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: "bars", label: "频谱柱状", icon: <BarChart3 className="w-5 h-5" />, color: "text-pink-400" },
  { type: "wave", label: "波浪曲线", icon: <Waves className="w-5 h-5" />, color: "text-blue-400" },
  { type: "circle", label: "速度激情", icon: <Circle className="w-5 h-5" />, color: "text-red-500" },
  { type: "particles", label: "心电脉冲", icon: <Activity className="w-5 h-5" />, color: "text-cyan-400" },
  { type: "spectrum", label: "环形光谱", icon: <Radio className="w-5 h-5" />, color: "text-green-400" },
  { type: "galaxy", label: "星系漩涡", icon: <Orbit className="w-5 h-5" />, color: "text-indigo-400" },
  { type: "dna", label: "DNA螺旋", icon: <Dna className="w-5 h-5" />, color: "text-rose-400" },
  { type: "matrix", label: "数字矩阵", icon: <Binary className="w-5 h-5" />, color: "text-emerald-400" },
  { type: "fireworks", label: "烟花绽放", icon: <Flame className="w-5 h-5" />, color: "text-orange-400" },
  { type: "aurora", label: "极光幻影", icon: <Sun className="w-5 h-5" />, color: "text-teal-400" },
  { type: "vortex", label: "隧道穿梭", icon: <Loader className="w-5 h-5" />, color: "text-violet-400" },
  { type: "lightning", label: "闪电风暴", icon: <Zap className="w-5 h-5" />, color: "text-yellow-400" },
  { type: "spheres", label: "碎裂玻璃", icon: <Shapes className="w-5 h-5" />, color: "text-blue-500" },
]

export function VisualizerSelector({ selected, onSelect, layout = "horizontal" }: VisualizerSelectorProps) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
        {visualizers.map((v) => (
          <button
            key={v.type}
            onClick={() => onSelect(v.type)}
            className={cn(
              "flex flex-col items-center gap-1.5 md:gap-2 p-3 md:p-4 rounded-xl border transition-all",
              selected === v.type
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50 hover:bg-secondary/50",
            )}
          >
            <span className={cn("shrink-0", selected === v.type ? "text-primary" : v.color)}>{v.icon}</span>
            <span className="text-xs md:text-sm font-medium">{v.label}</span>
          </button>
        ))}
      </div>
    )
  }

  if (layout === "list") {
    return (
      <div className="flex flex-col gap-0.5">
        {visualizers.map((v) => (
          <Button
            key={v.type}
            variant="ghost"
            size="sm"
            onClick={() => onSelect(v.type)}
            className={cn(
              "w-full justify-start gap-3 px-2.5 h-9 transition-all hover:bg-primary/10 group",
              selected === v.type ? "bg-primary/20 text-primary hover:bg-primary/30" : "hover:bg-secondary/50",
            )}
          >
            <span className={cn(
              "shrink-0 transition-transform group-hover:scale-110 duration-200", 
              selected === v.type ? "text-primary" : v.color
            )}>
              {v.icon}
            </span>
            <span className="text-xs font-medium">{v.label}</span>
          </Button>
        ))}
      </div>
    )
  }

  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-lg w-max">
        {visualizers.map((v) => (
          <Button
            key={v.type}
            variant="ghost"
            size="sm"
            onClick={() => onSelect(v.type)}
            className={cn(
              "gap-2 px-3 shrink-0",
              selected === v.type && "bg-primary/20 text-primary hover:bg-primary/30",
            )}
          >
            <span className={cn(selected === v.type ? "text-primary" : v.color)}>{v.icon}</span>
            <span className="hidden sm:inline text-xs">{v.label}</span>
          </Button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" className="invisible" />
    </ScrollArea>
  )
}
