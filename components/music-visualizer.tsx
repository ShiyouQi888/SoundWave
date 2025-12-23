"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, Upload, Link2, Volume2, VolumeX, SkipBack, SkipForward, Sparkles, Music2 } from "lucide-react"
import { VisualizerCanvas } from "./visualizer-canvas"
import { VisualizerSelector } from "./visualizer-selector"

export type VisualizerType = "bars" | "wave" | "circle" | "particles" | "spectrum" | "galaxy"

export function MusicVisualizer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>("")
  const [urlInput, setUrlInput] = useState("")
  const [fileName, setFileName] = useState<string>("")
  const [volume, setVolume] = useState(0.7)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [visualizerType, setVisualizerType] = useState<VisualizerType>("bars")
  const [analyserData, setAnalyserData] = useState<Uint8Array>(new Uint8Array(128))

  const audioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setupAudioContext = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256

    const source = audioContext.createMediaElementSource(audioRef.current)
    source.connect(analyser)
    analyser.connect(audioContext.destination)

    audioContextRef.current = audioContext
    analyserRef.current = analyser
    sourceRef.current = source
  }, [])

  const updateAnalyserData = useCallback(() => {
    if (analyserRef.current && isPlaying) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      setAnalyserData(dataArray)
      animationRef.current = requestAnimationFrame(updateAnalyserData)
    }
  }, [isPlaying])

  useEffect(() => {
    if (isPlaying) {
      updateAnalyserData()
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, updateAnalyserData])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setAudioUrl(url)
      setFileName(file.name)
      setIsPlaying(false)
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      setAudioUrl(urlInput.trim())
      setFileName("在线音乐")
      setIsPlaying(false)
    }
  }

  const togglePlay = async () => {
    if (!audioRef.current || !audioUrl) return

    if (!audioContextRef.current) {
      setupAudioContext()
    }

    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0]
      setCurrentTime(value[0])
    }
  }

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0]
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume
        setIsMuted(false)
      } else {
        audioRef.current.volume = 0
        setIsMuted(true)
      }
    }
  }

  const skip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds))
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20 text-primary">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-primary">Sound</span>
            <span className="text-foreground">Wave</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <VisualizerSelector selected={visualizerType} onSelect={setVisualizerType} />
        </div>
      </header>

      {/* Visualizer Canvas */}
      <div className="flex-1 relative">
        <VisualizerCanvas type={visualizerType} analyserData={analyserData} isPlaying={isPlaying} />

        {/* Center Play Button when no audio */}
        {!audioUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 z-10">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 mx-auto rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                <Music2 className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-3xl font-bold text-foreground">开始你的音乐之旅</h2>
              <p className="text-muted-foreground max-w-md">上传本地音乐文件或输入在线音乐链接，体验沉浸式音乐可视化</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls Panel */}
      <div className="relative z-10 border-t border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          {/* Upload Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full sm:w-auto gap-2 border-primary/50 hover:bg-primary/10 hover:text-primary"
            >
              <Upload className="w-4 h-4" />
              上传音乐
            </Button>

            <div className="flex-1 flex items-center gap-2 w-full">
              <Input
                placeholder="输入音乐链接..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 bg-secondary/50 border-border/50 focus:border-primary"
              />
              <Button
                onClick={handleUrlSubmit}
                variant="outline"
                className="gap-2 border-primary/50 hover:bg-primary/10 hover:text-primary bg-transparent"
              >
                <Link2 className="w-4 h-4" />
                加载
              </Button>
            </div>
          </div>

          {/* Audio Element */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
              crossOrigin="anonymous"
            />
          )}

          {/* Now Playing */}
          {fileName && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Music2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{fileName}</p>
                <p className="text-sm text-muted-foreground">正在播放</p>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {audioUrl && (
            <div className="space-y-2">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          )}

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(-10)}
              disabled={!audioUrl}
              className="text-muted-foreground hover:text-foreground"
            >
              <SkipBack className="w-5 h-5" />
            </Button>

            <Button
              onClick={togglePlay}
              disabled={!audioUrl}
              size="lg"
              className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
            >
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(10)}
              disabled={!audioUrl}
              className="text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="w-5 h-5" />
            </Button>

            {/* Volume Control */}
            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="text-muted-foreground hover:text-foreground"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="w-24"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
