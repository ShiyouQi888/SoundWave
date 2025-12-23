"use client"

import type React from "react"

import { useAudio } from "@/lib/audio-context"
import { Sidebar } from "@/components/sidebar"
import { PlayerBar } from "@/components/player-bar"
import { cn } from "@/lib/utils"

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { isFullscreen } = useAudio()

  return (
    <div className="flex h-screen">
      {!isFullscreen && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0">
        <main className={cn("flex-1 overflow-hidden", isFullscreen && "h-[calc(100vh-96px)]")}>{children}</main>
        <PlayerBar />
      </div>
    </div>
  )
}
