"use client"

import type React from "react"
import { useState } from "react"
import { useAudio } from "@/lib/audio-context"
import { VisualizerCanvas } from "@/components/visualizer-canvas"
import { VisualizerSelector } from "@/components/visualizer-selector"
import { VideoExportModal } from "@/components/video-export-modal"
import { Music2, Upload, Settings2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRef } from "react"
import { cn } from "@/lib/utils"

export default function Home() {
  const {
    visualizerType,
    setVisualizerType,
    analyserData,
    isPlaying,
    currentTrack,
    addTrack,
    selectTrack,
    avatarImage,
    isFullscreen,
  } = useAudio()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showControls, setShowControls] = useState(false)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      const track = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        url,
        type: "local" as const,
      }
      addTrack(track)
      selectTrack(track)
    }
  }

  return (
    <div className="relative h-full flex flex-col">
      {!isFullscreen && (
        <div className="absolute top-4 right-4 z-20">
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowControls(!showControls)}
              className="gap-2 bg-background/80 backdrop-blur-md hover:bg-background/90 shadow-lg"
            >
              <Settings2 className="w-4 h-4" />
              <span>控制面板</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", showControls && "rotate-180")} />
            </Button>

            {showControls && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-background/90 backdrop-blur-xl rounded-lg border border-border/50 shadow-xl min-w-[200px] space-y-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">可视化效果</p>
                  <VisualizerSelector selected={visualizerType} onSelect={setVisualizerType} />
                </div>
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2">导出</p>
                  <VideoExportModal />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="absolute top-4 right-4 z-20">
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowControls(!showControls)}
              className="gap-2 bg-background/50 backdrop-blur-md hover:bg-background/70"
            >
              <Settings2 className="w-4 h-4" />
              <ChevronDown className={cn("w-4 h-4 transition-transform", showControls && "rotate-180")} />
            </Button>

            {showControls && (
              <div className="absolute top-full right-0 mt-2 p-3 bg-background/80 backdrop-blur-xl rounded-lg border border-border/50 shadow-xl min-w-[180px]">
                <VisualizerSelector selected={visualizerType} onSelect={setVisualizerType} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visualizer */}
      <div
        className={cn("flex-1 relative", isFullscreen && "h-full")}
        onClick={() => showControls && setShowControls(false)}
      >
        <VisualizerCanvas
          type={visualizerType}
          analyserData={analyserData}
          isPlaying={isPlaying}
          avatarImage={avatarImage}
        />

        {!isPlaying && currentTrack && !isFullscreen && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10 bg-background/30 backdrop-blur-sm">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
              <Music2 className="w-12 h-12 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">点击播放开始体验</h2>
              <p className="text-muted-foreground max-w-md">已加载: {currentTrack.name}</p>
            </div>
          </div>
        )}

        {!currentTrack && !isFullscreen && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10 bg-background/50 backdrop-blur-sm">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <Music2 className="w-12 h-12 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">开始你的音乐之旅</h2>
              <p className="text-muted-foreground max-w-md">在侧边栏上传音乐文件，体验沉浸式音乐可视化</p>
            </div>
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()} size="lg" className="gap-2">
              <Upload className="w-5 h-5" />
              快速上传音乐
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
