"use client"

import type React from "react"
import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react"

const DEFAULT_MUSIC_URL = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/O40000212ryl0AP8np-S3SfWvvFhCOvL6OuIG78g3m8dBfKS7.ogg"
const DEFAULT_MUSIC_NAME = "默认音乐"

export type VisualizerType =
  | "bars"
  | "wave"
  | "circle"
  | "particles"
  | "spectrum"
  | "galaxy"
  | "dna"
  | "matrix"
  | "fireworks"
  | "aurora"
  | "vortex"
  | "lightning"
  | "spheres"

export interface AudioTrack {
  id: string
  name: string
  artist?: string
  url: string
  type: "local" | "url" | "qqmusic" | "netease"
  cover?: string
}

export interface AudioEffects {
  bass: number
  treble: number
  reverb: number
  echo: number
  stereoWidth: number
  compression: number
}

export interface ImportedPlaylist {
  id: string
  name: string
  source: "qqmusic" | "netease"
  tracks: AudioTrack[]
  importedAt: Date
}

interface AudioContextType {
  // Track state
  currentTrack: AudioTrack | null
  playlist: AudioTrack[]
  savedPlaylists: ImportedPlaylist[]
  setPlaylist: (tracks: AudioTrack[]) => void
  addTrack: (track: AudioTrack) => void
  removeTrack: (id: string) => void
  selectTrack: (track: AudioTrack) => void

  importPlaylist: (playlistUrl: string, source: "qqmusic" | "netease") => Promise<void>
  savePlaylist: (playlist: ImportedPlaylist) => void
  deletePlaylist: (id: string) => void
  loadPlaylistTracks: (playlist: ImportedPlaylist) => void

  // Playback state
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  repeatMode: "none" | "one" | "all"
  isShuffled: boolean

  // Visualizer
  visualizerType: VisualizerType
  setVisualizerType: (type: VisualizerType) => void
  analyserData: Uint8Array

  // Avatar Image
  avatarImage: string | null
  setAvatarImage: (url: string | null) => void

  // Effects
  effects: AudioEffects
  setEffects: (effects: AudioEffects) => void

  // Controls
  togglePlay: () => Promise<void>
  seek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  skip: (seconds: number) => void
  nextTrack: () => void
  prevTrack: () => void
  setRepeatMode: (mode: "none" | "one" | "all") => void
  toggleShuffle: () => void
  getAudioStream: () => MediaStream | null
  getAnalyserData: () => Uint8Array

  // Fullscreen
  isFullscreen: boolean
  toggleFullscreen: () => void

  // Refs
  audioRef: React.RefObject<HTMLAudioElement | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>

  visualizerCanvasRef: React.RefObject<HTMLCanvasElement | null>
  playerBarRef: React.RefObject<HTMLDivElement | null>
}

const AudioContext = createContext<AudioContextType | null>(null)

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const defaultTrack: AudioTrack = {
    id: "default-music",
    name: DEFAULT_MUSIC_NAME,
    artist: "SoundWave",
    url: DEFAULT_MUSIC_URL,
    type: "url",
  }

  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(defaultTrack)
  const [playlist, setPlaylist] = useState<AudioTrack[]>([defaultTrack])
  const [savedPlaylists, setSavedPlaylists] = useState<ImportedPlaylist[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.7)
  const [isMuted, setIsMuted] = useState(false)
  const [repeatMode, setRepeatMode] = useState<"none" | "one" | "all">("none")
  const [isShuffled, setIsShuffled] = useState(false)
  const [visualizerType, setVisualizerType] = useState<VisualizerType>("bars")
  const [analyserData, setAnalyserData] = useState<Uint8Array>(new Uint8Array(256))
  const [avatarImage, setAvatarImage] = useState<string | null>(null)
  const [effects, setEffects] = useState<AudioEffects>({
    bass: 0,
    treble: 0,
    reverb: 0,
    echo: 0,
    stereoWidth: 0,
    compression: 0,
  })
  const [isFullscreen, setIsFullscreen] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null)
  const playerBarRef = useRef<HTMLDivElement>(null)

  const audioContextRef = useRef<globalThis.AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const animationRef = useRef<number>()
  const recorderDestRef = useRef<MediaStreamDestinationNode | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("savedPlaylists")
    if (saved) {
      try {
        setSavedPlaylists(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to load saved playlists")
      }
    }
  }, [])

  useEffect(() => {
    if (savedPlaylists.length > 0) {
      localStorage.setItem("savedPlaylists", JSON.stringify(savedPlaylists))
    }
  }, [savedPlaylists])

  const setupAudioContext = useCallback(() => {
    if (!audioRef.current || audioContextRef.current) return

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.8

    const source = ctx.createMediaElementSource(audioRef.current)
    const gain = ctx.createGain()

    const bassFilter = ctx.createBiquadFilter()
    bassFilter.type = "lowshelf"
    bassFilter.frequency.value = 200
    bassFilter.gain.value = effects.bass

    const trebleFilter = ctx.createBiquadFilter()
    trebleFilter.type = "highshelf"
    trebleFilter.frequency.value = 3000
    trebleFilter.gain.value = effects.treble

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -24
    compressor.knee.value = 30
    compressor.ratio.value = 12 + effects.compression * 0.1
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    const recorderDest = ctx.createMediaStreamDestination()

    source.connect(bassFilter)
    bassFilter.connect(trebleFilter)
    trebleFilter.connect(compressor)
    compressor.connect(gain)
    gain.connect(analyser)
    analyser.connect(ctx.destination)
    analyser.connect(recorderDest)

    audioContextRef.current = ctx
    analyserRef.current = analyser
    sourceRef.current = source
    gainRef.current = gain
    bassFilterRef.current = bassFilter
    trebleFilterRef.current = trebleFilter
    compressorRef.current = compressor
    recorderDestRef.current = recorderDest
  }, [effects.bass, effects.treble, effects.compression])

  useEffect(() => {
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.value = effects.bass
    }
    if (trebleFilterRef.current) {
      trebleFilterRef.current.gain.value = effects.treble
    }
    if (compressorRef.current) {
      compressorRef.current.ratio.value = 12 + effects.compression * 0.1
    }
  }, [effects])

  const updateAnalyserData = useCallback(() => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      setAnalyserData(dataArray)
    }
    animationRef.current = requestAnimationFrame(updateAnalyserData)
  }, [])

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

  const addTrack = useCallback((track: AudioTrack) => {
    setPlaylist((prev) => [...prev, track])
  }, [])

  const removeTrack = useCallback(
    (id: string) => {
      setPlaylist((prev) => prev.filter((t) => t.id !== id))
      if (currentTrack?.id === id) {
        setCurrentTrack(null)
        setIsPlaying(false)
      }
    },
    [currentTrack],
  )

  const selectTrack = useCallback(
    (track: AudioTrack, shouldPlay?: boolean) => {
      setCurrentTrack(track)
      if (shouldPlay !== undefined) {
        setIsPlaying(shouldPlay)
      }
    },
    [],
  )

  const importPlaylist = useCallback(
    async (playlistUrl: string, source: "qqmusic" | "netease") => {
      const mockTracks: AudioTrack[] = []

      if (source === "qqmusic") {
        const match = playlistUrl.match(/id=(\d+)/) || playlistUrl.match(/(\d{10,})/)
        if (match) {
          for (let i = 0; i < 5; i++) {
            mockTracks.push({
              id: `qq-${Date.now()}-${i}`,
              name: `QQ音乐歌曲 ${i + 1}`,
              artist: "未知艺术家",
              url: "",
              type: "qqmusic",
            })
          }
        }
      } else if (source === "netease") {
        const match = playlistUrl.match(/id=(\d+)/) || playlistUrl.match(/playlist\/(\d+)/)
        if (match) {
          for (let i = 0; i < 5; i++) {
            mockTracks.push({
              id: `netease-${Date.now()}-${i}`,
              name: `网易云歌曲 ${i + 1}`,
              artist: "未知艺术家",
              url: "",
              type: "netease",
            })
          }
        }
      }

      if (mockTracks.length > 0) {
        mockTracks.forEach((track) => addTrack(track))
      }
    },
    [addTrack],
  )

  const savePlaylist = useCallback((playlist: ImportedPlaylist) => {
    setSavedPlaylists((prev) => [...prev, playlist])
  }, [])

  const deletePlaylist = useCallback((id: string) => {
    setSavedPlaylists((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const loadPlaylistTracks = useCallback((playlist: ImportedPlaylist) => {
    setPlaylist(playlist.tracks)
  }, [])

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !currentTrack) return
    setIsPlaying((prev) => !prev)
  }, [currentTrack])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    if (isPlaying) {
      if (!audioContextRef.current) {
        setupAudioContext()
      }

      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume()
      }

      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Playback failed:", error)
          // Don't immediately set isPlaying to false, 
          // as it might be a temporary issue or require another gesture
        })
      }
    } else {
      audio.pause()
    }
  }, [currentTrack?.id, isPlaying, setupAudioContext])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
    setIsMuted(newVolume === 0)
  }, [])

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume
        setIsMuted(false)
      } else {
        audioRef.current.volume = 0
        setIsMuted(true)
      }
    }
  }, [isMuted, volume])

  const skip = useCallback(
    (seconds: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds))
      }
    },
    [currentTime, duration],
  )

  const nextTrack = useCallback(
    (isAuto: boolean | any = false) => {
      if (playlist.length === 0) return
      const currentIndex = playlist.findIndex((t) => t.id === currentTrack?.id)
      let nextIndex: number
      const auto = isAuto === true

      if (isShuffled && playlist.length > 1) {
        // Pick a random index other than current
        let randomIndex
        do {
          randomIndex = Math.floor(Math.random() * playlist.length)
        } while (randomIndex === currentIndex)
        nextIndex = randomIndex
      } else {
        nextIndex = currentIndex + 1
        // If it's sequential (none) and we reached the end, stop if it's auto-play
        if (nextIndex >= playlist.length) {
          if (auto && repeatMode === "none") {
            setIsPlaying(false)
            return
          }
          nextIndex = 0 // Loop back to start for manual next or repeat all
        }
      }
      selectTrack(playlist[nextIndex], isPlaying || auto)
    },
    [playlist, currentTrack, selectTrack, isShuffled, repeatMode, isPlaying],
  )

  const prevTrack = useCallback(() => {
    if (playlist.length === 0) return
    const currentIndex = playlist.findIndex((t) => t.id === currentTrack?.id)
    let prevIndex: number

    if (isShuffled && playlist.length > 1) {
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      prevIndex = randomIndex
    } else {
      prevIndex = currentIndex - 1
      if (prevIndex < 0) {
        prevIndex = playlist.length - 1
      }
    }
    selectTrack(playlist[prevIndex], isPlaying)
  }, [playlist, currentTrack, selectTrack, isShuffled, isPlaying])

  const toggleShuffle = useCallback(() => {
    setIsShuffled((prev) => !prev)
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }, [])

  const handleEnded = useCallback(() => {
    if (repeatMode === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(console.error)
      }
    } else {
      nextTrack(true)
    }
  }, [nextTrack, repeatMode])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  const getAudioStream = useCallback(() => {
    if (!recorderDestRef.current) {
      setupAudioContext()
    }
    return recorderDestRef.current?.stream || null
  }, [setupAudioContext])

  const getAnalyserData = useCallback(() => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      return dataArray
    }
    return new Uint8Array(256)
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  return (
    <AudioContext.Provider
      value={{
        currentTrack,
        playlist,
        savedPlaylists,
        setPlaylist,
        addTrack,
        removeTrack,
        selectTrack,
        importPlaylist,
        savePlaylist,
        deletePlaylist,
        loadPlaylistTracks,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        repeatMode,
        isShuffled,
        visualizerType,
        setVisualizerType,
        analyserData,
        avatarImage,
        setAvatarImage,
        effects,
        setEffects,
        togglePlay,
        seek,
        setVolume,
        toggleMute,
        skip,
        nextTrack,
        prevTrack,
        setRepeatMode,
        toggleShuffle,
        getAudioStream,
        getAnalyserData,
        isFullscreen,
        toggleFullscreen,
        audioRef,
        fileInputRef,
        visualizerCanvasRef,
        playerBarRef,
      }}
    >
      {children}
      {currentTrack && currentTrack.url && (
        <audio
          ref={audioRef}
          src={currentTrack.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          crossOrigin="anonymous"
        />
      )}
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider")
  }
  return context
}
