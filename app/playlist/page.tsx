"use client"

import type React from "react"
import { useAudio } from "@/lib/audio-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Music2, Play, Pause, Trash2, Upload, Link2, Save, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function PlaylistPage() {
  const {
    playlist,
    savedPlaylists,
    addTrack,
    removeTrack,
    selectTrack,
    currentTrack,
    isPlaying,
    togglePlay,
    savePlaylist,
    deletePlaylist,
    loadPlaylistTracks,
    importPlaylist,
  } = useAudio()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState("")
  const [playlistName, setPlaylistName] = useState("")
  const [importUrl, setImportUrl] = useState("")
  const [importing, setImporting] = useState(false)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach((file) => {
        const url = URL.createObjectURL(file)
        const track = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          url,
          type: "local" as const,
        }
        addTrack(track)
      })
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      const track = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: "在线音乐 - " + urlInput.substring(0, 30),
        url: urlInput.trim(),
        type: "url" as const,
      }
      addTrack(track)
      setUrlInput("")
    }
  }

  const handleTrackClick = async (track: typeof currentTrack) => {
    if (!track) return
    if (currentTrack?.id === track.id) {
      await togglePlay()
    } else {
      selectTrack(track)
    }
  }

  const handleSavePlaylist = () => {
    if (!playlistName.trim() || playlist.length === 0) return
    savePlaylist({
      id: `${Date.now()}`,
      name: playlistName,
      source: "qqmusic",
      tracks: playlist,
      importedAt: new Date(),
    })
    setPlaylistName("")
  }

  const handleImport = async (source: "qqmusic" | "netease") => {
    if (!importUrl.trim()) return
    setImporting(true)
    try {
      await importPlaylist(importUrl, source)
      setImportUrl("")
    } catch (error) {
      console.error("Import failed:", error)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border/50">
        <h1 className="text-2xl font-bold">播放列表</h1>
        <p className="text-muted-foreground mt-1">管理你的音乐库，导入QQ音乐或网易云歌单</p>
      </header>

      <div className="p-6 border-b border-border/50 space-y-4">
        {/* Upload & URL */}
        <div className="flex flex-wrap gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="w-4 h-4" />
            上传本地音乐
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 bg-transparent"
              >
                <FolderOpen className="w-4 h-4" />
                导入歌单
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
              <DialogHeader>
                <DialogTitle>导入音乐歌单</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="qqmusic" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    value="qqmusic"
                    className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
                  >
                    QQ音乐
                  </TabsTrigger>
                  <TabsTrigger
                    value="netease"
                    className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400"
                  >
                    网易云音乐
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="qqmusic" className="space-y-4 mt-4">
                  <Input
                    placeholder="https://y.qq.com/n/ryqq/playlist/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="bg-secondary/50"
                  />
                  <Button
                    onClick={() => handleImport("qqmusic")}
                    disabled={importing || !importUrl.trim()}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {importing ? "导入中..." : "导入QQ音乐歌单"}
                  </Button>
                </TabsContent>
                <TabsContent value="netease" className="space-y-4 mt-4">
                  <Input
                    placeholder="https://music.163.com/playlist?id=..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="bg-secondary/50"
                  />
                  <Button
                    onClick={() => handleImport("netease")}
                    disabled={importing || !importUrl.trim()}
                    className="w-full bg-red-600 hover:bg-red-700"
                  >
                    {importing ? "导入中..." : "导入网易云歌单"}
                  </Button>
                </TabsContent>
              </Tabs>
              <p className="text-xs text-muted-foreground">注：由于版权限制，导入功能需要后端API支持。</p>
            </DialogContent>
          </Dialog>
        </div>

        {/* URL input */}
        <div className="flex gap-2">
          <Input
            placeholder="输入音乐链接..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
            className="flex-1"
          />
          <Button onClick={handleUrlSubmit} variant="outline" className="gap-2 bg-transparent">
            <Link2 className="w-4 h-4" />
            添加
          </Button>
        </div>

        {playlist.length > 0 && (
          <div className="flex gap-2">
            <Input
              placeholder="输入歌单名称保存..."
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleSavePlaylist}
              variant="outline"
              className="gap-2 border-primary/50 text-primary hover:bg-primary/10 bg-transparent"
            >
              <Save className="w-4 h-4" />
              保存歌单
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {savedPlaylists.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary" />
                已保存的歌单
              </h3>
              <div className="grid gap-2">
                {savedPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                      <Music2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{pl.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {pl.tracks.length} 首歌曲 · {pl.source === "qqmusic" ? "QQ音乐" : "网易云"}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => loadPlaylistTracks(pl)} className="gap-1">
                      <Play className="w-3 h-3" />
                      加载
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deletePlaylist(pl.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 当前播放列表 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">当前播放列表 ({playlist.length})</h3>
            {playlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <Music2 className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">播放列表为空</h3>
                <p className="text-muted-foreground mt-1">上传音乐文件、添加链接或导入歌单开始播放</p>
              </div>
            ) : (
              <div className="space-y-2">
                {playlist.map((track, index) => (
                  <div
                    key={track.id}
                    className={cn(
                      "group flex items-center gap-4 p-4 rounded-xl transition-all cursor-pointer",
                      currentTrack?.id === track.id
                        ? "bg-primary/10 border border-primary/30"
                        : "bg-secondary/30 hover:bg-secondary/50 border border-transparent",
                    )}
                    onClick={() => handleTrackClick(track)}
                  >
                    <div
                      className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-all",
                        currentTrack?.id === track.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary group-hover:bg-primary/20",
                      )}
                    >
                      {currentTrack?.id === track.id && isPlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {track.artist ||
                          (track.type === "local"
                            ? "本地文件"
                            : track.type === "qqmusic"
                              ? "QQ音乐"
                              : track.type === "netease"
                                ? "网易云"
                                : "在线链接")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground tabular-nums">#{index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTrack(track.id)
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
