"use client"

import { useState, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Progress } from "@/components/ui/progress"
import { Video, Download, X, Check } from "lucide-react"
import { useAudio } from "@/lib/audio-context"

type Resolution = "1280x720" | "1920x1080" | "3840x2160"

const RESOLUTIONS: { value: Resolution; label: string; description: string }[] = [
  { value: "1280x720", label: "720p HD", description: "1280 × 720" },
  { value: "1920x1080", label: "1080p Full HD", description: "1920 × 1080" },
  { value: "3840x2160", label: "4K Ultra HD", description: "3840 × 2160" },
]

export function VideoExportModal() {
  const { currentTrack, audioRef, visualizerType, analyserData, avatarImage, duration } = useAudio()
  const [open, setOpen] = useState(false)
  const [resolution, setResolution] = useState<Resolution>("1920x1080")
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exportStatus, setExportStatus] = useState<"idle" | "recording" | "processing" | "done" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const exportCanvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const animationFrameRef = useRef<number>()

  const parseResolution = (res: Resolution) => {
    const [width, height] = res.split("x").map(Number)
    return { width, height }
  }

  const drawVisualizerFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      data: Uint8Array,
      time: number,
      trackName: string,
      currentTime: number,
      totalDuration: number,
    ) => {
      // 绘制背景
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, "#0a0a1a")
      gradient.addColorStop(0.5, "#1a0a2e")
      gradient.addColorStop(1, "#0a0a1a")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // 计算播放器高度
      const playerHeight = Math.round(height * 0.12)
      const visualizerHeight = height - playerHeight

      // 绘制可视化区域
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255

      // 根据类型绘制不同的可视化效果
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, width, visualizerHeight)
      ctx.clip()

      drawVisualizerByType(ctx, width, visualizerHeight, data, time, avg, avatarImage)

      ctx.restore()

      // 绘制底部播放器栏
      drawPlayerBar(ctx, width, height, playerHeight, trackName, currentTime, totalDuration)
    },
    [avatarImage],
  )

  const drawVisualizerByType = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: Uint8Array,
    time: number,
    energy: number,
    avatar: string | null,
  ) => {
    const centerX = width / 2
    const centerY = height / 2
    const barCount = Math.min(128, data.length)

    switch (visualizerType) {
      case "bars": {
        const barWidth = width / barCount - 2
        for (let i = 0; i < barCount; i++) {
          const value = data[i] / 255
          const barHeight = value * height * 0.7
          const x = i * (barWidth + 2)
          const hue = (i / barCount) * 360 + time * 50

          const gradient = ctx.createLinearGradient(x, height, x, height - barHeight)
          gradient.addColorStop(0, `hsla(${hue}, 80%, 50%, 0.8)`)
          gradient.addColorStop(1, `hsla(${hue + 30}, 80%, 70%, 0.4)`)

          ctx.fillStyle = gradient
          ctx.fillRect(x, height - barHeight, barWidth, barHeight)

          // 顶部发光点
          ctx.beginPath()
          ctx.arc(x + barWidth / 2, height - barHeight, 4, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${hue}, 100%, 80%, 1)`
          ctx.fill()
        }
        break
      }
      case "wave": {
        for (let layer = 0; layer < 3; layer++) {
          ctx.beginPath()
          ctx.moveTo(0, height)
          for (let i = 0; i <= barCount; i++) {
            const value = data[Math.min(i, data.length - 1)] / 255
            const x = (i / barCount) * width
            const y = height / 2 + Math.sin(i * 0.1 + time + layer) * value * height * 0.3 * (1 - layer * 0.2)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = `hsla(${280 + layer * 30}, 80%, 60%, ${0.8 - layer * 0.2})`
          ctx.lineWidth = 3 - layer
          ctx.stroke()
        }
        break
      }
      case "circle":
      case "particles":
      case "spectrum":
      case "galaxy":
      case "vortex": {
        // 绘制圆形效果
        const maxRadius = Math.min(width, height) * 0.35
        for (let i = 0; i < barCount; i++) {
          const value = data[i] / 255
          const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2
          const radius = maxRadius * 0.4 + value * maxRadius * 0.6
          const x = centerX + Math.cos(angle) * radius
          const y = centerY + Math.sin(angle) * radius
          const innerX = centerX + Math.cos(angle) * maxRadius * 0.35
          const innerY = centerY + Math.sin(angle) * maxRadius * 0.35

          const hue = (i / barCount) * 360
          ctx.beginPath()
          ctx.moveTo(innerX, innerY)
          ctx.lineTo(x, y)
          ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.8)`
          ctx.lineWidth = 3
          ctx.stroke()
        }

        // 绘制中心头像
        if (avatar) {
          const avatarSize = maxRadius * 0.6
          ctx.save()
          ctx.beginPath()
          ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2)
          ctx.clip()

          const img = new Image()
          img.src = avatar
          try {
            ctx.drawImage(img, centerX - avatarSize / 2, centerY - avatarSize / 2, avatarSize, avatarSize)
          } catch {}
          ctx.restore()

          // 光环效果
          ctx.beginPath()
          ctx.arc(centerX, centerY, avatarSize / 2 + 5 + energy * 10, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(236, 72, 153, ${0.5 + energy * 0.5})`
          ctx.lineWidth = 3
          ctx.stroke()
        }
        break
      }
      case "lightning": {
        // 闪电效果
        for (let i = 0; i < 5; i++) {
          const startX = Math.random() * width
          const startY = 0
          let x = startX
          let y = startY

          ctx.beginPath()
          ctx.moveTo(x, y)

          while (y < height) {
            x += (Math.random() - 0.5) * 100
            y += Math.random() * 50 + 20
            ctx.lineTo(x, y)
          }

          ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 + energy * 0.7})`
          ctx.lineWidth = 2 + energy * 3
          ctx.shadowColor = "rgba(100, 200, 255, 1)"
          ctx.shadowBlur = 20
          ctx.stroke()
        }
        ctx.shadowBlur = 0
        break
      }
      default: {
        // 默认频谱
        for (let i = 0; i < barCount; i++) {
          const value = data[i] / 255
          const barHeight = value * height * 0.6
          const x = (i / barCount) * width
          const barWidth = width / barCount - 1

          ctx.fillStyle = `hsla(${(i / barCount) * 120 + 200}, 70%, 50%, 0.8)`
          ctx.fillRect(x, height - barHeight, barWidth, barHeight)
        }
      }
    }
  }

  const drawPlayerBar = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    playerHeight: number,
    trackName: string,
    currentTime: number,
    totalDuration: number,
  ) => {
    const playerY = height - playerHeight

    // 播放器背景
    ctx.fillStyle = "rgba(10, 10, 20, 0.95)"
    ctx.fillRect(0, playerY, width, playerHeight)

    // 顶部边框
    ctx.fillStyle = "rgba(100, 100, 150, 0.3)"
    ctx.fillRect(0, playerY, width, 1)

    // 进度条
    const progressBarY = playerY + 2
    const progressBarHeight = 4
    ctx.fillStyle = "rgba(60, 60, 80, 0.8)"
    ctx.fillRect(0, progressBarY, width, progressBarHeight)

    const progress = totalDuration > 0 ? currentTime / totalDuration : 0
    const gradient = ctx.createLinearGradient(0, 0, width * progress, 0)
    gradient.addColorStop(0, "#ec4899")
    gradient.addColorStop(1, "#8b5cf6")
    ctx.fillStyle = gradient
    ctx.fillRect(0, progressBarY, width * progress, progressBarHeight)

    // 歌曲信息
    const infoY = playerY + playerHeight * 0.5
    ctx.fillStyle = "#ffffff"
    ctx.font = `bold ${Math.round(playerHeight * 0.25)}px sans-serif`
    ctx.textBaseline = "middle"
    ctx.fillText(trackName || "未知歌曲", playerHeight * 0.5, infoY)

    // 时间显示
    const formatTime = (t: number) => {
      const mins = Math.floor(t / 60)
      const secs = Math.floor(t % 60)
      return `${mins}:${secs.toString().padStart(2, "0")}`
    }

    ctx.font = `${Math.round(playerHeight * 0.2)}px sans-serif`
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
    const timeText = `${formatTime(currentTime)} / ${formatTime(totalDuration)}`
    const timeWidth = ctx.measureText(timeText).width
    ctx.fillText(timeText, width - timeWidth - playerHeight * 0.5, infoY)

    // 播放按钮图标
    const btnSize = playerHeight * 0.35
    const btnX = width / 2
    const btnY = infoY

    ctx.beginPath()
    ctx.arc(btnX, btnY, btnSize, 0, Math.PI * 2)
    ctx.fillStyle = "#ec4899"
    ctx.fill()

    // 暂停图标
    ctx.fillStyle = "#ffffff"
    const barW = btnSize * 0.2
    const barH = btnSize * 0.6
    ctx.fillRect(btnX - barW - 2, btnY - barH / 2, barW, barH)
    ctx.fillRect(btnX + 2, btnY - barH / 2, barW, barH)
  }

  const startExport = async () => {
    if (!currentTrack || !audioRef.current) {
      setErrorMessage("请先选择音乐")
      setExportStatus("error")
      return
    }

    setIsExporting(true)
    setExportStatus("recording")
    setProgress(0)
    chunksRef.current = []

    const { width, height } = parseResolution(resolution)

    // 创建离屏canvas
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")!

    exportCanvasRef.current = canvas

    try {
      // 创建媒体流
      const stream = canvas.captureStream(30)

      // 添加音频轨道
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaElementSource(audioRef.current.cloneNode(true) as HTMLAudioElement)
      const dest = audioCtx.createMediaStreamDestination()
      source.connect(dest)
      source.connect(audioCtx.destination)

      dest.stream.getAudioTracks().forEach((track) => {
        stream.addTrack(track)
      })

      // 设置MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: resolution === "3840x2160" ? 20000000 : resolution === "1920x1080" ? 10000000 : 5000000,
      })

      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        setExportStatus("processing")
        setTimeout(() => {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          const url = URL.createObjectURL(blob)

          const a = document.createElement("a")
          a.href = url
          a.download = `${currentTrack.name || "音乐可视化"}_${resolution}.webm`
          a.click()

          URL.revokeObjectURL(url)
          setExportStatus("done")
          setIsExporting(false)
        }, 500)
      }

      recorder.start(100)

      // 开始录制动画
      const totalDuration = audioRef.current.duration || 30
      const startTime = performance.now()
      const lastTime = 0

      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000
        const currentProgress = Math.min(elapsed / totalDuration, 1)
        setProgress(currentProgress * 100)

        // 模拟音频数据
        const fakeData = new Uint8Array(256)
        for (let i = 0; i < 256; i++) {
          fakeData[i] = Math.floor(
            128 + Math.sin(elapsed * 5 + i * 0.1) * 60 + Math.sin(elapsed * 3 + i * 0.05) * 40 + Math.random() * 30,
          )
        }

        drawVisualizerFrame(
          ctx,
          width,
          height,
          analyserData.length > 0 ? analyserData : fakeData,
          elapsed,
          currentTrack.name || "未知歌曲",
          elapsed,
          totalDuration,
        )

        if (elapsed < totalDuration) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          recorder.stop()
        }
      }

      animate()
    } catch (error) {
      console.error("Export error:", error)
      setErrorMessage("导出失败，请重试")
      setExportStatus("error")
      setIsExporting(false)
    }
  }

  const cancelExport = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setIsExporting(false)
    setExportStatus("idle")
    setProgress(0)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-transparent h-9 md:h-10 px-4">
          <Video className="w-4 h-4" />
          <span className="hidden sm:inline">导出视频</span>
          <span className="sm:hidden">导出</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            导出可视化视频
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 分辨率选择 */}
          <div className="space-y-3">
            <Label>选择分辨率</Label>
            <RadioGroup
              value={resolution}
              onValueChange={(v) => setResolution(v as Resolution)}
              disabled={isExporting}
              className="grid gap-2"
            >
              {RESOLUTIONS.map((res) => (
                <div
                  key={res.value}
                  className={`flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    resolution === res.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
                  }`}
                  onClick={() => !isExporting && setResolution(res.value)}
                >
                  <RadioGroupItem value={res.value} id={res.value} />
                  <div className="flex-1">
                    <Label htmlFor={res.value} className="cursor-pointer font-medium">
                      {res.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{res.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* 导出进度 */}
          {isExporting && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {exportStatus === "recording" && "正在录制..."}
                  {exportStatus === "processing" && "正在处理..."}
                </span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* 完成状态 */}
          {exportStatus === "done" && (
            <div className="flex items-center gap-2 text-green-500 bg-green-500/10 rounded-lg p-3">
              <Check className="w-5 h-5" />
              <span>视频导出成功！</span>
            </div>
          )}

          {/* 错误状态 */}
          {exportStatus === "error" && (
            <div className="flex items-center gap-2 text-red-500 bg-red-500/10 rounded-lg p-3">
              <X className="w-5 h-5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 提示信息 */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>* 导出的视频将包含可视化效果和底部播放控件</p>
            <p>* 更高分辨率需要更长的处理时间</p>
            <p>* 导出格式为 WebM，可在大多数播放器中播放</p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          {isExporting ? (
            <Button variant="destructive" onClick={cancelExport} className="flex-1">
              <X className="w-4 h-4 mr-2" />
              取消导出
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
                取消
              </Button>
              <Button onClick={startExport} disabled={!currentTrack} className="flex-1 gap-2">
                {exportStatus === "done" ? (
                  <>
                    <Download className="w-4 h-4" />
                    重新导出
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    开始导出
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
