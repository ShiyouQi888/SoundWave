"use client"

import { useState, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Progress } from "@/components/ui/progress"
import { Video, Download, X, Check } from "lucide-react"
import { useAudio, type VisualizerType } from "@/lib/audio-context"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  maxLife: number
  angle?: number
  speed?: number
  hue?: number
}

const safeNumber = (value: number, fallback = 0): number => {
  if (!Number.isFinite(value) || Number.isNaN(value)) return fallback
  return value
}

const safeAlpha = (value: number): number => {
  const v = safeNumber(value, 0)
  return Math.max(0, Math.min(1, v))
}

const safeHue = (value: number): number => {
  const v = safeNumber(value, 0)
  return ((v % 360) + 360) % 360
}

const safePct = (value: number, fallback = 50): number => {
  const v = safeNumber(value, fallback)
  return Math.max(0, Math.min(100, v))
}

const safeRGB = (value: number): number => {
  return Math.max(0, Math.min(255, Math.round(safeNumber(value, 0))))
}

const safeHSLA = (h: number, s: number, l: number, a: number): string => {
  return `hsla(${safeHue(h)}, ${safePct(s)}%, ${safePct(l)}%, ${safeAlpha(a)})`
}

const safeRGBA = (r: number, g: number, b: number, a: number): string => {
  return `rgba(${safeRGB(r)}, ${safeRGB(g)}, ${safeRGB(b)}, ${safeAlpha(a)})`
}

const safeCreateLinearGradient = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): CanvasGradient | null => {
  const sx0 = safeNumber(x0)
  const sy0 = safeNumber(y0)
  const sx1 = safeNumber(x1)
  const sy1 = safeNumber(y1)
  if (sx0 === sx1 && sy0 === sy1) {
    return null
  }
  try {
    return ctx.createLinearGradient(sx0, sy0, sx1, sy1)
  } catch {
    return null
  }
}

const safeCreateRadialGradient = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number,
): CanvasGradient | null => {
  const sx0 = safeNumber(x0)
  const sy0 = safeNumber(y0)
  const sr0 = Math.max(0, safeNumber(r0))
  const sx1 = safeNumber(x1)
  const sy1 = safeNumber(y1)
  const sr1 = Math.max(0.1, safeNumber(r1, 0.1))
  try {
    return ctx.createRadialGradient(sx0, sy0, sr0, sx1, sy1, sr1)
  } catch {
    return null
  }
}

const safeAddColorStop = (gradient: CanvasGradient | null, offset: number, color: string): void => {
  if (!gradient) return
  try {
    const safeOffset = Math.max(0, Math.min(1, safeNumber(offset, 0)))
    gradient.addColorStop(safeOffset, color)
  } catch {
    // Ignore invalid color errors
  }
}

type Resolution = "1280x720" | "1920x1080" | "3840x2160"

const RESOLUTIONS: { value: Resolution; label: string; description: string }[] = [
  { value: "1280x720", label: "720p HD", description: "1280 × 720" },
  { value: "1920x1080", label: "1080p Full HD", description: "1920 × 1080" },
  { value: "3840x2160", label: "4K Ultra HD", description: "3840 × 2160" },
]

export function VideoExportModal() {
  const { currentTrack, audioRef, visualizerType, avatarImage, duration, getAudioStream, getAnalyserData } = useAudio()
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

  // --- 共享的可视化渲染辅助函数 (同步自 visualizer-canvas.tsx) ---
  const pulsePattern = [
    // P波: 小幅圆润隆起
    0, 0.01, 0.02, 0.04, 0.06, 0.07, 0.08, 0.08, 0.07, 0.06, 0.04, 0.02, 0.01, 0,
    // PR段: 平坦基线
    0, 0, 0, 0, 0, 0,
    // QRS波群: 极具张力的组合
    -0.02, -0.05, -0.1, -0.15, // Q波: 短暂下探
    0.1, 0.3, 0.6, 0.9, 1.0, 0.8, 0.5, 0.2, 0, // R波: 极高且尖锐的主峰
    -0.1, -0.2, -0.3, -0.2, -0.1, // S波: 深而窄的下冲
    // ST段: 基线平稳
    0, 0, 0, 0, 0, 0,
    // T波: 较宽且圆润的复极波
    0.01, 0.03, 0.06, 0.1, 0.15, 0.19, 0.22, 0.24, 0.25, 0.25, 0.24, 0.22, 0.19, 0.15, 0.1, 0.06, 0.03, 0.01,
    // 基线回归
    0, 0, 0, 0,
  ]

  const drawCenterGlow = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    energy: number,
    time: number,
  ) => {
    const safeEnergy = safeNumber(energy, 0)
    const safeRadius = Math.max(10, safeNumber(radius, 50))

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + time * 0.02
      const beamLength = safeRadius * 2 + safeEnergy * safeRadius

      const gradient = safeCreateLinearGradient(
        ctx,
        centerX + Math.cos(angle) * safeRadius * 0.5,
        centerY + Math.sin(angle) * safeRadius * 0.5,
        centerX + Math.cos(angle) * (safeRadius * 0.5 + beamLength),
        centerY + Math.sin(angle) * (safeRadius * 0.5 + beamLength),
      )
      if (gradient) {
        safeAddColorStop(gradient, 0, safeRGBA(236, 72, 153, 0))
        safeAddColorStop(gradient, 0.3, safeRGBA(236, 72, 153, 0.3 + safeEnergy * 0.4))
        safeAddColorStop(gradient, 1, safeRGBA(168, 85, 247, 0))

        ctx.beginPath()
        ctx.moveTo(centerX + Math.cos(angle) * safeRadius * 0.5, centerY + Math.sin(angle) * safeRadius * 0.5)
        ctx.lineTo(
          centerX + Math.cos(angle) * (safeRadius * 0.5 + beamLength),
          centerY + Math.sin(angle) * (safeRadius * 0.5 + beamLength),
        )
        ctx.strokeStyle = gradient
        ctx.lineWidth = 3 + safeEnergy * 5
        ctx.stroke()
      }
    }

    const glowGradient = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, safeRadius * 1.8)
    if (glowGradient) {
      safeAddColorStop(glowGradient, 0, safeRGBA(236, 72, 153, 0.8 + safeEnergy * 0.2))
      safeAddColorStop(glowGradient, 0.4, safeRGBA(168, 85, 247, 0.5 + safeEnergy * 0.3))
      safeAddColorStop(glowGradient, 0.7, safeRGBA(59, 130, 246, 0.2 + safeEnergy * 0.2))
      safeAddColorStop(glowGradient, 1, "transparent")
      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, safeRadius * 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const drawCenterAvatar = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    energy: number,
    time: number,
    avatarImg?: HTMLImageElement | null,
  ) => {
    const safeEnergy = safeNumber(energy, 0)
    const safeRadius = Math.max(10, safeNumber(radius, 50))

    if (!avatarImg) {
      drawCenterGlow(ctx, centerX, centerY, safeRadius, safeEnergy, time)
      return
    }

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + time * 0.02
      const beamLength = safeRadius * 2 + safeEnergy * safeRadius

      const gradient = safeCreateLinearGradient(
        ctx,
        centerX + Math.cos(angle) * safeRadius * 0.5,
        centerY + Math.sin(angle) * safeRadius * 0.5,
        centerX + Math.cos(angle) * (safeRadius * 0.5 + beamLength),
        centerY + Math.sin(angle) * (safeRadius * 0.5 + beamLength),
      )
      if (gradient) {
        safeAddColorStop(gradient, 0, safeRGBA(236, 72, 153, 0))
        safeAddColorStop(gradient, 0.3, safeRGBA(236, 72, 153, 0.3 + safeEnergy * 0.4))
        safeAddColorStop(gradient, 1, safeRGBA(168, 85, 247, 0))

        ctx.beginPath()
        ctx.moveTo(centerX + Math.cos(angle) * safeRadius * 0.5, centerY + Math.sin(angle) * safeRadius * 0.5)
        ctx.lineTo(
          centerX + Math.cos(angle) * (safeRadius * 0.5 + beamLength),
          centerY + Math.sin(angle) * (safeRadius * 0.5 + beamLength),
        )
        ctx.strokeStyle = gradient
        ctx.lineWidth = 3 + safeEnergy * 5
        ctx.stroke()
      }
    }

    const glowGradient = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, safeRadius * 1.5)
    if (glowGradient) {
      safeAddColorStop(glowGradient, 0, safeRGBA(236, 72, 153, 0.8 + safeEnergy * 0.2))
      safeAddColorStop(glowGradient, 0.4, safeRGBA(168, 85, 247, 0.5 + safeEnergy * 0.3))
      safeAddColorStop(glowGradient, 0.7, safeRGBA(59, 130, 246, 0.2 + safeEnergy * 0.2))
      safeAddColorStop(glowGradient, 1, "transparent")
      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, safeRadius * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.save()
    ctx.beginPath()
    ctx.arc(centerX, centerY, safeRadius, 0, Math.PI * 2)
    ctx.clip()
    try {
      ctx.drawImage(avatarImg, centerX - safeRadius, centerY - safeRadius, safeRadius * 2, safeRadius * 2)
    } catch (e) {
      drawCenterGlow(ctx, centerX, centerY, safeRadius, safeEnergy, time)
    }
    ctx.restore()

    ctx.beginPath()
    ctx.arc(centerX, centerY, safeRadius + 5 + safeEnergy * 10, 0, Math.PI * 2)
    ctx.strokeStyle = safeRGBA(236, 72, 153, 0.5 + safeEnergy * 0.5)
    ctx.lineWidth = 3
    ctx.stroke()
  }

  const drawVisualizerFrame = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: Uint8Array,
    time: number,
    trackName: string,
    currentTime: number,
    totalDuration: number,
    avatarImg: HTMLImageElement | null,
    state: any,
  ) => {
    // 绘制背景
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, width, height)

    // 绘制内容
    drawVisualizerByType(ctx, width, height, data, visualizerType, avatarImg, time, state)
  }

  const drawVisualizerByType = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    data: Uint8Array,
    type: VisualizerType,
    avatarImg: HTMLImageElement | null,
    time: number,
    state: any,
  ) => {
    switch (type) {
      case "bars": {
        // 频谱柱状 - 对称极光版 (同步自 visualizer-canvas.tsx)
        const avgEnergy = data.reduce((sum, val) => sum + val, 0) / data.length / 255
        
        const barCount = 64
        const gap = Math.max(2, (width / barCount) * 0.15)
        const barWidth = width / barCount - gap

        if (!state.barCaps || state.barCaps.length !== barCount) {
          state.barCaps = new Array(barCount).fill(0)
        }

        ctx.save()
        const bottomY = height - 20

        for (let i = 0; i < barCount; i++) {
          const halfCount = barCount / 2
          const distanceFromCenter = Math.abs(i - (halfCount - 0.5))
          const normalizedDist = distanceFromCenter / halfCount
          const dataIndex = Math.floor(normalizedDist * data.length * 0.7)
          const value = safeNumber(data[dataIndex] / 255, 0)
          const targetHeight = Math.max(4, value * (height * 0.65))

          if (targetHeight > state.barCaps[i]) {
            state.barCaps[i] = targetHeight
          } else {
            state.barCaps[i] = Math.max(targetHeight, state.barCaps[i] - 2.5)
          }

          const x = i * (barWidth + gap) + gap / 2
          const y = bottomY - targetHeight
          const hue = safeHue(280 - normalizedDist * 120 + value * 40)

          const gradient = safeCreateLinearGradient(ctx, x, y, x, bottomY)
          if (gradient) {
            safeAddColorStop(gradient, 0, safeHSLA(hue, 90, 65, 0.9))
            safeAddColorStop(gradient, 0.6, safeHSLA(hue + 20, 80, 50, 0.7))
            safeAddColorStop(gradient, 1, safeHSLA(hue + 40, 70, 40, 0.4))
            ctx.fillStyle = gradient
            ctx.shadowBlur = 10 + value * 15
            ctx.shadowColor = safeHSLA(hue, 90, 60, 0.6)
            ctx.beginPath()
            ctx.roundRect(x, y, barWidth, targetHeight, [4, 4, 0, 0])
            ctx.fill()
          }

          const capY = bottomY - state.barCaps[i] - 6
          ctx.fillStyle = safeHSLA(hue, 100, 95, 1)
          ctx.shadowBlur = 15
          ctx.shadowColor = "#ffffff"
          ctx.beginPath()
          ctx.roundRect(x, capY, barWidth, 3, [1.5, 1.5, 1.5, 1.5])
          ctx.fill()

          const reflectHeight = targetHeight * 0.4
          const reflectGradient = safeCreateLinearGradient(ctx, x, bottomY, x, bottomY + reflectHeight)
          if (reflectGradient) {
            safeAddColorStop(reflectGradient, 0, safeHSLA(hue, 80, 60, 0.3))
            safeAddColorStop(reflectGradient, 1, "transparent")
            ctx.fillStyle = reflectGradient
            ctx.shadowBlur = 0
            ctx.beginPath()
            ctx.fillRect(x, bottomY, barWidth, reflectHeight)
            ctx.fill()
          }
        }

        // 绘制一条底部的发光线
        const lineGradient = safeCreateLinearGradient(ctx, 0, bottomY, width, bottomY)
        if (lineGradient) {
          lineGradient.addColorStop(0, "transparent")
          lineGradient.addColorStop(0.2, "rgba(255, 255, 255, 0.1)")
          lineGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.3)")
          lineGradient.addColorStop(0.8, "rgba(255, 255, 255, 0.1)")
          lineGradient.addColorStop(1, "transparent")
          ctx.fillStyle = lineGradient
          ctx.fillRect(0, bottomY, width, 1)
        }

        ctx.restore()
        break
      }

      case "spheres": {
        // 碎裂玻璃 - 极致碎裂版
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        
        // 1. 震动效果
        if (state.shake === undefined) state.shake = 0
        if (avgEnergy > 0.7) {
          state.shake = Math.max(state.shake, avgEnergy * 20 * scaleFactor)
        }
        const shakeX = (Math.random() - 0.5) * state.shake
        const shakeY = (Math.random() - 0.5) * state.shake
        state.shake *= 0.85

        ctx.save()
        ctx.translate(shakeX, shakeY)

        // 2. 纯黑背景
        ctx.fillStyle = "#000000"
        ctx.fillRect(-50, -50, width + 100, height + 100)

        const centerX = width / 2
        const centerY = height / 2

        // 3. 弹孔生成逻辑
        if (!state.bulletHoles) state.bulletHoles = []
        if (!state.shards) state.shards = []
        if (state.lastHoleTime === undefined) state.lastHoleTime = 0

        if (avgEnergy > 0.62 && time - state.lastHoleTime > 0.12) {
          state.lastHoleTime = time
          const holeSize = (20 + avgEnergy * 50) * scaleFactor
          
          // 生成裂缝 (带分支)
          const cracksCount = Math.floor(10 + avgEnergy * 15)
          const cracks = []
          for (let i = 0; i < cracksCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const length = holeSize * (4 + Math.random() * 8)
            const mainCrack = {
              angle,
              length,
              opacity: 0.5 + Math.random() * 0.5,
              branches: [] as any[]
            }
            if (length > 100 * scaleFactor) {
              const branchCount = Math.floor(Math.random() * 3)
              for (let b = 0; b < branchCount; b++) {
                mainCrack.branches.push({
                  angle: angle + (Math.random() - 0.5) * 1.5,
                  length: length * (0.2 + Math.random() * 0.3),
                  pos: 0.3 + Math.random() * 0.5
                })
              }
            }
            cracks.push(mainCrack)
          }

          // 生成蜘蛛网状环
          const rings = []
          const ringCount = 4 + Math.floor(Math.random() * 4)
          for (let r = 0; r < ringCount; r++) {
            const radius = holeSize * (1 + r * 1.2)
            const points = []
            const segments = 16
            for (let s = 0; s < segments; s++) {
              const angle = (s / segments) * Math.PI * 2
              const dist = radius * (0.85 + Math.random() * 0.3)
              points.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist
              })
            }
            rings.push({ radius, points })
          }

          const holeX = Math.random() * width
          const holeY = Math.random() * height

          state.bulletHoles.push({
            x: holeX,
            y: holeY,
            size: holeSize,
            life: 1.0,
            cracks,
            rings
          })

          // 生成飞溅的玻璃碎片 (Shards)
          const shardCount = 15 + Math.floor(avgEnergy * 25)
          for (let i = 0; i < shardCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = (8 + Math.random() * 20) * scaleFactor
            const points = []
            const sides = 3 + Math.floor(Math.random() * 3)
            for (let s = 0; s < sides; s++) {
              const a = (s / sides) * Math.PI * 2
              const d = 0.5 + Math.random() * 0.5
              points.push({ x: Math.cos(a) * d, y: Math.sin(a) * d })
            }

            state.shards.push({
              x: holeX,
              y: holeY,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 2 * scaleFactor,
              size: (3 + Math.random() * 10) * scaleFactor,
              rotation: Math.random() * Math.PI * 2,
              vRotation: (Math.random() - 0.5) * 0.6,
              life: 1.0,
              color: Math.random() > 0.4 ? "rgba(255, 255, 255, 0.9)" : "rgba(180, 220, 255, 0.6)",
              points
            })
          }
        }

        // 更新碎片物理
        state.shards = state.shards.filter((shard: any) => {
          shard.x += shard.vx
          shard.y += shard.vy
          shard.vy += 0.35 * scaleFactor
          shard.vx *= 0.99
          shard.rotation += shard.vRotation
          shard.life -= 0.015
          return shard.life > 0
        })

        // 更新弹孔生命周期
        state.bulletHoles = state.bulletHoles.filter((hole: any) => {
          hole.life -= 0.0025
          return hole.life > 0
        })

        // 4. 绘制前面的一层“玻璃”
        const glassGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.sqrt(width*width + height*height)/2)
        glassGrad.addColorStop(0, "rgba(255, 255, 255, 0.03)")
        glassGrad.addColorStop(1, "rgba(255, 255, 255, 0.15)")
        ctx.fillStyle = glassGrad
        ctx.fillRect(0, 0, width, height)

        // 绘制反光条
        ctx.save()
        ctx.globalCompositeOperation = "screen"
        for (let i = 0; i < 3; i++) {
          const offset = ((time * 150 + i * 500) % (width + height * 1.5)) - height
          const reflectGrad = ctx.createLinearGradient(0, offset, height, offset + height)
          reflectGrad.addColorStop(0, "rgba(255, 255, 255, 0)")
          reflectGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)")
          reflectGrad.addColorStop(1, "rgba(255, 255, 255, 0)")
          ctx.fillStyle = reflectGrad
          ctx.fillRect(0, 0, width, height)
        }
        ctx.restore()

        // 5. 绘制弹孔细节
        state.bulletHoles.forEach((hole: any) => {
          const alpha = hole.life

          // A. 绘制蜘蛛网环
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`
          ctx.lineWidth = 1 * scaleFactor
          hole.rings.forEach((ring: any) => {
            ctx.beginPath()
            ring.points.forEach((p: any, i: number) => {
              if (i === 0) ctx.moveTo(hole.x + p.x, hole.y + p.y)
              else ctx.lineTo(hole.x + p.x, hole.y + p.y)
            })
            ctx.closePath()
            ctx.stroke()
          })

          // B. 绘制碎裂纹
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`
          ctx.lineWidth = 1.5 * scaleFactor
          hole.cracks.forEach((crack: any) => {
            ctx.beginPath()
            ctx.moveTo(hole.x, hole.y)
            
            const segments = 3
            for (let s = 1; s <= segments; s++) {
              const t = s / segments
              const targetX = hole.x + Math.cos(crack.angle) * crack.length * t
              const targetY = hole.y + Math.sin(crack.angle) * crack.length * t
              const jitter = (1 - t) * 15 * scaleFactor
              const currentX = targetX + (Math.random() - 0.5) * jitter
              const currentY = targetY + (Math.random() - 0.5) * jitter
              ctx.lineTo(currentX, currentY)

              const branch = crack.branches?.find((b: any) => Math.abs(b.pos - t) < 0.2)
              if (branch) {
                ctx.save()
                ctx.beginPath()
                ctx.moveTo(currentX, currentY)
                ctx.lineTo(
                  currentX + Math.cos(branch.angle) * branch.length,
                  currentY + Math.sin(branch.angle) * branch.length
                )
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`
                ctx.lineWidth = 0.8 * scaleFactor
                ctx.stroke()
                ctx.restore()
              }
            }
            ctx.stroke()
          })

          // C. 绘制中心撞击点
          const holeGrad = ctx.createRadialGradient(hole.x, hole.y, 0, hole.x, hole.y, hole.size)
          holeGrad.addColorStop(0, `rgba(0, 0, 0, ${alpha * 0.98})`)
          holeGrad.addColorStop(0.3, `rgba(10, 10, 20, ${alpha * 0.9})`)
          holeGrad.addColorStop(0.7, `rgba(40, 40, 50, ${alpha * 0.4})`)
          holeGrad.addColorStop(1, "transparent")
          
          ctx.fillStyle = holeGrad
          ctx.beginPath()
          ctx.arc(hole.x, hole.y, hole.size, 0, Math.PI * 2)
          ctx.fill()

          // D. 撞击边缘白色亮线
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`
          ctx.lineWidth = 2.5 * scaleFactor
          ctx.beginPath()
          ctx.arc(hole.x, hole.y, hole.size * 0.35, 0, Math.PI * 2)
          ctx.stroke()
        })

        // 6. 绘制飞溅碎片
        state.shards.forEach((shard: any) => {
          ctx.save()
          ctx.translate(shard.x, shard.y)
          ctx.rotate(shard.rotation)
          ctx.fillStyle = shard.color
          ctx.globalAlpha = shard.life
          
          ctx.beginPath()
          shard.points.forEach((p: any, i: number) => {
            if (i === 0) ctx.moveTo(p.x * shard.size, p.y * shard.size)
            else ctx.lineTo(p.x * shard.size, p.y * shard.size)
          })
          ctx.closePath()
          ctx.fill()
          
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
          ctx.lineWidth = 0.5 * scaleFactor
          ctx.stroke()
          ctx.restore()
        })

        // 7. 中心头像
        const avatarSize = (75 + avgEnergy * 35) * scaleFactor
        if (avatarImg) {
          ctx.save()
          ctx.shadowBlur = (30 + avgEnergy * 40) * scaleFactor
          ctx.shadowColor = "rgba(255, 255, 255, 0.7)"
          
          ctx.beginPath()
          ctx.arc(centerX, centerY, avatarSize, 0, Math.PI * 2)
          ctx.clip()
          try {
            ctx.drawImage(avatarImg, centerX - avatarSize, centerY - avatarSize, avatarSize * 2, avatarSize * 2)
          } catch (e) {}
          ctx.restore()

          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)"
          ctx.lineWidth = 4 * scaleFactor
          ctx.beginPath()
          ctx.arc(centerX, centerY, avatarSize, 0, Math.PI * 2)
          ctx.stroke()
        }

        ctx.restore()
        break
      }

      case "wave": {
        // 波浪曲线 - 1:1 参考图极致复刻版
        const avgEnergy = data.reduce((sum, val) => sum + val, 0) / data.length / 255
        const bassEnergy = data.slice(0, 15).reduce((sum, val) => sum + val, 0) / 15 / 255
        const timeValue = time * 0.015
        const centerY = height * 0.58

        ctx.save()
        // 远景模糊频谱
        const specCount = 120
        const specWidth = width / specCount
        for (let i = 0; i < specCount; i++) {
          const dIdx = Math.floor((i / specCount) * data.length * 0.7)
          const val = data[dIdx] / 255
          const h = 200 + Math.sin(i * 0.05 + timeValue) * 60
          const hFactor = val * (height * 0.45)
          const x = i * specWidth
          const grad = ctx.createLinearGradient(x, centerY - hFactor, x, centerY)
          grad.addColorStop(0, "transparent")
          grad.addColorStop(0.5, safeHSLA(h, 90, 60, 0.12 * val))
          grad.addColorStop(1, "transparent")
          ctx.fillStyle = grad
          ctx.fillRect(x, centerY - hFactor, specWidth - 1, hFactor)
        }

        // 3D 瓷砖感地面
        ctx.globalCompositeOperation = "screen"
        const rows = 18
        const cols = 24
        for (let i = 0; i < rows; i++) {
          const z = i / rows
          const y = centerY + z * (height - centerY)
          const alpha = 0.05 + z * 0.3
          
          // 横线
          ctx.beginPath()
          ctx.strokeStyle = `rgba(0, 200, 255, ${alpha * (0.8 + bassEnergy * 0.2)})`
          ctx.lineWidth = 0.5 + z * 2
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
          ctx.stroke()

          // 模拟瓷砖表面的光斑反射
          if (i % 2 === 0) {
            const rectAlpha = alpha * 0.1
            ctx.fillStyle = `rgba(0, 150, 255, ${rectAlpha})`
            ctx.fillRect(0, y, width, ((height - centerY) / rows) * 0.5)
          }
        }
        for (let i = 0; i <= cols; i++) {
          const xRatio = i / cols
          const xBottom = (xRatio - 0.5) * width * 3.5 + width / 2
          const xTop = (xRatio - 0.5) * width * 0.1 + width / 2
          ctx.beginPath()
          ctx.strokeStyle = `rgba(0, 200, 255, ${0.05 + Math.abs(xRatio - 0.5) * 0.15})`
          ctx.lineWidth = 1
          ctx.moveTo(xTop, centerY)
          ctx.lineTo(xBottom, height)
          ctx.stroke()
        }

        // 复刻版霓虹曲线
        const curves = [
          { h: 195, offset: 0, speed: 1.2, amp: 1.4, color: "#00f2ff" },
          { h: 280, offset: 2, speed: 0.8, amp: 1.1, color: "#7000ff" },
          { h: 10, offset: 4, speed: 1.0, amp: 1.2, color: "#ffae00" },
          { h: 320, offset: 1, speed: 0.9, amp: 0.9, color: "#ff00ea" },
        ]

        curves.forEach((c) => {
          const points: { x: number; y: number }[] = []
          const step = 5
          const cTime = timeValue * c.speed
          for (let x = -20; x <= width + 20; x += step) {
            const t = x / width
            const dIdx = Math.floor(Math.abs(t - 0.5) * 2 * data.length * 0.3)
            const audioVal = data[dIdx] / 255
            const wave =
              Math.sin(x * 0.005 + cTime + c.offset) * 45 +
              Math.sin(x * 0.012 - cTime * 0.6) * 25 +
              Math.cos(x * 0.003 + cTime * 0.4) * 15
            const y = centerY - (wave + audioVal * 160) * c.amp
            points.push({ x, y })
          }

          // A. 绘制地面倒影 (关键：带模糊感和拉伸)
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(points[0].x, centerY + (centerY - points[0].y) * 0.5)
          for (let i = 1; i < points.length - 2; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2
            const yc = centerY + (centerY - (points[i].y + points[i + 1].y) / 2) * 0.5
            ctx.quadraticCurveTo(points[i].x, centerY + (centerY - points[i].y) * 0.5, xc, yc)
          }
          ctx.strokeStyle = c.color
          ctx.lineWidth = 6
          ctx.globalAlpha = 0.08 + bassEnergy * 0.1
          ctx.stroke()
          ctx.restore()

          // B. 绘制主体霓虹线 (三层结构)
          const drawPath = (w: number, a: number, blur: number, col: string) => {
            ctx.beginPath()
            ctx.moveTo(points[0].x, points[0].y)
            for (let i = 1; i < points.length - 2; i++) {
              const xc = (points[i].x + points[i + 1].x) / 2
              const yc = (points[i].y + points[i + 1].y) / 2
              ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
            }
            ctx.lineWidth = w
            ctx.globalAlpha = a
            ctx.strokeStyle = col
            if (blur > 0) {
              ctx.shadowBlur = blur * 0.7
              ctx.shadowColor = col
            }
            ctx.stroke()
            ctx.shadowBlur = 0
          }
          drawPath(12 + bassEnergy * 10, 0.12, 0, c.color)
          drawPath(4 + bassEnergy * 4, 0.45, 12, c.color)
          drawPath(1.5, 1, 3, "#ffffff")
        })

        drawCenterAvatar(ctx, width / 2, centerY, 50 + avgEnergy * 15, avgEnergy, time, avatarImg)
        ctx.restore()
        break
      }

      case "circle": {
        // 仪表盘版 (Dashboard) - 警灯爆闪 + 极致拟真
        const centerX = width / 2
        const centerY = height / 2
        const dashWidth = Math.min(width * 0.9, 1000)
        const dashHeight = dashWidth * 0.35
        const dashY = centerY - dashHeight / 2
        const gaugeRadius = dashHeight * 0.8
        const scaleFactor = dashWidth / 1000

        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)
        const midEnergy = safeNumber(
          data.slice(data.length / 4, data.length / 2).reduce((sum, val) => sum + val, 0) / (data.length / 4) / 255,
          0,
        )

        // 1. 警灯爆闪逻辑
        const drawPoliceLight = (lx: number, ly: number, isRed: boolean, intensity: number, sScale = 1.0) => {
          const bRadius = 35 * intensity * sScale
          const dRadius = 800 * intensity * sScale
          ctx.save()
          ctx.globalCompositeOperation = "lighter"
          ctx.shadowBlur = 80 * intensity
          const color = isRed ? "255, 0, 50" : "0, 80, 255"
          const coreColor = isRed ? "255, 200, 200" : "200, 230, 255"
          ctx.shadowColor = `rgba(${color}, ${0.8 * intensity})`

          const wideGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, dRadius)
          wideGrad.addColorStop(0, `rgba(${color}, ${0.9 * intensity})`)
          wideGrad.addColorStop(0.2, `rgba(${color}, ${0.5 * intensity})`)
          wideGrad.addColorStop(0.5, `rgba(${color}, ${0.15 * intensity})`)
          wideGrad.addColorStop(1, "transparent")
          ctx.fillStyle = wideGrad
          ctx.beginPath()
          ctx.arc(lx, ly, dRadius, 0, Math.PI * 2)
          ctx.fill()

          for (let i = 0; i < 3; i++) {
            const cDiffGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, bRadius * (6 + i))
            cDiffGrad.addColorStop(0, `rgba(${coreColor}, ${1.0 * intensity})`)
            cDiffGrad.addColorStop(0.4, `rgba(${color}, ${0.7 * intensity})`)
            cDiffGrad.addColorStop(1, "transparent")
            ctx.fillStyle = cDiffGrad
            ctx.beginPath()
            ctx.arc(lx, ly, bRadius * (6 + i), 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        }

        const flashRate = 80
        const flashTime = Math.floor(time * flashRate)
        const isFlashRed = Math.floor(time * 18) % 2 === 0
        let lightIntensity = 0
        const isHighPeak = bassEnergy > 0.72 || avgEnergy > 0.68
        if (isHighPeak) {
          lightIntensity = (flashTime % 3 === 0 ? 1 : 0) * (1.2 + avgEnergy * 0.3)
        } else if (bassEnergy > 0.45 || avgEnergy > 0.45) {
          lightIntensity = 0.15 * avgEnergy
        }

        if (lightIntensity > 0) {
          ctx.save()
          ctx.globalCompositeOperation = "lighter"
          const ambientColor = isFlashRed ? "255, 0, 0" : "0, 50, 255"
          const vGrad = ctx.createRadialGradient(centerX, centerY, gaugeRadius, centerX, centerY, width * 0.8)
          vGrad.addColorStop(0, "transparent")
          vGrad.addColorStop(1, `rgba(${ambientColor}, ${0.3 * lightIntensity})`)
          ctx.fillStyle = vGrad
          ctx.fillRect(0, 0, width, height)

          // 顶部危险条纹背景
          if (isFlashRed && lightIntensity > 0.8) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.15)"
            ctx.font = `bold ${Math.max(40, 120 * scaleFactor)}px Arial`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.globalAlpha = 0.2 * lightIntensity
            ctx.fillText("DANGER", centerX, centerY - gaugeRadius * 0.6)
            ctx.fillText("DANGER", centerX, centerY + gaugeRadius * 0.6)
          }
          ctx.restore()
          drawPoliceLight(isFlashRed ? 0 : width, centerY, isFlashRed, lightIntensity, 1.2)
        }

        const shakeX = (avgEnergy > 0.6 ? (Math.random() - 0.5) * (avgEnergy - 0.5) * 15 : 0)
        const shakeY = (avgEnergy > 0.6 ? (Math.random() - 0.5) * (avgEnergy - 0.5) * 15 : 0)

        const rpmFactor = bassEnergy * 0.8 + midEnergy * 0.2
        const speedValue = Math.floor(rpmFactor * 220)
        const rpmValue = (rpmFactor * 8).toFixed(1)

        ctx.save()
        ctx.translate(shakeX, shakeY)

        if (lightIntensity > 0) {
          // 左表盘中心 - 蓝色
          drawPoliceLight(centerX - dashWidth * 0.3, centerY, false, lightIntensity, 0.95)
          // 右表盘中心 - 红色
          drawPoliceLight(centerX + dashWidth * 0.3, centerY, true, lightIntensity, 0.95)
        }

        // 1. 绘制底部蓝色氛围灯 (Finned Ambient Light)
        ctx.save()
        const finCount = 40
        const finWidth = dashWidth * 0.4
        const finX = centerX - finWidth / 2
        const finY = dashY + dashHeight * 0.9
        for (let i = 0; i < finCount; i++) {
          const x = finX + (i / finCount) * finWidth
          const h = 15 * (1 - Math.abs(i - finCount / 2) / (finCount / 2)) * (0.8 + avgEnergy * 0.4)
          const alpha = (0.3 + avgEnergy * 0.5) * (1 - Math.abs(i - finCount / 2) / (finCount / 2))
          ctx.strokeStyle = `rgba(100, 150, 255, ${alpha})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x, finY)
          ctx.lineTo(x + 5, finY - h)
          ctx.stroke()
        }
        ctx.restore()

        // 2. 左侧时速表
        const gx1 = centerX - dashWidth * 0.3
        const gy1 = centerY
        ctx.strokeStyle = "rgba(100, 150, 255, 0.2)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(gx1, gy1, gaugeRadius, Math.PI * 0.7, Math.PI * 1.6)
        ctx.stroke()
        for (let i = 0; i <= 220; i += 20) {
          const angle = Math.PI * 0.75 + (i / 220) * (Math.PI * 0.8)
          const isMajor = i % 40 === 0
          const len = isMajor ? 15 : 8
          ctx.strokeStyle = i <= speedValue ? "#fff" : "rgba(255, 255, 255, 0.3)"
          ctx.lineWidth = isMajor ? 2 : 1
          ctx.beginPath()
          ctx.moveTo(gx1 + Math.cos(angle) * (gaugeRadius - 5), gy1 + Math.sin(angle) * (gaugeRadius - 5))
          ctx.lineTo(gx1 + Math.cos(angle) * (gaugeRadius - 5 - len), gy1 + Math.sin(angle) * (gaugeRadius - 5 - len))
          ctx.stroke()
          if (isMajor) {
            ctx.font = `${Math.round(12 * scaleFactor)}px Arial`
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
            ctx.textAlign = "center"
            ctx.fillText(i.toString(), gx1 + Math.cos(angle) * (gaugeRadius - 35 * scaleFactor), gy1 + Math.sin(angle) * (gaugeRadius - 35 * scaleFactor))
          }
        }
        const needleAngle1 = Math.PI * 0.75 + (speedValue / 220) * (Math.PI * 0.8)
        ctx.save()
        ctx.strokeStyle = "#ff3333"
        ctx.lineWidth = 4 * scaleFactor
        ctx.shadowBlur = 10 * scaleFactor
        ctx.shadowColor = "#ff3333"
        ctx.beginPath()
        ctx.moveTo(gx1, gy1)
        ctx.lineTo(gx1 + Math.cos(needleAngle1) * (gaugeRadius - 15 * scaleFactor), gy1 + Math.sin(needleAngle1) * (gaugeRadius - 15 * scaleFactor))
        ctx.stroke()
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(gx1, gy1, 6 * scaleFactor, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.save()
        ctx.shadowBlur = 15 * scaleFactor
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
        ctx.font = `bold ${Math.round(72 * scaleFactor)}px 'Courier New', monospace`
        ctx.fillStyle = "#fff"
        ctx.textAlign = "center"
        ctx.fillText(speedValue.toString(), gx1, gy1 + 20 * scaleFactor)
        ctx.restore()
        ctx.font = `${Math.round(14 * scaleFactor)}px Arial`
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
        ctx.fillText("km/h", gx1 + 60 * scaleFactor, gy1 + 20 * scaleFactor)

        // 3. 右侧转速表
        const gx2 = centerX + dashWidth * 0.3
        const gy2 = centerY
        ctx.strokeStyle = "rgba(100, 150, 255, 0.2)"
        ctx.lineWidth = 2 * scaleFactor
        ctx.beginPath()
        ctx.arc(gx2, gy2, gaugeRadius, Math.PI * 1.4, Math.PI * 2.3)
        ctx.stroke()
        for (let i = 0; i <= 8; i++) {
          const angle = Math.PI * 2.25 - (i / 8) * (Math.PI * 0.8)
          const isRed = i >= 7
          ctx.strokeStyle = 8 - i <= parseFloat(rpmValue) ? (isRed ? "#ff3333" : "#fff") : "rgba(255, 255, 255, 0.3)"
          ctx.lineWidth = 3 * scaleFactor
          ctx.beginPath()
          ctx.moveTo(gx2 + Math.cos(angle) * (gaugeRadius - 5 * scaleFactor), gy2 + Math.sin(angle) * (gaugeRadius - 5 * scaleFactor))
          ctx.lineTo(gx2 + Math.cos(angle) * (gaugeRadius - 25 * scaleFactor), gy2 + Math.sin(angle) * (gaugeRadius - 25 * scaleFactor))
          ctx.stroke()
          ctx.font = `bold ${Math.round(16 * scaleFactor)}px Arial`
          ctx.fillStyle = isRed ? "#ff3333" : "rgba(255, 255, 255, 0.6)"
          ctx.textAlign = "center"
          ctx.fillText(i.toString(), gx2 + Math.cos(angle) * (gaugeRadius - 45 * scaleFactor), gy2 + Math.sin(angle) * (gaugeRadius - 45 * scaleFactor))
        }
        const needleAngle2 = Math.PI * 2.25 - (parseFloat(rpmValue) / 8) * (Math.PI * 0.8)
        ctx.save()
        ctx.strokeStyle = "#ff3333"
        ctx.lineWidth = 4 * scaleFactor
        ctx.shadowBlur = 10 * scaleFactor
        ctx.shadowColor = "#ff3333"
        ctx.beginPath()
        ctx.moveTo(gx2, gy2)
        ctx.lineTo(gx2 + Math.cos(needleAngle2) * (gaugeRadius - 15 * scaleFactor), gy2 + Math.sin(needleAngle2) * (gaugeRadius - 15 * scaleFactor))
        ctx.stroke()
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(gx2, gy2, 6 * scaleFactor, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.save()
        ctx.shadowBlur = 15 * scaleFactor
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
        ctx.font = `bold ${Math.round(72 * scaleFactor)}px 'Courier New', monospace`
        ctx.fillStyle = "#fff"
        ctx.textAlign = "center"
        ctx.fillText(rpmValue, gx2, gy2 + 20 * scaleFactor)
        ctx.restore()
        ctx.font = `${Math.round(14 * scaleFactor)}px Arial`
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
        ctx.fillText("x1000rpm", gx2 + 80 * scaleFactor, gy2 + 20 * scaleFactor)

        // 4. 中央信息面板
        const pw = dashWidth * 0.2
        const ph = dashHeight * 0.6
        const px = centerX - pw / 2
        const py = centerY - ph / 2
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
        ctx.lineWidth = 2 * scaleFactor
        ctx.strokeRect(centerX - 15 * scaleFactor, centerY - 40 * scaleFactor, 30 * scaleFactor, 50 * scaleFactor)
        ctx.beginPath()
        ctx.moveTo(centerX - 15 * scaleFactor, centerY - 15 * scaleFactor)
        ctx.lineTo(centerX - 25 * scaleFactor, centerY - 15 * scaleFactor) // 左车门开
        ctx.stroke()
        ctx.font = `${Math.round(16 * scaleFactor)}px Arial`
        ctx.fillStyle = "#fff"
        ctx.textAlign = "left"
        ctx.fillText("17℃", px + 10 * scaleFactor, py + ph - 10 * scaleFactor)
        ctx.textAlign = "right"
        ctx.fillText("1000P", px + pw - 10 * scaleFactor, py + ph - 10 * scaleFactor)
        ctx.textAlign = "center"
        ctx.font = `${Math.round(14 * scaleFactor)}px Arial`
        ctx.fillText("⛽ 53km", centerX, py + 20 * scaleFactor)

        // 5. 警告图标
        const iconY = centerY - dashHeight * 0.35
        ctx.fillStyle = avgEnergy > 0.5 ? "#ff3333" : "rgba(255, 50, 50, 0.2)"
        ctx.fillRect(centerX - 120, iconY, 20, 12)
        ctx.fillStyle = rpmFactor > 0.8 ? "#ff9900" : "rgba(255, 150, 0, 0.2)"
        ctx.beginPath()
        ctx.arc(centerX + 110, iconY + 6, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#ff3333"
        ctx.beginPath()
        ctx.moveTo(centerX - 40, iconY)
        ctx.lineTo(centerX - 30, iconY + 15)
        ctx.lineTo(centerX - 50, iconY + 15)
        ctx.fill()

        ctx.restore()
        drawCenterAvatar(ctx, centerX, centerY, 50 + avgEnergy * 10, avgEnergy, time, avatarImg)
        break
      }

      case "particles": {
        // 心电图版 (ECG)
        const centerX = width / 2
        const centerY = height / 2
        const pulseCenterY = centerY + 80
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassData = data.slice(0, data.length / 8)
        const bassEnergy = safeNumber(bassData.reduce((sum, val) => sum + val, 0) / bassData.length / 255, 0)

        if (!state.ecgBuffer || state.ecgBuffer.length !== Math.ceil(width)) {
          state.ecgBuffer = new Array(Math.ceil(width)).fill(pulseCenterY)
          state.ecgState = { x: 0, lastBeat: 0, pulseIndex: -1, currentAmplitude: 1 }
        }

        // 2. 绘制网格
        ctx.save()
        // 细网格 (15px)
        ctx.strokeStyle = "rgba(0, 255, 100, 0.08)"
        ctx.lineWidth = 0.5
        ctx.beginPath()
        for (let x = 0; x < width; x += 15) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
        for (let y = 0; y < height; y += 15) {
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
        ctx.stroke()

        // 粗网格 (75px)
        ctx.strokeStyle = "rgba(0, 255, 100, 0.15)"
        ctx.lineWidth = 1.0
        ctx.beginPath()
        for (let x = 0; x < width; x += 75) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
        for (let y = 0; y < height; y += 75) {
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
        ctx.stroke()
        ctx.restore()

        const speed = 5
        const ecgState = state.ecgState

        // 检测鼓点触发心跳
        if (bassEnergy > 0.5 && ecgState.pulseIndex === -1 && time - ecgState.lastBeat > 0.2) {
          ecgState.pulseIndex = 0
          ecgState.lastBeat = time

          const baseRand = Math.random()
          if (baseRand > 0.8) {
            ecgState.currentAmplitude = 1.1 + Math.random() * 0.2
          } else if (baseRand < 0.3) {
            ecgState.currentAmplitude = 0.4 + Math.random() * 0.2
          } else {
            ecgState.currentAmplitude = 0.7 + bassEnergy * 0.5
          }
        }

        for (let i = 0; i < speed; i++) {
          ecgState.x = (ecgState.x + 1) % Math.ceil(width)
          let yOffset = 0
          if (ecgState.pulseIndex >= 0) {
            const progress = ecgState.pulseIndex
            if (progress < pulsePattern.length) {
              const maxPossibleOffset = height * 0.42
              // 在 R 波峰引入抖动
              const jitter = progress > 15 && progress < 25 ? (Math.random() - 0.5) * 15 * ecgState.currentAmplitude : 0
              yOffset = -pulsePattern[progress] * maxPossibleOffset * ecgState.currentAmplitude + jitter
              ecgState.pulseIndex++
            } else {
              ecgState.pulseIndex = -1
            }
          }
          const waveIndex = Math.floor((ecgState.x / width) * data.length)
          const waveVal = ((data[waveIndex] - 128) / 128) * 25 * avgEnergy
          state.ecgBuffer[ecgState.x] = pulseCenterY + yOffset + waveVal
        }

        const head = ecgState.x
        const buf = state.ecgBuffer
        const len = buf.length
        const gap = 100

        ctx.save()
        ctx.lineCap = "round"
        ctx.lineJoin = "round"

        // 旧波形余晖
        if (head + gap < len) {
          ctx.beginPath()
          ctx.strokeStyle = "rgba(0, 150, 50, 0.15)"
          ctx.lineWidth = 2
          ctx.shadowBlur = 2
          ctx.shadowColor = "rgba(0, 255, 0, 0.2)"
          ctx.moveTo(head + gap, buf[head + gap])
          for (let x = head + gap + 1; x < len; x++) {
            ctx.lineTo(x, buf[x])
          }
          ctx.stroke()
        }

        // 新波形
        ctx.beginPath()
        ctx.strokeStyle = "#ff3333"
        ctx.lineWidth = 3.5
        ctx.shadowBlur = 10
        ctx.shadowColor = "rgba(255, 0, 0, 0.7)"
        if (head > 0) {
          ctx.moveTo(0, buf[0])
          for (let x = 1; x <= head; x++) ctx.lineTo(x, buf[x])
        }
        ctx.stroke()

        // 扫描头爆闪效果
        const strobeEnergy = Math.pow(avgEnergy, 2.5)
        const flashSize = 10 + strobeEnergy * 20
        const glowIntensity = 40 + strobeEnergy * 150

        ctx.save()
        if (strobeEnergy > 0.3) {
          ctx.globalCompositeOperation = "lighter"
          const flashAlpha = strobeEnergy * 0.3
          ctx.fillStyle = `rgba(255, 50, 50, ${flashAlpha})`
          ctx.fillRect(0, 0, width, height)

          ctx.fillStyle = `rgba(255, 255, 255, ${strobeEnergy * 0.45})`
          ctx.fillRect(0, buf[head] - 1.5, width, 3)
          ctx.fillRect(head - 1.5, 0, 3, height)
        }

        ctx.globalCompositeOperation = "lighter"
        const scanGradient = ctx.createRadialGradient(head, buf[head], 0, head, buf[head], glowIntensity * 3.5)
        scanGradient.addColorStop(0, `rgba(255, 20, 20, ${0.5 + strobeEnergy * 0.3})`)
        scanGradient.addColorStop(0.3, `rgba(255, 0, 0, 0.15)`)
        scanGradient.addColorStop(1, "transparent")
        ctx.fillStyle = scanGradient
        ctx.beginPath()
        ctx.arc(head, buf[head], glowIntensity * 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.shadowColor = "#ff0000"
        ctx.shadowBlur = glowIntensity * 0.8
        ctx.fillStyle = "#ff0000"
        ctx.beginPath()
        ctx.arc(head, buf[head], flashSize, 0, Math.PI * 2)
        ctx.fill()

        ctx.shadowColor = "#ffffff"
        ctx.shadowBlur = glowIntensity * 0.6
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.arc(head, buf[head], flashSize * 0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.restore()

        // 医疗信息面板
        const infoScale = Math.min(1, width / 800)
        ctx.font = `bold ${Math.max(12, 16 * infoScale)}px sans-serif`
        ctx.fillStyle = "rgba(0, 255, 100, 0.8)"
        ctx.fillText(`HR: ${Math.floor(65 + bassEnergy * 55)} BPM`, 25 * infoScale, 35 * infoScale)
        ctx.font = `${Math.max(10, 12 * infoScale)}px sans-serif`
        ctx.fillStyle = "rgba(0, 255, 100, 0.5)"
        ctx.fillText(`II  25mm/s  10mm/mV`, 25 * infoScale, 55 * infoScale)

        // 中心头像
        drawCenterAvatar(ctx, centerX, centerY, 50 + avgEnergy * 10, avgEnergy, time, avatarImg)
        break
      }

      case "spectrum": {
        // 环形光谱 - 能量核心版
        const centerX = width / 2
        const centerY = height / 2
        const maxRadius = Math.min(width, height) * 0.35
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)

        ctx.save()
        ctx.globalCompositeOperation = "screen"

        // 1. 外部旋转光束
        for (let beam = 0; beam < 16; beam++) {
          const angle = (beam / 16) * Math.PI * 2 + time * 1.2
          const beamLength = 200 + avgEnergy * 150
          const startRadius = maxRadius * 0.8

          const gradient = safeCreateLinearGradient(
            ctx,
            centerX + Math.cos(angle) * startRadius,
            centerY + Math.sin(angle) * startRadius,
            centerX + Math.cos(angle) * (startRadius + beamLength),
            centerY + Math.sin(angle) * (startRadius + beamLength),
          )
          if (gradient) {
            const hue = safeHue(260 + beam * 20 + avgEnergy * 50)
            safeAddColorStop(gradient, 0, safeHSLA(hue, 100, 70, 0.4 + avgEnergy * 0.3))
            safeAddColorStop(gradient, 1, "transparent")

            ctx.beginPath()
            ctx.moveTo(centerX + Math.cos(angle) * startRadius, centerY + Math.sin(angle) * startRadius)
            ctx.lineTo(
              centerX + Math.cos(angle) * (startRadius + beamLength),
              centerY + Math.sin(angle) * (startRadius + beamLength),
            )
            ctx.strokeStyle = gradient
            ctx.lineWidth = 4 + avgEnergy * 6
            ctx.lineCap = "round"
            ctx.stroke()
          }
        }

        // 2. 多层环形光谱
        const segments = 120
        const layers = 4

        for (let layer = 0; layer < layers; layer++) {
          const baseRadius = maxRadius * (0.5 + layer * 0.15)
          const segmentAngle = (Math.PI * 2) / segments
          const rotationOffset = time * (0.6 + layer * 0.3) * (layer % 2 === 0 ? 1 : -1)

          for (let i = 0; i < segments; i++) {
            const dataIndex = Math.floor((i / segments) * data.length * (0.5 + layer * 0.1))
            const value = safeNumber(data[dataIndex] / 255, 0)

            const startAngle = i * segmentAngle + rotationOffset
            const endAngle = startAngle + segmentAngle * 0.8

            const barHeight = 10 + value * (40 + layer * 20)
            const currentRadius = baseRadius + barHeight

            ctx.beginPath()
            ctx.arc(centerX, centerY, baseRadius, startAngle, endAngle)
            ctx.arc(centerX, centerY, currentRadius, endAngle, startAngle, true)
            ctx.closePath()

            const hue = safeHue(240 + layer * 30 + (i / segments) * 60 + value * 60)
            ctx.fillStyle = safeHSLA(hue, 90, 60, 0.4 + value * 0.6)

            if (value > 0.4) {
              ctx.shadowBlur = 10
              ctx.shadowColor = safeHSLA(hue, 90, 60, 0.8)
            } else {
              ctx.shadowBlur = 0
            }

            ctx.fill()
          }
        }

        ctx.restore()
        ctx.shadowBlur = 0

        // 3. 绘制中心头像/核心
        drawCenterAvatar(ctx, centerX, centerY, 50 + avgEnergy * 10, avgEnergy, time, avatarImg)
        break
      }

      case "galaxy": {
        // 星系漩涡 - 3D 宇宙星云版
        const centerX = width / 2
        const centerY = height / 2
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassEnergy = safeNumber(data.slice(0, 20).reduce((sum, val) => sum + val, 0) / 20 / 255, 0)

        ctx.save()
        ctx.globalCompositeOperation = "screen"

        const timeVal = time * 0.9
        const fov = 400

        // 1. 体积感星云背景
        const nebulaCount = 8
        for (let i = 0; i < nebulaCount; i++) {
          const angle = timeVal * 0.4 + (i / nebulaCount) * Math.PI * 2
          const radiusBase = 120 + Math.sin(timeVal * 0.5 + i) * 60
          const z = Math.cos(timeVal * 0.3 + i) * 100
          const perspective = fov / (fov + z)

          const x = centerX + Math.cos(angle) * radiusBase * perspective
          const y = centerY + Math.sin(angle) * radiusBase * perspective
          const nebulaSize = (250 + avgEnergy * 150) * perspective

          const gradient = safeCreateRadialGradient(ctx, x, y, 0, x, y, nebulaSize)
          if (gradient) {
            const colors = [
              { h: 180, s: 80, l: 50 },
              { h: 260, s: 70, l: 40 },
              { h: 320, s: 90, l: 50 },
              { h: 210, s: 80, l: 30 },
            ]
            const c = colors[i % colors.length]
            const alpha = (0.05 + bassEnergy * 0.08) * perspective
            safeAddColorStop(gradient, 0, safeHSLA(c.h, c.s, c.l, alpha))
            safeAddColorStop(gradient, 0.6, safeHSLA(c.h + 20, c.s, c.l - 10, alpha * 0.3))
            safeAddColorStop(gradient, 1, "transparent")

            ctx.fillStyle = gradient
            ctx.beginPath()
            ctx.arc(x, y, nebulaSize, 0, Math.PI * 2)
            ctx.fill()
          }
        }

        // 2. 3D 螺旋臂粒子流
        const armCount = 4
        const particlesPerArm = 60
        const rotationY = timeVal * 0.5
        const rotationX = Math.sin(timeVal * 0.2) * 0.5

        const allParticles: any[] = []

        for (let arm = 0; arm < armCount; arm++) {
          const armPhase = (arm / armCount) * Math.PI * 2
          for (let i = 0; i < particlesPerArm; i++) {
            const t = i / particlesPerArm
            const dataIndex = Math.floor(t * data.length * 0.5)
            const value = data[dataIndex] / 255

            const angle = armPhase + t * Math.PI * 4 + timeVal * 0.8
            const radius = t * (Math.min(width, height) * 0.7)

            let px = Math.cos(angle) * radius
            let py = (Math.random() - 0.5) * 40 * t
            let pz = Math.sin(angle) * radius

            const cosX = Math.cos(rotationX)
            const sinX = Math.sin(rotationX)
            const y1 = py * cosX - pz * sinX
            const z1 = py * sinX + pz * cosX
            py = y1
            pz = z1

            const cosY = Math.cos(rotationY)
            const sinY = Math.sin(rotationY)
            const x2 = px * cosY + pz * sinY
            const z2 = -px * sinY + pz * cosY
            px = x2
            pz = z2

            const perspective = fov / (fov + pz)
            const screenX = centerX + px * perspective
            const screenY = centerY + py * perspective

            const size = (1.2 + value * 5) * perspective * (1.1 - t * 0.5)
            const alpha = (0.25 + value * 0.6) * (pz > -fov ? perspective : 0) * (1 - t * 0.3)
            const hue = safeHue(180 + t * 150 + value * 60)

            allParticles.push({
              x: screenX,
              y: screenY,
              z: pz,
              size: size,
              color: safeHSLA(hue, 100, 75, alpha),
              alpha: alpha,
            })
          }
        }

        allParticles
          .sort((a, b) => b.z - a.z)
          .forEach((p) => {
            if (p.alpha <= 0) return
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
            ctx.fillStyle = p.color
            if (p.size > 4) {
              ctx.shadowBlur = p.size * 1.2
              ctx.shadowColor = p.color
            }
            ctx.fill()
            ctx.shadowBlur = 0
          })

        // 3. 超大体积核心
        const coreSize = (25 + bassEnergy * 40)
        const coreGrad = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, coreSize * 4)
        if (coreGrad) {
          safeAddColorStop(coreGrad, 0, "#ffffff")
          safeAddColorStop(coreGrad, 0.1, safeRGBA(255, 255, 200, 0.8))
          safeAddColorStop(coreGrad, 0.3, safeRGBA(0, 200, 255, 0.3))
          safeAddColorStop(coreGrad, 0.6, safeRGBA(100, 50, 255, 0.1))
          safeAddColorStop(coreGrad, 1, "transparent")
          ctx.fillStyle = coreGrad
          ctx.beginPath()
          ctx.arc(centerX, centerY, coreSize * 4, 0, Math.PI * 2)
          ctx.fill()
        }

        // 核心喷流
        ctx.lineWidth = 2 + bassEnergy * 4
        const jetLength = 150 + bassEnergy * 250
        const upJetY = centerY - jetLength
        const upGrad = ctx.createLinearGradient(centerX, centerY, centerX, upJetY)
        upGrad.addColorStop(0, "#fff")
        upGrad.addColorStop(1, "transparent")
        ctx.strokeStyle = upGrad
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.lineTo(centerX, upJetY)
        ctx.stroke()

        const downJetY = centerY + jetLength
        const downGrad = ctx.createLinearGradient(centerX, centerY, centerX, downJetY)
        downGrad.addColorStop(0, "#fff")
        downGrad.addColorStop(1, "transparent")
        ctx.strokeStyle = downGrad
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.lineTo(centerX, downJetY)
        ctx.stroke()

        ctx.restore()
        drawCenterAvatar(ctx, centerX, centerY, 50 + avgEnergy * 10, avgEnergy, time, avatarImg)
        break
      }

      case "dna": {
        // DNA 螺旋 - 3D 基因版
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const centerY = height / 2

        ctx.save()
        ctx.globalCompositeOperation = "lighter"

        const amplitude = height * 0.2 + avgEnergy * height * 0.1
        const frequency = (Math.PI * 3.5) / width
        const rotationSpeed = time * 0.6

        const points: any[] = []
        for (let strand = 0; strand < 2; strand++) {
          const phase = strand * Math.PI
          const hue = strand === 0 ? 320 : 200
          for (let x = 0; x <= width; x += 8) {
            const t = x / width
            const dataIndex = Math.floor(t * data.length)
            const value = safeNumber(data[dataIndex] / 255, 0)
            const angle = x * frequency + rotationSpeed + phase
            const yRaw = Math.sin(angle) * amplitude * (0.8 + value * 0.5)
            const zRaw = Math.cos(angle) * amplitude * (0.8 + value * 0.5)
            points.push({ x, y: yRaw, z: zRaw, strand, value, hue })
          }
        }

        // 绘制连接线
        for (let x = 0; x <= width; x += 25) {
          const t = x / width
          const dataIndex = Math.floor(t * data.length)
          const value = safeNumber(data[dataIndex] / 255, 0)
          const angle1 = x * frequency + rotationSpeed
          const angle2 = angle1 + Math.PI
          const y1 = Math.sin(angle1) * amplitude * (0.8 + value * 0.5)
          const z1 = Math.cos(angle1) * amplitude * (0.8 + value * 0.5)
          const y2 = Math.sin(angle2) * amplitude * (0.8 + value * 0.5)
          const z2 = Math.cos(angle2) * amplitude * (0.8 + value * 0.5)

          const perspective1 = 1 + z1 / (amplitude * 2.5)
          const perspective2 = 1 + z2 / (amplitude * 2.5)
          const projY1 = centerY + y1 * perspective1
          const projY2 = centerY + y2 * perspective2

          ctx.beginPath()
          ctx.moveTo(x, projY1)
          ctx.lineTo(x, projY2)
          const alpha = 0.2 + (Math.max(z1, z2) / amplitude + 1) * 0.4
          ctx.strokeStyle = safeHSLA(280 + t * 60, 80, 70, alpha * (0.3 + value * 0.7))
          ctx.lineWidth = (1 + (z1 + z2 + amplitude * 2) / (amplitude * 2)) * 1.5
          ctx.stroke()
        }

        // 绘制螺旋线上的点
        points
          .sort((a, b) => a.z - b.z)
          .forEach((p) => {
            const perspective = 1 + p.z / (amplitude * 2.5)
            const projY = centerY + p.y * perspective
            const size = (2 + perspective * 3) * (0.8 + p.value * 0.6)
            const alpha = (perspective * 0.6 + 0.2) * (0.4 + p.value * 0.6)

            const grad = ctx.createRadialGradient(p.x, projY, 0, p.x, projY, size * 2)
            grad.addColorStop(0, safeHSLA(p.hue, 100, 80, alpha))
            grad.addColorStop(1, "transparent")
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(p.x, projY, size * 2, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = safeHSLA(p.hue, 100, 95, alpha)
            ctx.beginPath()
            ctx.arc(p.x, projY, size * 0.6, 0, Math.PI * 2)
            ctx.fill()
          })

        // 领跑球效果
        const leadX = (time * 150) % width
        for (let strand = 0; strand < 2; strand++) {
          const phase = strand * Math.PI
          const angle = leadX * frequency + rotationSpeed + phase
          const yRaw = Math.sin(angle) * amplitude * 1.2
          const zRaw = Math.cos(angle) * amplitude * 1.2
          const perspective = 1 + zRaw / (amplitude * 2.5)
          const projY = centerY + yRaw * perspective
          const hue = strand === 0 ? 320 : 200
          const glowSize = 15 + avgEnergy * 25

          const leadGrad = ctx.createRadialGradient(leadX, projY, 0, leadX, projY, glowSize)
          leadGrad.addColorStop(0, safeHSLA(hue, 100, 70, 0.8))
          leadGrad.addColorStop(0.5, safeHSLA(hue, 100, 50, 0.3))
          leadGrad.addColorStop(1, "transparent")
          ctx.fillStyle = leadGrad
          ctx.beginPath()
          ctx.arc(leadX, projY, glowSize, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = "#fff"
          ctx.shadowBlur = 20
          ctx.shadowColor = safeHSLA(hue, 100, 70, 1)
          ctx.beginPath()
          ctx.arc(leadX, projY, 6 + avgEnergy * 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }

        ctx.restore()
        break
      }

      case "matrix": {
        // 数字矩阵 - 骇客帝国版
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)

        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)

        // 背景网格
        ctx.save()
        ctx.strokeStyle = "rgba(0, 255, 70, 0.05)"
        ctx.lineWidth = 1
        const gridSize = 40
        ctx.beginPath()
        for (let x = 0; x < width; x += gridSize) {
          ctx.moveTo(x, 0)
          ctx.lineTo(x, height)
        }
        for (let y = 0; y < height; y += gridSize) {
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
        }
        ctx.stroke()
        ctx.restore()

        const baseFontSize = 18
        const columns = Math.floor(width / baseFontSize)

        if (!state.matrix || state.matrix.length !== columns) {
          state.matrix = Array.from({ length: columns }, () => ({
            y: Math.random() * -height,
            speed: 5 + Math.random() * 8,
            chars: Array.from({ length: 20 + Math.floor(Math.random() * 20) }, () =>
              Math.random() > 0.5 ? String.fromCharCode(0x30a0 + Math.random() * 96) : Math.floor(Math.random() * 2).toString(),
            ),
          }))
        }

        if (bassEnergy > 0.7) {
          ctx.save()
          ctx.fillStyle = `rgba(0, 255, 100, ${bassEnergy * 0.15})`
          ctx.fillRect(0, 0, width, height)
          ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15)
        }

        const scanY = (time * 500) % height
        ctx.fillStyle = "rgba(0, 255, 70, 0.05)"
        ctx.fillRect(0, scanY, width, 1)

        state.matrix.forEach((col: any, i: number) => {
          const dataIndex = Math.floor((i * data.length) / columns)
          const value = safeNumber(data[dataIndex] / 255, 0)
          const isBeat = bassEnergy > 0.6 && value > 0.4

          col.y += col.speed * (1 + avgEnergy * 3 + (isBeat ? 6 : 0))
          if (col.y > height + baseFontSize * col.chars.length) {
            col.y = -baseFontSize * col.chars.length
            col.speed = 5 + Math.random() * 8
          }

          const x = i * baseFontSize
          col.chars.forEach((char: string, j: number) => {
            const y = col.y + j * baseFontSize
            if (y < -baseFontSize || y > height + baseFontSize) return

            const isHead = j === col.chars.length - 1
            let alpha = isHead ? 1 : (j / col.chars.length) * 0.8
            alpha *= 0.6 + value * 0.4

            let currentFontSize = baseFontSize
            let color = isHead ? "#ffffff" : `rgba(0, 255, 70, ${alpha})`

            if (isBeat && (isHead || Math.random() < 0.3)) {
              currentFontSize = baseFontSize * (1.3 + value * 1.2)
              color = "#00ffcc"
              ctx.shadowBlur = 25
              ctx.shadowColor = "#00ffcc"
            } else if (isHead) {
              ctx.shadowBlur = 15
              ctx.shadowColor = "rgba(0, 255, 100, 0.8)"
            }

            ctx.font = `${currentFontSize}px monospace`
            ctx.fillStyle = color
            ctx.fillText(char, x, y)
            ctx.shadowBlur = 0
          })
        })

        if (bassEnergy > 0.7) ctx.restore()
        break
      }

      case "fireworks": {
        // 烟花绽放 - 增强版
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)

        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)
        
        // 衰减震动
        state.shake *= 0.85
        const shakeX = (Math.random() - 0.5) * state.shake
        const shakeY = (Math.random() - 0.5) * state.shake

        ctx.save()
        ctx.translate(shakeX, shakeY)
        ctx.globalCompositeOperation = "lighter"

        // 触发逻辑 - 随音乐强度动态调整概率
        const triggerThreshold = 0.22 
        const triggerProbability = 0.15 + avgEnergy * 0.6

        if (avgEnergy > triggerThreshold && Math.random() < triggerProbability) { 
          const centerX = Math.random() * width * 0.8 + width * 0.1
          const centerY = Math.random() * height * 0.6 + height * 0.1
          const baseHue = Math.random() * 360
          
          let scale = 0.5 
          const rand = Math.random()
          
          if (avgEnergy > 0.6) {
               if (rand > 0.7) scale = 1.3 + Math.random() * 0.7 
               else if (rand > 0.3) scale = 0.9 + Math.random() * 0.4 
               else scale = 0.4 + Math.random() * 0.3 
          } else {
               if (rand > 0.92) scale = 1.1 + Math.random() * 0.5 
               else if (rand > 0.5) scale = 0.6 + Math.random() * 0.3 
               else scale = 0.3 + Math.random() * 0.2 
          }

          // 增加震动强度
          state.shake += scale * 20 * (0.5 + bassEnergy)

          const particleCount = Math.floor(40 + scale * 300) 
          const baseVelocity = 3 + scale * 18 
          const flashSize = 60 + scale * 250

          // 爆炸瞬间爆闪
          const flashGradient = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, flashSize)
          if (flashGradient) {
              safeAddColorStop(flashGradient, 0, safeHSLA(baseHue, 100, 98, 0.7))
              safeAddColorStop(flashGradient, 0.2, safeHSLA(baseHue, 100, 85, 0.4 * scale))
              safeAddColorStop(flashGradient, 0.5, safeHSLA(baseHue, 100, 70, 0.15 * scale))
              safeAddColorStop(flashGradient, 1, "transparent")
              ctx.fillStyle = flashGradient
              ctx.beginPath()
              ctx.arc(centerX, centerY, flashSize, 0, Math.PI * 2)
              ctx.fill()
              
              // 核心白光
              ctx.fillStyle = "#ffffff"
              ctx.beginPath()
              ctx.arc(centerX, centerY, 5 * scale, 0, Math.PI * 2)
              ctx.fill()
          }
          
          for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2
            const velocity = Math.random() * baseVelocity
            const life = 0.7 + Math.random() * 0.8 + scale * 0.4 
            
            state.particles.push({
              x: centerX,
              y: centerY,
              vx: Math.cos(angle) * velocity,
              vy: Math.sin(angle) * velocity,
              size: 1.2 + Math.random() * 2.8 + scale * 2.0,
              life: life, 
              maxLife: life,
              hue: baseHue + Math.random() * 50 - 25
            })
          }
        }

        state.particles = state.particles.filter((p: any) => p.life > 0)

        state.particles.forEach((p: any) => {
          const prevX = p.x
          const prevY = p.y
          
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.18 
          p.vx *= 0.92 
          p.vy *= 0.92
          
          const decayRate = 0.018 + (1 - avgEnergy) * 0.025
          p.life -= decayRate

          if (p.life > 0) {
              const life = Math.max(0, p.life)
              const hue = safeHue(p.hue || 0)
              const alpha = Math.pow(life / p.maxLife, 1.2)
              
              ctx.beginPath()
              ctx.moveTo(prevX, prevY)
              ctx.lineTo(p.x, p.y)
              ctx.strokeStyle = safeHSLA(hue, 100, 70, alpha * 0.85)
              ctx.lineWidth = p.size * alpha
              ctx.lineCap = "round"
              ctx.stroke()
              
              if (alpha > 0.4) {
                  const glowSize = p.size * 1.8
                  const gradient = safeCreateRadialGradient(ctx, p.x, p.y, 0, p.x, p.y, glowSize)
                  if (gradient) {
                      safeAddColorStop(gradient, 0, safeHSLA(hue, 100, 95, alpha * 0.8))
                      safeAddColorStop(gradient, 0.4, safeHSLA(hue, 100, 75, alpha * 0.3))
                      safeAddColorStop(gradient, 1, "transparent")
                      ctx.fillStyle = gradient
                      ctx.beginPath()
                      ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2)
                      ctx.fill()
                  }
              }
          }
        })
        
        ctx.restore()
        break
      }

      case "vortex": {
        // 隧道穿梭 - 赛博空间版 (无限纵深)
        // 1. 背景处理：深邃感 + 星云
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)

        const centerX = width / 2
        const centerY = height / 2
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassEnergy = safeNumber(data.slice(0, 15).reduce((sum, val) => sum + val, 0) / 15 / 255, 0)
        const midEnergy = safeNumber(
          data.slice(data.length / 4, data.length / 2).reduce((sum, val) => sum + val, 0) /
            (data.length / 4) /
            255,
          0,
        )

        // 绘制动态星云 (增加色彩层次)
        ctx.save()
        ctx.globalCompositeOperation = "screen"
        for (let i = 0; i < 3; i++) {
          const nHue = safeHue(220 + i * 40 + Math.sin(time * 0.2) * 20)
          const nX = centerX + Math.sin(time * 0.1 + i) * 100
          const nY = centerY + Math.cos(time * 0.15 + i) * 100
          const nSize = Math.max(width, height) * (0.6 + i * 0.2)
          const grad = safeCreateRadialGradient(ctx, nX, nY, 0, nX, nY, nSize)
          if (grad) {
            safeAddColorStop(grad, 0, safeHSLA(nHue, 80, 20, 0.15 * avgEnergy))
            safeAddColorStop(grad, 1, "transparent")
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, width, height)
          }
        }
        ctx.restore()

        // 增加中心偏移 (随低音晃动)
        const offsetX = Math.sin(time * 0.5) * 30 * bassEnergy
        const offsetY = Math.cos(time * 0.3) * 30 * bassEnergy

        ctx.save()
        ctx.translate(centerX + offsetX, centerY + offsetY)

        // 2. 隧道骨架 (几何环)
        const ringCount = 30 // 增加数量
        const speed = 0.015 + bassEnergy * 0.08
        const rotationBase = time * 0.4

        for (let i = 0; i < ringCount; i++) {
          let progress = (i / ringCount + time * speed * 50) % 1 // 调整导出时的速度系数
          if (progress < 0.03) continue

          const scale = Math.pow(progress, 3.5) * 8
          const radius = 20 + scale * Math.min(width, height) * 0.8
          const alpha = Math.sin(progress * Math.PI) * (0.2 + bassEnergy * 0.6)
          const hue = safeHue(200 + (1 - progress) * 150 + Math.sin(time) * 40)

          ctx.save()
          // 旋转角度随深度变化，形成螺旋扭曲感
          ctx.rotate(rotationBase + (1 - progress) * 3)

          // 色散效果 (Chromatic Aberration) - 仅在近处且能量高时明显
          const aberration = progress > 0.5 ? bassEnergy * 5 * progress : 0

          const drawPolygon = (sides: number, r: number, strokeStyle: string, lineWidth: number) => {
            ctx.beginPath()
            for (let s = 0; s <= sides; s++) {
              const angle = (s / sides) * Math.PI * 2
              const distort = Math.sin(time * 10 + progress * 20) * 15 * midEnergy
              const x = Math.cos(angle) * (r + distort)
              const y = Math.sin(angle) * (r + distort)
              if (s === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.strokeStyle = strokeStyle
            ctx.lineWidth = lineWidth
            ctx.stroke()
          }

          const sides = 6 + (i % 2 === 0 ? 2 : 0) // 混合六边形和八边形
          const baseWidth = 0.5 + progress * 12

          if (aberration > 0) {
            ctx.globalCompositeOperation = "screen"
            // 红
            drawPolygon(sides, radius + aberration, safeHSLA(0, 100, 50, alpha * 0.8), baseWidth)
            // 蓝
            drawPolygon(sides, radius - aberration, safeHSLA(240, 100, 50, alpha * 0.8), baseWidth)
          }

          // 主色环
          ctx.globalCompositeOperation = "lighter"
          if (progress > 0.7) {
            ctx.shadowBlur = 20 * progress
            ctx.shadowColor = safeHSLA(hue, 100, 50, alpha * 0.8)
          }
          drawPolygon(sides, radius, safeHSLA(hue, 100, 70, alpha), baseWidth)

          // B. 内部连接线 (增加结构复杂感)
          if (i % 3 === 0 && progress > 0.2) {
            ctx.beginPath()
            for (let s = 0; s < sides; s++) {
              const angle = (s / sides) * Math.PI * 2
              const r1 = radius * 0.92
              const r2 = radius * 1.08
              ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1)
              ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2)
            }
            ctx.strokeStyle = safeHSLA(hue + 30, 80, 80, alpha * 0.5)
            ctx.lineWidth = 1.5
            ctx.stroke()
          }

          ctx.restore()
        }

        // 3. 穿梭流光 (增加细节：粒子拖尾)
        const streamCount = 45
        ctx.globalCompositeOperation = "lighter"
        for (let i = 0; i < streamCount; i++) {
          const angle = (i / streamCount) * Math.PI * 2 + rotationBase * 0.3
          const pSpeed = (0.015 + (i % 8) * 0.005) * (1 + bassEnergy * 2.5)
          const progress = (i * 0.17 + time * pSpeed * 50) % 1

          const z = Math.pow(progress, 3.5)
          const r = z * width * 1.5
          const nextR = Math.pow(Math.min(1, progress + 0.06), 3.5) * width * 1.5

          const x = Math.cos(angle) * r
          const y = Math.sin(angle) * r
          const nx = Math.cos(angle) * nextR
          const ny = Math.sin(angle) * nextR

          const hue = safeHue(180 + (i % 4) * 30 + progress * 80)
          const alpha = Math.sin(progress * Math.PI) * (0.4 + midEnergy * 0.5)

          const grad = safeCreateLinearGradient(ctx, x, y, nx, ny)
          if (grad) {
            safeAddColorStop(grad, 0, "transparent")
            safeAddColorStop(grad, 1, safeHSLA(hue, 100, 80, alpha))
            ctx.strokeStyle = grad
            ctx.lineWidth = 1 + progress * 8
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(nx, ny)
            ctx.stroke()

            // 头部高亮
            if (progress > 0.6) {
              ctx.fillStyle = "#fff"
              ctx.beginPath()
              ctx.arc(nx, ny, 2 * progress, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }

        // 4. 纵深扫描线与网格 (增加科技感)
        ctx.globalCompositeOperation = "overlay"
        const gridSides = 12
        for (let j = 0; j < 5; j++) {
          const gProgress = (j / 5 + time * 0.015 * 50) % 1
          const gRadius = Math.pow(gProgress, 2.5) * width * 1.8
          ctx.beginPath()
          for (let s = 0; s <= gridSides; s++) {
            const angle = (s / gridSides) * Math.PI * 2 + time * 0.15
            const x = Math.cos(angle) * gRadius
            const y = Math.sin(angle) * gRadius
            if (s === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = safeHSLA(180, 100, 50, 0.2 * (1 - gProgress))
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        // 5. 远端核心 (尽头的奇点)
        ctx.globalCompositeOperation = "lighter"

        // 核心冲向屏幕逻辑 (弹性物理引擎)
        const rushThreshold = 0.75
        const stiffness = 0.2 // 弹性系数
        const damping = 0.82 // 阻尼系数
        
        // 1. 施加冲击力 (外力)
        if (bassEnergy > rushThreshold) {
          const impulse = (bassEnergy - rushThreshold) * 0.5
          state.coreVelocity += impulse
          
          // 冲击时随机改变颜色
          if (Math.random() < 0.3) {
            state.coreHue = safeHue(Math.random() * 360)
          }
        }

        // 2. 弹簧物理计算
        const springForce = (0 - state.coreZoom) * stiffness
        state.coreVelocity += springForce
        state.coreVelocity *= damping // 模拟摩擦阻尼
        state.coreZoom += state.coreVelocity

        // 核心颜色平滑过渡回蓝色调 (赛博空间基色)
        const targetHue = 200 + Math.sin(time * 0.5) * 30
        state.coreHue += (targetHue - state.coreHue) * 0.05

        // 限制范围，防止过度溢出
        state.coreZoom = Math.max(-0.2, Math.min(2.0, state.coreZoom))

        const zoom = Math.max(0, state.coreZoom) // 仅在正向缩放时显示效果
        const flicker = (Math.random() > 0.5 ? 1 : 0.8) * (1 + zoom * 0.5) // 闪烁效果
        const currentHue = state.coreHue

        // 限制核心尺寸和光晕半径，防止遮盖屏幕
        const coreSize = (10 + avgEnergy * 40) * (1 + zoom * 4)
        const glowRadius = coreSize * (5 + zoom * 6)

        const coreGlow = safeCreateRadialGradient(ctx, 0, 0, 0, 0, 0, glowRadius)
        if (coreGlow) {
          safeAddColorStop(coreGlow, 0, `rgba(255, 255, 255, ${safeAlpha(flicker)})`)
          safeAddColorStop(coreGlow, 0.05, safeHSLA(currentHue, 100, 95, safeAlpha(flicker)))
          safeAddColorStop(coreGlow, 0.2, safeHSLA(currentHue, 100, 85, 0.8 * flicker))
          safeAddColorStop(coreGlow, 0.4, safeHSLA(currentHue, 100, 70, 0.4 + zoom * 0.4))
          safeAddColorStop(coreGlow, 0.7, safeHSLA(currentHue, 100, 50, 0.1 + zoom * 0.2))
          safeAddColorStop(coreGlow, 1, "transparent")

          ctx.fillStyle = coreGlow
          ctx.beginPath()
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2)
          ctx.fill()

          if (zoom > 0.1 || avgEnergy > 0.5) {
            ctx.beginPath()
            ctx.arc(0, 0, coreSize * 1.5, 0, Math.PI * 2)
            ctx.fillStyle = "#fff"
            ctx.shadowBlur = 30 * flicker
            ctx.shadowColor = "#fff"
            ctx.fill()
          }
        }

        if (zoom > 0.3) {
          ctx.save()
          ctx.globalCompositeOperation = "lighter"
          const flashAlpha = (zoom - 0.3) * 0.4
          const flashGrad = safeCreateRadialGradient(ctx, 0, 0, 0, 0, 0, Math.min(width, height) * 0.6)
          if (flashGrad) {
            safeAddColorStop(flashGrad, 0, safeHSLA(currentHue, 100, 95, flashAlpha))
            safeAddColorStop(flashGrad, 0.5, safeHSLA(currentHue, 100, 90, flashAlpha * 0.3))
            safeAddColorStop(flashGrad, 1, "transparent")
            ctx.fillStyle = flashGrad
            ctx.beginPath()
            ctx.arc(0, 0, Math.min(width, height) * 0.6, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        }

        ctx.restore()

        // 6. 后期处理：暗角与扫描线
        const vignette = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, width * 0.8)
        if (vignette) {
          safeAddColorStop(vignette, 0, "transparent")
          safeAddColorStop(vignette, 1, "rgba(0,0,0,0.6)")
          ctx.fillStyle = vignette
          ctx.fillRect(0, 0, width, height)
        }

        if (Math.sin(time * 5) > 0.8) {
          ctx.fillStyle = "rgba(0, 255, 255, 0.03)"
          for (let y = 0; y < height; y += 4) {
            ctx.fillRect(0, y, width, 1)
          }
        }
        
        drawCenterAvatar(ctx, centerX, centerY, 50 + avgEnergy * 10, avgEnergy, time, avatarImg)
        break
      }

      case "lightning": {
        // 闪电风暴 - 增强版 (3D 纵深地平线)
        // 1. 背景处理：纯黑夜空
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)

        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
        const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)

        // 2. 绘制地面 (纵深感网格)
        const groundHeight = height * 0.8
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        
        // 地面渐变
        const groundGrad = safeCreateLinearGradient(ctx, 0, groundHeight, 0, height)
        if (groundGrad) {
          safeAddColorStop(groundGrad, 0, "rgba(20, 20, 40, 0.8)")
          safeAddColorStop(groundGrad, 1, "rgba(0, 0, 0, 1)")
          ctx.fillStyle = groundGrad
          ctx.fillRect(0, groundHeight, width, height - groundHeight)
        }

        // 地面纵深网格线
        ctx.strokeStyle = "rgba(100, 150, 255, 0.15)"
        ctx.lineWidth = 1
        const gridCount = 20
        const horizonY = groundHeight
        
        // 纵向线 (透视收缩)
        for (let i = 0; i <= gridCount; i++) {
          const xPercent = i / gridCount
          const xBottom = width * xPercent
          const xTop = width / 2 + (xBottom - width / 2) * 0.1
          ctx.beginPath()
          ctx.moveTo(xTop, horizonY)
          ctx.lineTo(xBottom, height)
          ctx.stroke()
        }
        
        // 横向线 (近疏远密)
        for (let i = 0; i < 10; i++) {
          const yPercent = Math.pow(i / 10, 2)
          const y = horizonY + (height - horizonY) * yPercent
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(width, y)
          ctx.stroke()
        }
        ctx.restore()

        // 3. 乌云感背景电荷
        const cloudGrad = safeCreateRadialGradient(ctx, width/2, groundHeight * 0.4, 0, width/2, groundHeight * 0.4, width * 0.6)
        if (cloudGrad) {
          safeAddColorStop(cloudGrad, 0, safeRGBA(50, 80, 255, 0.15 * avgEnergy))
          safeAddColorStop(cloudGrad, 1, "transparent")
          ctx.fillStyle = cloudGrad
          ctx.fillRect(0, 0, width, groundHeight)
        }

        // 4. 生成新闪电 (增加三维透视)
        const strikeThreshold = 0.65
        const strikeProbability = 0.08 + bassEnergy * 0.4

        if (bassEnergy > strikeThreshold && Math.random() < strikeProbability) {
          const startX = width * 0.2 + Math.random() * width * 0.6
          const startY = 0
          
          // 确定落点 (带有透视感，落点在地面网格上)
          const targetXPercent = 0.1 + Math.random() * 0.8
          const targetYPercent = Math.random()
          const targetY = horizonY + (height - horizonY) * Math.pow(targetYPercent, 2)
          const targetX = width / 2 + (width * targetXPercent - width / 2) * (targetYPercent)

          const lightningPath: any[] = []
          let curX = startX
          let curY = startY
          
          lightningPath.push({ x: curX, y: curY })
          
          const segments = 12 + Math.floor(Math.random() * 10)
          for (let i = 1; i <= segments; i++) {
            const t = i / segments
            const nextTargetX = startX + (targetX - startX) * t
            const nextTargetY = startY + (targetY - startY) * t
            
            curX = nextTargetX + (Math.random() - 0.5) * 120 * (1 - t * 0.5)
            curY = nextTargetY + (Math.random() - 0.5) * 30
            
            lightningPath.push({ x: curX, y: curY })

            // 支路闪电
            if (Math.random() < 0.3 && i < segments - 2) {
              const branch: any[] = [{ x: curX, y: curY }]
              let bx = curX
              let by = curY
              for (let j = 0; j < 5; j++) {
                bx += (Math.random() - 0.5) * 80
                by += Math.random() * 40
                branch.push({ x: bx, y: by })
              }
              state.lightning.push({
                path: branch,
                alpha: 1,
                width: 1.5,
                isBranch: true,
                hue: 200 + Math.random() * 40
              })
            }
          }

          state.lightning.push({
            path: lightningPath,
            alpha: 1.2,
            width: 3 + Math.random() * 4,
            isBranch: false,
            hue: 190 + Math.random() * 30,
            groundFlash: { x: targetX, y: targetY, size: 100 + Math.random() * 200 }
          })
          
          state.shake += 15 * bassEnergy
        }

        // 5. 绘制并更新闪电
        state.lightning = state.lightning.filter((l: any) => l.alpha > 0)
        
        state.lightning.forEach((l: any) => {
          ctx.save()
          ctx.globalCompositeOperation = "lighter"
          const hue = l.hue || 210
          
          // 绘制路径
          ctx.beginPath()
          l.path.forEach((p: any, i: number) => {
            if (i === 0) ctx.moveTo(p.x, p.y)
            else ctx.lineTo(p.x, p.y)
          })

          // 外层辉光
          ctx.shadowBlur = 15 * l.alpha
          ctx.shadowColor = safeHSLA(hue, 100, 70, l.alpha)
          ctx.strokeStyle = safeHSLA(hue, 100, 80, l.alpha * 0.6)
          ctx.lineWidth = l.width * l.alpha
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.stroke()

          // 核心白光
          ctx.shadowBlur = 0
          ctx.strokeStyle = safeHSLA(hue, 100, 100, l.alpha)
          ctx.lineWidth = l.width * 0.4 * l.alpha
          ctx.stroke()

          // 地面撞击闪光
          if (l.groundFlash && l.alpha > 0.5) {
            const { x, y, size } = l.groundFlash
            const g = safeCreateRadialGradient(ctx, x, y, 0, x, y, size * l.alpha)
            if (g) {
              safeAddColorStop(g, 0, safeHSLA(hue, 100, 80, 0.4 * l.alpha))
              safeAddColorStop(g, 1, "transparent")
              ctx.fillStyle = g
              ctx.beginPath()
              ctx.ellipse(x, y, size * l.alpha, size * 0.4 * l.alpha, 0, 0, Math.PI * 2)
              ctx.fill()
            }
          }

          ctx.restore()
          l.alpha -= 0.08 // 闪电消失速度
        })
        
        break
      }

      case "aurora": {
        // 极光版 - 8层渐变流动
        const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)

        const layers = 8
        for (let layer = 0; layer < layers; layer++) {
          ctx.beginPath()
          ctx.moveTo(0, height)

          for (let x = 0; x <= width; x += 5) {
            const dataIndex = Math.floor((x * data.length) / width)
            const value = safeNumber(data[dataIndex] / 255, 0)

            const waveHeight =
              height * 0.3 +
              Math.sin(x * 0.01 + time * 1.5 + layer * 0.5) * (80 + value * 120) +
              Math.sin(x * 0.02 + time * 2.5) * (40 + value * 60)

            ctx.lineTo(x, waveHeight + layer * 30)
          }

          ctx.lineTo(width, height)
          ctx.closePath()

          const hue = safeHue(120 + layer * 20 + Math.sin(time) * 30)
          const gradient = safeCreateLinearGradient(ctx, 0, 0, 0, height)
          if (gradient) {
            safeAddColorStop(gradient, 0, safeHSLA(hue, 80, 60, 0.4 - layer * 0.04))
            safeAddColorStop(gradient, 0.3, safeHSLA(hue + 40, 70, 50, 0.25 - layer * 0.02))
            safeAddColorStop(gradient, 0.6, safeHSLA(hue + 80, 60, 40, 0.15 - layer * 0.01))
            safeAddColorStop(gradient, 1, "transparent")
            ctx.fillStyle = gradient
            ctx.fill()
          }
        }

        drawCenterAvatar(ctx, width / 2, height / 2, 50 + avgEnergy * 10, avgEnergy, time, avatarImg)
        break
      }

      default: {
        // 默认绘制逻辑
        drawCenterAvatar(ctx, width / 2, height / 2, 60, 0.5, time, avatarImg)
        break
      }
    }
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

    // 预加载头像
    let avatarImg: HTMLImageElement | null = null
    if (avatarImage) {
      avatarImg = new Image()
      avatarImg.src = avatarImage
      // 等待图片加载完成（如果是本地blob会很快）
      await new Promise((resolve) => {
        if (!avatarImg) return resolve(null)
        avatarImg.onload = resolve
        avatarImg.onerror = resolve
        // 1秒超时，防止图片加载不出来导致录制无法开始
        setTimeout(resolve, 1000)
      })
    }

    try {
      // 获取音频流
      const audioStream = getAudioStream()
      if (!audioStream) {
        throw new Error("无法获取音频流")
      }

      // 创建媒体流
      const stream = canvas.captureStream(60) // 提高到60fps以获得更平滑的动画

      // 合并音频轨道
      audioStream.getAudioTracks().forEach((track) => {
        stream.addTrack(track)
      })

      // 确保音频从头开始播放
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        await audioRef.current.play()
      }

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
        // 停止播放音频
        if (audioRef.current) {
          audioRef.current.pause()
        }

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
      const startTime = performance.now()
      const totalDuration = duration || audioRef.current.duration || 30
      
      // 初始化可视化状态
      const visualizerState = {
        particles: [],
        barCaps: [],
        ecgBuffer: [],
        ecgState: { x: 0, lastBeat: 0, pulseIndex: -1, currentAmplitude: 1 },
        matrix: [],
        lightning: [],
        shake: 0,
        coreZoom: 0,
        coreVelocity: 0,
        coreHue: 200,
        time: 0
      }

      const animate = () => {
        if (exportStatus === "done" || exportStatus === "error") return

        const now = performance.now()
        const elapsed = (now - startTime) / 1000
        const currentProgress = Math.min(elapsed / totalDuration, 1)
        setProgress(currentProgress * 100)

        // 直接从 analyser 获取实时数据
        const realData = getAnalyserData()

        // 确保数据有变化（如果没有音频数据，至少让时间走动）
        drawVisualizerFrame(
          ctx,
          width,
          height,
          realData,
          elapsed,
          currentTrack.name || "未知歌曲",
          elapsed,
          totalDuration,
          avatarImg,
          visualizerState,
        )

        if (elapsed < totalDuration && mediaRecorderRef.current?.state === "recording") {
          // 使用 setTimeout 保证在后台标签页也能持续渲染，且控制在约 60fps
          animationFrameRef.current = window.setTimeout(animate, 16) as unknown as number
        } else if (mediaRecorderRef.current?.state === "recording") {
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
      if (typeof animationFrameRef.current === "number") {
        window.clearTimeout(animationFrameRef.current)
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
    if (audioRef.current) {
      audioRef.current.pause()
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
