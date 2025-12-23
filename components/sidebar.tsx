"use client"

import type React from "react"
import { useState, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { useAudio } from "@/lib/audio-context"
import {
  Music2,
  ListMusic,
  Upload,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Play,
  Sliders,
  Sparkles,
  Download,
  CloudDownload,
  UserCircle,
  ImagePlus,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const navItems = [
  { href: "/", label: "可视化", icon: Sparkles },
  { href: "/playlist", label: "播放列表", icon: ListMusic },
  { href: "/effects", label: "音效调节", icon: Sliders },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { playlist, addTrack, removeTrack, selectTrack, currentTrack, importPlaylist, avatarImage, setAvatarImage } =
    useAudio()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [importUrl, setImportUrl] = useState("")
  const [importing, setImporting] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

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

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setAvatarImage(url)
    }
    if (avatarInputRef.current) {
      avatarInputRef.current.value = ""
    }
  }

  const handleImport = async (source: "qqmusic" | "netease") => {
    if (!importUrl.trim()) return
    setImporting(true)
    try {
      await importPlaylist(importUrl, source)
      setImportUrl("")
      setImportDialogOpen(false)
    } catch (error) {
      console.error("Import failed:", error)
    } finally {
      setImporting(false)
    }
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-border/50 bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-72",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <Music2 className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg">SoundWave</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn("shrink-0", collapsed && "mx-auto")}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      <div className="p-3 border-b border-border/50">
        <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
        <button
          onClick={() => avatarInputRef.current?.click()}
          className={cn(
            "w-full flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-secondary/50",
            collapsed && "justify-center",
          )}
        >
          {avatarImage ? (
            <div className="relative">
              <img
                src={avatarImage || "/placeholder.svg"}
                alt="Avatar"
                className={cn(
                  "rounded-full object-cover border-2 border-primary/50",
                  collapsed ? "w-10 h-10" : "w-14 h-14",
                )}
              />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                <ImagePlus className="w-4 h-4 text-white" />
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 border-2 border-dashed border-primary/50 flex items-center justify-center",
                collapsed ? "w-10 h-10" : "w-14 h-14",
              )}
            >
              <UserCircle className={cn("text-primary/70", collapsed ? "w-5 h-5" : "w-7 h-7")} />
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">{avatarImage ? "更换头像" : "上传头像"}</p>
              <p className="text-xs text-muted-foreground">显示在可视化中心</p>
            </div>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "bg-primary/20 text-primary hover:bg-primary/30",
                  collapsed && "justify-center px-2",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Button>
            </Link>
          )
        })}
      </nav>

      {/* Upload & Import Section */}
      <div className="p-2 space-y-2 border-t border-border/50">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          className={cn("w-full gap-2 border-primary/50 hover:bg-primary/10 hover:text-primary", collapsed && "px-2")}
        >
          <Upload className="w-4 h-4 shrink-0" />
          {!collapsed && <span>上传音乐</span>}
        </Button>

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full gap-2 border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-400",
                collapsed && "px-2",
              )}
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              {!collapsed && <span>导入歌单</span>}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                导入音乐歌单
              </DialogTitle>
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
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">粘贴QQ音乐歌单链接或歌单ID</p>
                  <Input
                    placeholder="https://y.qq.com/n/ryqq/playlist/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="bg-secondary/50"
                  />
                </div>
                <Button
                  onClick={() => handleImport("qqmusic")}
                  disabled={importing || !importUrl.trim()}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {importing ? "导入中..." : "导入QQ音乐歌单"}
                </Button>
              </TabsContent>
              <TabsContent value="netease" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">粘贴网易云音乐歌单链接或歌单ID</p>
                  <Input
                    placeholder="https://music.163.com/playlist?id=..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="bg-secondary/50"
                  />
                </div>
                <Button
                  onClick={() => handleImport("netease")}
                  disabled={importing || !importUrl.trim()}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  {importing ? "导入中..." : "导入网易云歌单"}
                </Button>
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground mt-2">
              注：由于版权限制，部分歌曲可能无法播放。导入功能需要后端API支持。
            </p>
          </DialogContent>
        </Dialog>
      </div>

      {/* Playlist Preview */}
      {!collapsed && (
        <div className="flex-1 flex flex-col min-h-0 border-t border-border/50">
          <div className="px-4 py-2 text-sm font-medium text-muted-foreground">播放列表 ({playlist.length})</div>
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1 pb-4">
              {playlist.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">暂无音乐，点击上方上传</p>
              ) : (
                playlist.map((track) => (
                  <div
                    key={track.id}
                    className={cn(
                      "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                      currentTrack?.id === track.id ? "bg-primary/20 text-primary" : "hover:bg-secondary",
                    )}
                    onClick={() => selectTrack(track)}
                  >
                    <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                      {currentTrack?.id === track.id ? (
                        <Play className="w-3 h-3 fill-current" />
                      ) : (
                        <Music2 className="w-3 h-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{track.name}</span>
                      {track.artist && (
                        <span className="text-xs text-muted-foreground truncate block">{track.artist}</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTrack(track.id)
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {collapsed && playlist.length > 0 && (
        <div className="p-2 border-t border-border/50">
          <div className="w-full h-8 rounded bg-secondary/50 flex items-center justify-center">
            <span className="text-xs font-medium">{playlist.length}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
