"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAudio } from "@/lib/audio-context"
import { Sidebar } from "@/components/sidebar"
import { PlayerBar } from "@/components/player-bar"
import { cn } from "@/lib/utils"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { isFullscreen } = useAudio()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Handle window resize to determine if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop and Mobile Drawer */}
      <div className={cn(
        "z-50 transition-all duration-300",
        isMobile ? (
          "fixed inset-y-0 left-0 transform" + (isSidebarOpen ? " translate-x-0" : " -translate-x-full")
        ) : (
          !isFullscreen ? "relative block" : "hidden"
        )
      )}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile Header */}
        {isMobile && !isFullscreen && (
          <header className="h-14 border-b border-border/50 flex items-center px-4 bg-background/95 backdrop-blur-xl z-40">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <span className="font-bold text-lg bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              SoundWave
            </span>
          </header>
        )}

        <main className={cn(
          "flex-1 overflow-hidden", 
          isFullscreen ? "h-screen" : (isMobile ? "h-[calc(100vh-80px-56px)]" : "h-[calc(100vh-80px)]")
        )}>
          {children}
        </main>
        
        {!isFullscreen && <PlayerBar />}
      </div>
    </div>
  )
}
