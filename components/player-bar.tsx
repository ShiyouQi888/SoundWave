"use client"

import { useAudio } from "@/lib/audio-context"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  Music2,
  Maximize,
  Minimize,
  ListMusic,
  Rewind,
  FastForward,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffled,
    isFullscreen,
    playlist,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    skip,
    nextTrack,
    prevTrack,
    setRepeatMode,
    toggleShuffle,
    toggleFullscreen,
    selectTrack,
  } = useAudio()

  const [showPlaylist, setShowPlaylist] = useState(false)

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const getRepeatIcon = () => {
    switch (repeatMode) {
      case "one":
        return <Repeat1 className="w-4 h-4" />
      case "all":
        return <Repeat className="w-4 h-4 text-primary" />
      default:
        return <Repeat className="w-4 h-4" />
    }
  }

  const getRepeatLabel = () => {
    switch (repeatMode) {
      case "one":
        return "单曲循环"
      case "all":
        return "列表循环"
      default:
        return "顺序播放"
    }
  }

  const cycleRepeatMode = () => {
    const modes: ("none" | "one" | "all")[] = ["none", "one", "all"]
    const currentIndex = modes.indexOf(repeatMode)
    const nextIndex = (currentIndex + 1) % modes.length
    setRepeatMode(modes[nextIndex])
  }

  return (
    <div
      className={cn(
        "border-t border-border/50 bg-background/95 backdrop-blur-xl transition-all duration-300",
        isFullscreen && "fixed bottom-0 left-0 right-0 z-50",
        "h-20",
      )}
    >
      {/* Progress bar at top */}
      <div
        className="h-1 bg-secondary relative cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const percent = (e.clientX - rect.left) / rect.width
          seek(percent * duration)
        }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent transition-all"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-primary/50"
          style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>

      <div className="h-[calc(100%-4px)] flex items-center px-4 gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 w-64 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center shrink-0 relative overflow-hidden">
            {currentTrack?.cover ? (
              <img src={currentTrack.cover || "/placeholder.svg"} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music2 className="w-6 h-6 text-primary" />
            )}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="flex gap-0.5">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-white rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.random() * 6}px`,
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{currentTrack?.name || "未选择音乐"}</p>
            <p className="text-xs text-muted-foreground truncate">{currentTrack?.artist || "未知艺术家"}</p>
          </div>
        </div>

        {/* Time display */}
        <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1 flex items-center justify-center gap-1">
          {/* Shuffle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleShuffle}
            className={cn("h-8 w-8", isShuffled ? "text-primary" : "text-muted-foreground hover:text-foreground")}
            title={isShuffled ? "随机播放开" : "随机播放关"}
          >
            <Shuffle className="w-4 h-4" />
          </Button>

          {/* Previous */}
          <Button
            variant="ghost"
            size="icon"
            onClick={prevTrack}
            disabled={!currentTrack || playlist.length <= 1}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="上一曲"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          {/* Rewind */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skip(-10)}
            disabled={!currentTrack}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="快退10秒"
          >
            <Rewind className="w-4 h-4" />
          </Button>

          {/* Play/Pause */}
          <Button
            onClick={togglePlay}
            disabled={!currentTrack}
            size="icon"
            className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent hover:opacity-90 text-primary-foreground shadow-lg shadow-primary/30"
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </Button>

          {/* Fast Forward */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skip(10)}
            disabled={!currentTrack}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="快进10秒"
          >
            <FastForward className="w-4 h-4" />
          </Button>

          {/* Next */}
          <Button
            variant="ghost"
            size="icon"
            onClick={nextTrack}
            disabled={!currentTrack || playlist.length <= 1}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="下一曲"
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          {/* Repeat */}
          <Button
            variant="ghost"
            size="icon"
            onClick={cycleRepeatMode}
            className={cn(
              "h-8 w-8",
              repeatMode !== "none" ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
            title={getRepeatLabel()}
          >
            {getRepeatIcon()}
          </Button>
        </div>

        {/* Volume & extras */}
        <div className="flex items-center gap-2 w-64 justify-end">
          {/* Playlist */}
          <DropdownMenu open={showPlaylist} onOpenChange={setShowPlaylist}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="播放列表"
              >
                <ListMusic className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-auto">
              {playlist.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">播放列表为空</div>
              ) : (
                playlist.map((track, index) => (
                  <DropdownMenuItem
                    key={track.id}
                    onClick={() => selectTrack(track)}
                    className={cn("cursor-pointer", currentTrack?.id === track.id && "bg-primary/10 text-primary")}
                  >
                    <span className="w-6 text-muted-foreground text-xs">{index + 1}</span>
                    <span className="truncate flex-1">{track.name}</span>
                    {currentTrack?.id === track.id && isPlaying && (
                      <div className="flex gap-0.5 ml-2">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-primary rounded-full animate-pulse"
                            style={{ height: `${6 + i * 2}px` }}
                          />
                        ))}
                      </div>
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Volume */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={isMuted ? "取消静音" : "静音"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider
            value={[isMuted ? 0 : volume]}
            max={1}
            step={0.01}
            onValueChange={(v) => setVolume(v[0])}
            className="w-20"
          />

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
