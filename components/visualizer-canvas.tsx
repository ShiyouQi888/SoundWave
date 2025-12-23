"use client"

import { useRef, useEffect, useCallback } from "react"
import type { VisualizerType } from "@/lib/audio-context"

interface VisualizerCanvasProps {
  type: VisualizerType
  analyserData: Uint8Array
  isPlaying: boolean
  avatarImage?: string | null
}

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

export function VisualizerCanvas({ type, analyserData, isPlaying, avatarImage }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const particlesRef = useRef<Particle[]>([])
  const timeRef = useRef(0)
  const starsRef = useRef<{ x: number; y: number; size: number; speed: number; twinkle: number }[]>([])
  const avatarImageRef = useRef<HTMLImageElement | null>(null)
  const avatarLoadedRef = useRef(false)
  const barColorsRef = useRef<{ hue: number; targetHue: number; speed: number }[]>([])
  const lightningRef = useRef<{ points: { x: number; y: number; z: number }[]; life: number; hue: number }[]>([])
  const matrixRef = useRef<{ y: number; speed: number; chars: string[]; hue: number }[]>([])
  const barCapsRef = useRef<number[]>([]) // 存储柱状图顶部浮块的高度
  const ecgBufferRef = useRef<number[]>([])
  const shakeRef = useRef(0)
  const coreZoomRef = useRef(0)
  const coreVelocityRef = useRef(0)
  const coreHueRef = useRef(200)
  const ecgStateRef = useRef({ x: 0, lastBeat: 0, pulseIndex: -1, currentAmplitude: 1 })
  // 按照标准医学 ECG 波形设计: P波, Q波, R波, S波, T波
  // 采样点更加密集以支持平滑的贝塞尔绘制
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
    0, 0, 0, 0
  ]

  useEffect(() => {
    if (avatarImage) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        avatarImageRef.current = img
        avatarLoadedRef.current = true
      }
      img.onerror = () => {
        avatarImageRef.current = null
        avatarLoadedRef.current = false
      }
      img.src = avatarImage
    } else {
      avatarImageRef.current = null
      avatarLoadedRef.current = false
    }
  }, [avatarImage])

  const getColors = useCallback(() => {
    return {
      primary: "rgba(236, 72, 153, ",
      secondary: "rgba(59, 130, 246, ",
      accent: "rgba(168, 85, 247, ",
      highlight: "rgba(34, 211, 238, ",
      neon: "rgba(0, 255, 136, ",
      fire: "rgba(255, 100, 50, ",
      electric: "rgba(255, 255, 100, ",
    }
  }, [])

  const initStars = useCallback((width: number, height: number) => {
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 300; i++) {
        starsRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2.5 + 0.5,
          speed: Math.random() * 0.5 + 0.1,
          twinkle: Math.random() * Math.PI * 2,
        })
      }
    }
  }, [])

  const drawStars = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, energy: number) => {
      initStars(width, height)
      const safeEnergy = safeNumber(energy, 0)
      starsRef.current.forEach((star) => {
        star.y += star.speed * (1 + safeEnergy * 3)
        star.twinkle += 0.05
        if (star.y > height) {
          star.y = 0
          star.x = Math.random() * width
        }
        const twinkleAlpha = safeAlpha(0.3 + Math.sin(star.twinkle) * 0.3 + safeEnergy * 0.4)
        const size = Math.max(0.1, star.size * (1 + safeEnergy * 0.8 + Math.sin(star.twinkle) * 0.3))

        const gradient = safeCreateRadialGradient(ctx, star.x, star.y, 0, star.x, star.y, size * 3)
        if (!gradient) return
        safeAddColorStop(gradient, 0, safeRGBA(255, 255, 255, twinkleAlpha))
        safeAddColorStop(gradient, 0.5, safeRGBA(200, 220, 255, twinkleAlpha * 0.3))
        safeAddColorStop(gradient, 1, "transparent")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(star.x, star.y, Math.max(0.1, size * 3), 0, Math.PI * 2)
        ctx.fill()
      })
    },
    [initStars],
  )

  const drawCenterGlow = useCallback(
    (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, energy: number) => {
      const time = timeRef.current
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
    },
    [],
  )

  const drawCenterAvatar = useCallback(
    (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, energy: number) => {
      const safeEnergy = safeNumber(energy, 0)
      const safeRadius = Math.max(10, safeNumber(radius, 50))

      if (!avatarImageRef.current || !avatarLoadedRef.current) {
        drawCenterGlow(ctx, centerX, centerY, safeRadius, safeEnergy)
        return
      }

      const time = timeRef.current

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
      ctx.closePath()
      ctx.clip()

      const imgSize = safeRadius * 2
      ctx.drawImage(avatarImageRef.current, centerX - safeRadius, centerY - safeRadius, imgSize, imgSize)

      ctx.restore()

      ctx.strokeStyle = safeRGBA(236, 72, 153, 0.8 + safeEnergy * 0.2)
      ctx.lineWidth = 3 + safeEnergy * 3
      ctx.shadowBlur = 20 + safeEnergy * 20
      ctx.shadowColor = "rgba(236, 72, 153, 0.8)"
      ctx.beginPath()
      ctx.arc(centerX, centerY, safeRadius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0
    },
    [drawCenterGlow],
  )

  // 频谱柱状 - 对称极光版
  const drawBars = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      ctx.clearRect(0, 0, width, height)

      const avgEnergy = data.reduce((sum, val) => sum + val, 0) / data.length / 255
      drawStars(ctx, width, height, avgEnergy)

      const barCount = 64
      // 动态计算间隙，使其自适应宽度
      const gap = Math.max(2, (width / barCount) * 0.15)
      const barWidth = width / barCount - gap

      if (barCapsRef.current.length !== barCount) {
        barCapsRef.current = new Array(barCount).fill(0)
      }

      ctx.save()

      // 稍微偏移一点，让底部有空间画倒影
      const bottomY = height - 20

      for (let i = 0; i < barCount; i++) {
        // 计算对称索引：低频在中间，向两边扩散
        const halfCount = barCount / 2
        const distanceFromCenter = Math.abs(i - (halfCount - 0.5))
        const normalizedDist = distanceFromCenter / halfCount
        
        // 将频率数据映射到柱状条，中间显示低频（能量高），向两侧扩散到高频
        // 使用指数映射让中间的起伏更明显
        const dataIndex = Math.floor(normalizedDist * data.length * 0.7)
        const value = safeNumber(data[dataIndex] / 255, 0)

        // 更灵敏的高度响应
        const targetHeight = Math.max(4, value * (height * 0.65))

        // 更新浮块物理效果
        if (targetHeight > barCapsRef.current[i]) {
          barCapsRef.current[i] = targetHeight
        } else {
          // 下落重力感
          barCapsRef.current[i] = Math.max(targetHeight, barCapsRef.current[i] - 2.5)
        }

        const x = i * (barWidth + gap) + gap / 2
        const y = bottomY - targetHeight

        // 颜色生成：基于距离中心的程度和能量的动态渐变
        // 中间偏红紫，两边偏青蓝
        const hue = safeHue(280 - normalizedDist * 120 + value * 40)

        // 1. 绘制柱体
        const gradient = safeCreateLinearGradient(ctx, x, y, x, bottomY)
        if (gradient) {
          safeAddColorStop(gradient, 0, safeHSLA(hue, 90, 65, 0.9))
          safeAddColorStop(gradient, 0.6, safeHSLA(hue + 20, 80, 50, 0.7))
          safeAddColorStop(gradient, 1, safeHSLA(hue + 40, 70, 40, 0.4))

          ctx.fillStyle = gradient

          // 柱体发光
          ctx.shadowBlur = 10 + value * 15
          ctx.shadowColor = safeHSLA(hue, 90, 60, 0.6)

          ctx.beginPath()
          // 顶部圆角，底部直角
          ctx.roundRect(x, y, barWidth, targetHeight, [4, 4, 0, 0])
          ctx.fill()
        }

        // 2. 绘制顶部浮块 (Cap)
        const capY = bottomY - barCapsRef.current[i] - 6
        ctx.fillStyle = safeHSLA(hue, 100, 95, 1)
        ctx.shadowBlur = 15
        ctx.shadowColor = "#ffffff"
        ctx.beginPath()
        ctx.roundRect(x, capY, barWidth, 3, [1.5, 1.5, 1.5, 1.5])
        ctx.fill()

        // 3. 绘制倒影 (Reflection)
        const reflectHeight = targetHeight * 0.4
        const reflectGradient = safeCreateLinearGradient(ctx, x, bottomY, x, bottomY + reflectHeight)
        if (reflectGradient) {
          safeAddColorStop(reflectGradient, 0, safeHSLA(hue, 80, 60, 0.3))
          safeAddColorStop(reflectGradient, 1, "transparent")

          ctx.fillStyle = reflectGradient
          ctx.shadowBlur = 0 // 倒影不发光
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
    },
    [drawStars],
  )

  // 波浪曲线 - 1:1 参考图极致复刻版
  const drawWave = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      // 1. 极黑背景
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)

      const avgEnergy = data.reduce((sum, val) => sum + val, 0) / data.length / 255
      const bassEnergy = data.slice(0, 15).reduce((sum, val) => sum + val, 0) / 15 / 255
      const time = timeRef.current * 0.015
      const centerY = height * 0.58 // 参考图中的水平线位置

      ctx.save()

      // 2. 远景模糊频谱 (垂直能量柱)
      const specCount = 120
      const specWidth = width / specCount
      for (let i = 0; i < specCount; i++) {
        const dIdx = Math.floor((i / specCount) * data.length * 0.7)
        const val = data[dIdx] / 255
        const h = 200 + Math.sin(i * 0.05 + time) * 60 // 蓝-紫-粉渐变
        
        const hFactor = val * (height * 0.45)
        const x = i * specWidth
        
        const grad = ctx.createLinearGradient(x, centerY - hFactor, x, centerY)
        grad.addColorStop(0, "transparent")
        grad.addColorStop(0.5, safeHSLA(h, 90, 60, 0.12 * val)) // 降低背景频谱亮度 (0.2 -> 0.12)
        grad.addColorStop(1, "transparent")
        
        ctx.fillStyle = grad
        ctx.fillRect(x, centerY - hFactor, specWidth - 1, hFactor)
      }

      // 3. 3D 瓷砖感地面 (带反射)
      ctx.globalCompositeOperation = "screen"
      const rows = 18
      const cols = 24
      const scroll = (timeRef.current * 1.2) % (height / rows)

      for (let i = 0; i < rows; i++) {
        const z = (i / rows)
        const y = centerY + z * (height - centerY)
        const alpha = 0.05 + z * 0.3
        
        // 横线 - 模拟瓷砖边缘光
        ctx.beginPath()
        ctx.strokeStyle = `rgba(0, 200, 255, ${alpha * (0.8 + bassEnergy * 0.2)})`
        ctx.lineWidth = 0.5 + z * 2
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()

        // 模拟瓷砖表面的光斑反射 (参考图中的格子感)
        if (i % 2 === 0) {
          const rectAlpha = alpha * 0.1
          ctx.fillStyle = `rgba(0, 150, 255, ${rectAlpha})`
          ctx.fillRect(0, y, width, (height - centerY) / rows * 0.5)
        }
      }

      for (let i = 0; i <= cols; i++) {
        const xRatio = (i / cols)
        const xBottom = (xRatio - 0.5) * width * 3.5 + width / 2
        const xTop = (xRatio - 0.5) * width * 0.1 + width / 2
        
        ctx.beginPath()
        ctx.strokeStyle = `rgba(0, 200, 255, ${0.05 + Math.abs(xRatio - 0.5) * 0.15})`
        ctx.lineWidth = 1
        ctx.moveTo(xTop, centerY)
        ctx.lineTo(xBottom, height)
        ctx.stroke()
      }

      // 4. 复刻版霓虹曲线 (多重发光 + 倒影)
      const curves = [
        { h: 195, offset: 0, speed: 1.2, amp: 1.4, color: "#00f2ff" },   // 青
        { h: 280, offset: 2, speed: 0.8, amp: 1.1, color: "#7000ff" },   // 紫
        { h: 10, offset: 4, speed: 1.0, amp: 1.2, color: "#ffae00" },    // 橙
        { h: 320, offset: 1, speed: 0.9, amp: 0.9, color: "#ff00ea" },   // 玫红
      ]

      curves.forEach((c) => {
        const points: {x: number, y: number}[] = []
        const step = 5
        const cTime = time * c.speed

        for (let x = -20; x <= width + 20; x += step) {
          const t = x / width
          const dIdx = Math.floor(Math.abs(t - 0.5) * 2 * data.length * 0.3)
          const audioVal = data[dIdx] / 255
          
          const wave = Math.sin(x * 0.005 + cTime + c.offset) * 45 + 
                       Math.sin(x * 0.012 - cTime * 0.6) * 25 +
                       Math.cos(x * 0.003 + cTime * 0.4) * 15
          
          const y = centerY - (wave + audioVal * 160) * c.amp
          points.push({x, y})
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
        ctx.lineWidth = 6 // 减小倒影宽度 (10 -> 6)
        ctx.globalAlpha = 0.08 + bassEnergy * 0.1 // 降低倒影透明度 (0.1+0.15 -> 0.08+0.1)
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
            ctx.shadowBlur = blur * 0.7 // 减弱辉光模糊 (1.0 -> 0.7)
            ctx.shadowColor = col
          }
          ctx.stroke()
          ctx.shadowBlur = 0
        }

        // 1. 底层宽幅光晕
        drawPath(12 + bassEnergy * 10, 0.12, 0, c.color) // 减小光晕宽度 (18+15 -> 12+10)
        // 2. 中层彩色亮线
        drawPath(4 + bassEnergy * 4, 0.45, 12, c.color) // 稍微变细，减小模糊 (6+5, 15 -> 4+4, 12)
        // 3. 核心白芯线 (最精致的关键)
        drawPath(1.5, 1, 3, "#ffffff") // 变细并增加清晰度 (2, 5 -> 1.5, 3)
      })

      // 5. 整体氛围：色散、暗角、扫描线
      // 底部强光 (模拟地面反光)
      const groundGlow = ctx.createLinearGradient(0, centerY, 0, height)
      groundGlow.addColorStop(0, "rgba(0, 242, 255, 0.05)")
      groundGlow.addColorStop(0.5, "transparent")
      ctx.fillStyle = groundGlow
      ctx.fillRect(0, centerY, width, height - centerY)

      // 边缘暗角
      const vignette = ctx.createRadialGradient(width/2, height/2, width*0.2, width/2, height/2, width*0.9)
      vignette.addColorStop(0, "transparent")
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.6)")
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, width, height)

      ctx.restore()
    },
    [drawStars],
  )

  const drawCircle = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      // 0. 背景设置为黑色
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) * 0.35
      
      // 1. 基础物理数据计算
      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
      const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)
      const midEnergy = safeNumber(data.slice(data.length / 4, data.length / 2).reduce((sum, val) => sum + val, 0) / (data.length / 4) / 255, 0)
      
      // 仪表盘抖动逻辑 (高潮时)
      let shakeX = 0
      let shakeY = 0
      if (avgEnergy > 0.6 || bassEnergy > 0.7) {
        const intensity = (avgEnergy - 0.5) * 15
        shakeX = (Math.random() - 0.5) * intensity
        shakeY = (Math.random() - 0.5) * intensity
      }

      // 模拟数值
      const rpmFactor = bassEnergy * 0.8 + midEnergy * 0.2
      const speedValue = Math.floor(rpmFactor * 220)
      const rpmValue = (rpmFactor * 8).toFixed(1)
      const hpValue = Math.floor(rpmFactor * 1000)
      
      drawStars(ctx, width, height, avgEnergy)

      // 7. 警灯设计 (圆形爆闪扩散点 - 极致加强版)
      const drawPoliceLight = (x: number, y: number, isRed: boolean, intensity: number, sizeScale = 1.0) => {
        const baseRadius = 35 * intensity * sizeScale // 增大基础半径
        const diffuseRadius = 800 * intensity * sizeScale // 极大增加扩散半径，覆盖大半个屏幕
        
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        
        // 极致模糊感：显著增加阴影模糊
        ctx.shadowBlur = 80 * intensity
        const color = isRed ? "255, 0, 50" : "0, 80, 255"
        const coreColor = isRed ? "255, 200, 200" : "200, 230, 255"
        ctx.shadowColor = `rgba(${color}, ${0.8 * intensity})`
        
        // 1. 超大范围全屏级漫反射
        const wideGrad = ctx.createRadialGradient(x, y, 0, x, y, diffuseRadius)
        wideGrad.addColorStop(0, `rgba(${color}, ${0.9 * intensity})`)
        wideGrad.addColorStop(0.2, `rgba(${color}, ${0.5 * intensity})`)
        wideGrad.addColorStop(0.5, `rgba(${color}, ${0.15 * intensity})`)
        wideGrad.addColorStop(1, "transparent")
        ctx.fillStyle = wideGrad
        ctx.beginPath()
        ctx.arc(x, y, diffuseRadius, 0, Math.PI * 2)
        ctx.fill()
        
        // 2. 核心亮度层 (多层叠加产生极亮白光感)
        for (let i = 0; i < 3; i++) {
          const coreDiffuseGrad = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * (6 + i))
          coreDiffuseGrad.addColorStop(0, `rgba(${coreColor}, ${1.0 * intensity})`)
          coreDiffuseGrad.addColorStop(0.4, `rgba(${color}, ${0.7 * intensity})`)
          coreDiffuseGrad.addColorStop(1, "transparent")
          ctx.fillStyle = coreDiffuseGrad
          ctx.beginPath()
          ctx.arc(x, y, baseRadius * (6 + i), 0, Math.PI * 2)
          ctx.fill()
        }
        
        // 3. 极致白光曝光核心 (强制白光)
        const whiteCoreGrad = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 1.5)
        whiteCoreGrad.addColorStop(0, "#ffffff")
        whiteCoreGrad.addColorStop(0.5, "#ffffff")
        whiteCoreGrad.addColorStop(1, "transparent")
        ctx.fillStyle = whiteCoreGrad
        ctx.beginPath()
        ctx.arc(x, y, baseRadius * 1.5, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.restore()
      }

      // 改进的爆闪逻辑 (针对“鼓点爆点”极致优化)
       const peakThreshold = 0.68 // 高鼓点阈值
       const midThreshold = 0.45  // 低鼓点阈值
       const flashRate = 80       // 极速爆闪频率
       const flashTime = Math.floor(timeRef.current * flashRate)
       const isFlashRed = (Math.floor(timeRef.current * 18)) % 2 === 0 
       
       let lightIntensity = 0
       
       // 检测不同等级的鼓点
       const isHighPeak = bassEnergy > 0.72 || avgEnergy > peakThreshold
       const isMidPeak = bassEnergy > 0.45 || avgEnergy > midThreshold
       
       if (isHighPeak) {
          // 高鼓点：突然爆闪 (极高亮度 + 快速闪烁)
          const pattern = flashTime % 3
          const strobeState = (pattern === 0) ? 1 : 0
          lightIntensity = strobeState * (1.2 + avgEnergy * 0.3)
       } else if (isMidPeak) {
          // 低鼓点：微弱灯光 (呼吸感，不爆闪)
          lightIntensity = 0.15 * avgEnergy
       } else {
          // 无鼓点：完全不显示 (保持归位状态)
          lightIntensity = 0
       }
  
        // 8. 全屏危险氛围 (Vignette Flash)
        if (lightIntensity > 0) {
            ctx.save()
            ctx.globalCompositeOperation = "lighter"
            const ambientColor = isFlashRed ? "255, 0, 0" : "0, 50, 255"
            
            // 四角/边缘暗角发光感
            const vignetteGrad = ctx.createRadialGradient(centerX, centerY, radius, centerX, centerY, width * 0.8)
            vignetteGrad.addColorStop(0, "transparent")
            vignetteGrad.addColorStop(1, `rgba(${ambientColor}, ${0.3 * lightIntensity})`)
            
            ctx.fillStyle = vignetteGrad
            ctx.fillRect(0, 0, width, height)
            
            // 顶部危险条纹背景
            if (isFlashRed && lightIntensity > 0.8) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.15)"
                ctx.font = "bold 120px Arial"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.globalAlpha = 0.2 * lightIntensity
                ctx.fillText("DANGER", centerX, centerY - radius * 0.6)
                ctx.fillText("DANGER", centerX, centerY + radius * 0.6)
            }
            ctx.restore()
        }

      // 只有强度大于 0 时才绘制，实现“闪完快速归位（看不见）”
      if (lightIntensity > 0) {
        // 仪表盘整体氛围由内向外扩散
      }

      ctx.save()
      ctx.translate(shakeX, shakeY)

      // --- 仪表盘整体参数 ---
      const dashWidth = Math.min(width * 0.9, 1000)
      const dashHeight = dashWidth * 0.35
      const dashX = centerX - dashWidth / 2
      const dashY = centerY - dashHeight / 2
      const gaugeRadius = dashHeight * 0.8

      // 【核心修改】将警灯绘制放在仪表盘绘制之前，且在 translate 之后，确保层级在下且跟随抖动
      if (lightIntensity > 0) {
        // 左表盘中心 - 蓝色 (sizeScale 略微调小以适应圆环)
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

      // 2. 左侧时速表 (Speedometer)
      const drawSpeedGauge = () => {
          const gx = centerX - dashWidth * 0.3
          const gy = centerY
          
          // 外部装饰弧
          ctx.strokeStyle = "rgba(100, 150, 255, 0.2)"
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(gx, gy, gaugeRadius, Math.PI * 0.7, Math.PI * 1.6)
          ctx.stroke()
          
          // 刻度线
          for (let i = 0; i <= 220; i += 20) {
              const angle = Math.PI * 0.75 + (i / 220) * (Math.PI * 0.8)
              const isMajor = i % 40 === 0
              const len = isMajor ? 15 : 8
              
              ctx.strokeStyle = i <= speedValue ? "#fff" : "rgba(255, 255, 255, 0.3)"
              ctx.lineWidth = isMajor ? 2 : 1
              ctx.beginPath()
              ctx.moveTo(gx + Math.cos(angle) * (gaugeRadius - 5), gy + Math.sin(angle) * (gaugeRadius - 5))
              ctx.lineTo(gx + Math.cos(angle) * (gaugeRadius - 5 - len), gy + Math.sin(angle) * (gaugeRadius - 5 - len))
              ctx.stroke()
              
              if (isMajor) {
                  ctx.font = "12px Arial"
                  ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
                  ctx.textAlign = "center"
                  ctx.fillText(i.toString(), gx + Math.cos(angle) * (gaugeRadius - 35), gy + Math.sin(angle) * (gaugeRadius - 35))
              }
          }

          // 新增：动态指针 (Needle)
          const needleAngle = Math.PI * 0.75 + (speedValue / 220) * (Math.PI * 0.8)
          ctx.save()
          ctx.strokeStyle = "#ff3333"
          ctx.lineWidth = 4
          ctx.shadowBlur = 10
          ctx.shadowColor = "#ff3333"
          ctx.beginPath()
          ctx.moveTo(gx, gy)
          ctx.lineTo(gx + Math.cos(needleAngle) * (gaugeRadius - 15), gy + Math.sin(needleAngle) * (gaugeRadius - 15))
          ctx.stroke()
          
          // 指针中心轴
          ctx.fillStyle = "#fff"
          ctx.beginPath()
          ctx.arc(gx, gy, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          
          // 数字显示
          ctx.save()
          ctx.shadowBlur = 15
          ctx.shadowColor = "rgba(0, 0, 0, 0.9)" // 极黑阴影，确保在爆闪背景下清晰
          ctx.font = "bold 72px 'Courier New', monospace"
          ctx.fillStyle = "#fff"
          ctx.textAlign = "center"
          ctx.fillText(speedValue.toString(), gx, gy + 20)
          ctx.restore()
          ctx.font = "14px Arial"
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
          ctx.fillText("km/h", gx + 60, gy + 20)
      }

      // 3. 右侧转速表 (Tachometer)
      const drawRpmGauge = () => {
          const gx = centerX + dashWidth * 0.3
          const gy = centerY
          
          // 外部装饰弧
          ctx.strokeStyle = "rgba(100, 150, 255, 0.2)"
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(gx, gy, gaugeRadius, Math.PI * 1.4, Math.PI * 2.3)
          ctx.stroke()
          
          // 刻度线
          for (let i = 0; i <= 8; i++) {
              const angle = Math.PI * 2.25 - (i / 8) * (Math.PI * 0.8)
              const isRed = i >= 7
              
              ctx.strokeStyle = (8 - i) <= (parseFloat(rpmValue)) ? (isRed ? "#ff3333" : "#fff") : "rgba(255, 255, 255, 0.3)"
              ctx.lineWidth = 3
              ctx.beginPath()
              ctx.moveTo(gx + Math.cos(angle) * (gaugeRadius - 5), gy + Math.sin(angle) * (gaugeRadius - 5))
              ctx.lineTo(gx + Math.cos(angle) * (gaugeRadius - 25), gy + Math.sin(angle) * (gaugeRadius - 25))
              ctx.stroke()
              
              ctx.font = "bold 16px Arial"
              ctx.fillStyle = isRed ? "#ff3333" : "rgba(255, 255, 255, 0.6)"
              ctx.textAlign = "center"
              ctx.fillText(i.toString(), gx + Math.cos(angle) * (gaugeRadius - 45), gy + Math.sin(angle) * (gaugeRadius - 45))
          }

          // 新增：动态指针 (Needle)
          const needleAngle = Math.PI * 2.25 - (parseFloat(rpmValue) / 8) * (Math.PI * 0.8)
          ctx.save()
          ctx.strokeStyle = "#ff3333"
          ctx.lineWidth = 4
          ctx.shadowBlur = 10
          ctx.shadowColor = "#ff3333"
          ctx.beginPath()
          ctx.moveTo(gx, gy)
          ctx.lineTo(gx + Math.cos(needleAngle) * (gaugeRadius - 15), gy + Math.sin(needleAngle) * (gaugeRadius - 15))
          ctx.stroke()
          
          // 指针中心轴
          ctx.fillStyle = "#fff"
          ctx.beginPath()
          ctx.arc(gx, gy, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          
          // 数字显示
          ctx.save()
          ctx.shadowBlur = 15
          ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
          ctx.font = "bold 72px 'Courier New', monospace"
          ctx.fillStyle = "#fff"
          ctx.textAlign = "center"
          ctx.fillText(rpmValue, gx, gy + 20)
          ctx.restore()
          ctx.font = "14px Arial"
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
          ctx.fillText("x1000rpm", gx + 80, gy + 20)
      }

      // 4. 中央信息面板
      const drawCenterPanel = () => {
          const pw = dashWidth * 0.2
          const ph = dashHeight * 0.6
          const px = centerX - pw / 2
          const py = centerY - ph / 2
          
          // 车辆图标 (简单示意)
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
          ctx.lineWidth = 2
          ctx.strokeRect(centerX - 15, centerY - 40, 30, 50)
          ctx.beginPath()
          ctx.moveTo(centerX - 15, centerY - 15); ctx.lineTo(centerX - 25, centerY - 15) // 左车门开
          ctx.stroke()
          
          // 温度和里程
          ctx.font = "16px Arial"
          ctx.fillStyle = "#fff"
          ctx.textAlign = "left"
          ctx.fillText("17℃", px + 10, py + ph - 10)
          ctx.textAlign = "right"
          ctx.fillText("1000P", px + pw - 10, py + ph - 10)
          
          // 顶部里程
          ctx.textAlign = "center"
          ctx.font = "14px Arial"
          ctx.fillText("⛽ 53km", centerX, py + 20)
      }

      // 5. 绘制警告图标
      const drawIcons = () => {
          const iconY = centerY - dashHeight * 0.35
          // 电池
          ctx.fillStyle = avgEnergy > 0.5 ? "#ff3333" : "rgba(255, 50, 50, 0.2)"
          ctx.fillRect(centerX - 120, iconY, 20, 12)
          // 引擎
          ctx.fillStyle = rpmFactor > 0.8 ? "#ff9900" : "rgba(255, 150, 0, 0.2)"
          ctx.beginPath()
          ctx.arc(centerX + 110, iconY + 6, 8, 0, Math.PI * 2)
          ctx.fill()
          // 安全带
          ctx.fillStyle = "#ff3333"
          ctx.beginPath()
          ctx.moveTo(centerX - 40, iconY); ctx.lineTo(centerX - 30, iconY + 15); ctx.lineTo(centerX - 50, iconY + 15); ctx.fill()
      }

      drawSpeedGauge()
      drawRpmGauge()
      drawCenterPanel()
      drawIcons()

      ctx.restore()
      ctx.shadowBlur = 0
    },
    [drawStars, drawCenterAvatar],
  )

  // 粒子爆发 - 星云风暴版
  // 心电图 - 脉冲扫描版
  const drawParticles = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      // 1. 填充黑色背景 (黑客/科幻风格)
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2

      // 计算能量
      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
      const bassData = data.slice(0, data.length / 8)
      const bassEnergy = safeNumber(bassData.reduce((sum, val) => sum + val, 0) / bassData.length / 255, 0)

      // 初始化缓冲区
      if (ecgBufferRef.current.length !== Math.ceil(width)) {
        ecgBufferRef.current = new Array(Math.ceil(width)).fill(centerY)
      }

      // 2. 绘制细绿色网格 (经典雷达/示波器风格)
      ctx.save()
      
      // 细网格 (1mm)
      ctx.strokeStyle = "rgba(0, 255, 100, 0.08)"
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let x = 0; x < width; x += 15) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height)
      }
      for (let y = 0; y < height; y += 15) {
        ctx.moveTo(0, y); ctx.lineTo(width, y)
      }
      ctx.stroke()
      
      // 粗网格 (5mm)
      ctx.strokeStyle = "rgba(0, 255, 100, 0.15)"
      ctx.lineWidth = 1.0
      ctx.beginPath()
      for (let x = 0; x < width; x += 75) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height)
      }
      for (let y = 0; y < height; y += 75) {
        ctx.moveTo(0, y); ctx.lineTo(width, y)
      }
      ctx.stroke()
      ctx.restore()

      // 3. 更新心电数据
      const speed = 5
      const state = ecgStateRef.current
      
      // 检测鼓点触发心跳
      if (bassEnergy > 0.5 && state.pulseIndex === -1 && (timeRef.current - state.lastBeat > 12)) {
        state.pulseIndex = 0
        state.lastBeat = timeRef.current
        
        // 显著增强不规律性：
        // 1. 基础振幅在 0.4 到 1.2 之间大幅波动
        // 2. 结合低频能量，实现极高起伏与平缓起伏的交替
        const baseRand = Math.random()
        if (baseRand > 0.8) {
          // 20% 概率出现超高压波形 (视觉冲击)
          state.currentAmplitude = 1.1 + Math.random() * 0.2
        } else if (baseRand < 0.3) {
          // 30% 概率出现微弱波形 (真实感)
          state.currentAmplitude = 0.4 + Math.random() * 0.2
        } else {
          // 正常波动
          state.currentAmplitude = 0.7 + bassEnergy * 0.5
        }
      }

      for (let i = 0; i < speed; i++) {
        state.x = (state.x + 1) % Math.ceil(width)
        
        let yOffset = 0
        
        if (state.pulseIndex >= 0) {
           const progress = state.pulseIndex
           if (progress < pulsePattern.length) {
             // 向上偏移，应用动态振幅系数
             const maxPossibleOffset = height * 0.42 
             
             // 在特定波段（如 R 波峰）引入额外的微小抖动，模拟生物信号的不稳定性
             const jitter = (progress > 15 && progress < 25) ? (Math.random() - 0.5) * 15 * state.currentAmplitude : 0
             
             yOffset = -pulsePattern[progress] * maxPossibleOffset * state.currentAmplitude + jitter
             state.pulseIndex++
           } else {
             state.pulseIndex = -1
           }
        }
        
        // 显著增加音频波动噪声的影响，使非脉冲时段也不完全是直线
        const waveIndex = Math.floor((state.x / width) * data.length)
        const waveVal = (data[waveIndex] - 128) / 128 * 25 * avgEnergy 
        
        ecgBufferRef.current[state.x] = centerY + yOffset + waveVal
      }
      
      // 4. 绘制心电线 (分段绘制以实现首尾区别)
      const head = state.x
      const buf = ecgBufferRef.current
      const len = buf.length
      const gap = 100 // 显著增加间距，使“扫描”感更强
      
      ctx.save()
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      
      // --- 第一部分：旧波形 (即将被覆盖的部分，呈现暗绿色/深红色余晖，模拟磷光衰减) ---
      if (head + gap < len) {
          ctx.beginPath()
          // 使用暗绿色或深红色，模拟老式示波器的余晖
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
      
      // --- 第二部分：新波形 (刚扫描出的部分，亮红色高对比) ---
      ctx.beginPath()
      // 创建渐变：从扫描头向后稍微淡化一点，但保持高亮
      ctx.strokeStyle = "#ff3333"
      ctx.lineWidth = 3.5 // 稍微减细 (4.5 -> 3.5)
      ctx.shadowBlur = 10 // 减小发光 (15 -> 10)
      ctx.shadowColor = "rgba(255, 0, 0, 0.7)"
      
      if (head > 0) {
          ctx.moveTo(0, buf[0])
          for (let x = 1; x <= head; x++) {
              ctx.lineTo(x, buf[x])
          }
      }
      ctx.stroke()
      
      // 扫描头 (超新星爆闪核心)
      // 使用三次方映射，产生极致的瞬间爆发感
      const strobeEnergy = Math.pow(avgEnergy, 2.5) 
      const flashSize = 10 + strobeEnergy * 20 // 减小尺寸 (12+25 -> 10+20)
      const glowIntensity = 40 + strobeEnergy * 150 // 显著降低辉光强度 (60+250 -> 40+150)
      
      ctx.save()
      
      // 1. 爆闪全屏叠加 (使用 lighter 混合模式实现极致亮度)
      if (strobeEnergy > 0.3) {
          ctx.globalCompositeOperation = "lighter"
          // 多层叠加闪烁，模拟真实强光闪烁的视觉残留
          const flashAlpha = strobeEnergy * 0.3 // 降低闪烁亮度 (0.4 -> 0.3)
          ctx.fillStyle = `rgba(255, 50, 50, ${flashAlpha})`
          ctx.fillRect(0, 0, width, height)
          
          // 核心闪光条 (水平和垂直的十字闪光)
          ctx.fillStyle = `rgba(255, 255, 255, ${strobeEnergy * 0.45})` // 降低亮度 (0.6 -> 0.45)
          ctx.fillRect(0, buf[head] - 1.5, width, 3) // 变细 (4 -> 3)
          ctx.fillRect(head - 1.5, 0, 3, height)   // 变细 (4 -> 3)
      }
      
      // 2. 超强漫反射 (多重叠加)
      ctx.globalCompositeOperation = "lighter"
      const gradient = ctx.createRadialGradient(head, buf[head], 0, head, buf[head], glowIntensity * 3.5) // 减小范围 (5 -> 3.5)
      gradient.addColorStop(0, `rgba(255, 20, 20, ${0.5 + strobeEnergy * 0.3})`) // 降低透明度
      gradient.addColorStop(0.3, `rgba(255, 0, 0, 0.15)`) // 降低透明度
      gradient.addColorStop(1, "transparent")
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(head, buf[head], glowIntensity * 3.5, 0, Math.PI * 2)
      ctx.fill()

      // 3. 极亮核心与多重光晕
      ctx.shadowColor = "#ff0000"
      ctx.shadowBlur = glowIntensity * 0.8 // 减小模糊比例
      ctx.fillStyle = "#ff0000"
      ctx.beginPath()
      ctx.arc(head, buf[head], flashSize, 0, Math.PI * 2)
      ctx.fill()
      
      // 白色爆炸核心
      ctx.shadowColor = "#ffffff"
      ctx.shadowBlur = glowIntensity * 0.6 // 减小模糊比例 (0.8 -> 0.6)
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      ctx.arc(head, buf[head], flashSize * 0.6, 0, Math.PI * 2)
      ctx.fill()
      
      // 额外的镜头光晕感 (水平细线)
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + strobeEnergy * 0.5})`
      ctx.fillRect(head - flashSize * 4, buf[head] - 1, flashSize * 8, 2)
      
      ctx.restore()
      
      ctx.restore()
      
      // 左上角医疗信息 (也换成绿色/红色组合)
      ctx.font = "bold 16px sans-serif"
      ctx.fillStyle = "rgba(0, 255, 100, 0.8)"
      ctx.fillText(`HR: ${Math.floor(65 + bassEnergy * 55)} BPM`, 25, 35)
      ctx.font = "12px sans-serif"
      ctx.fillStyle = "rgba(0, 255, 100, 0.5)"
      ctx.fillText(`II  25mm/s  10mm/mV`, 25, 55)
    },
    [drawCenterAvatar],
  )

  // 环形光谱 - 能量核心版 (优化后)
  const drawRing = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2
      const maxRadius = Math.min(width, height) * 0.35
      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)

      drawStars(ctx, width, height, avgEnergy)
      
      ctx.save()
      ctx.globalCompositeOperation = "screen" // 开启发光混合模式

      // 1. 外部旋转光束 (优化版)
      for (let beam = 0; beam < 16; beam++) { // 增加光束数量
        const angle = (beam / 16) * Math.PI * 2 + timeRef.current * 0.02
        const beamLength = 200 + avgEnergy * 150
        const startRadius = maxRadius * 0.8
        
        // 使用更柔和的渐变
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

      // 2. 多层环形光谱 (优化版 - 更细致)
      const segments = 120
      const layers = 4
      
      for (let layer = 0; layer < layers; layer++) {
        const baseRadius = maxRadius * (0.5 + layer * 0.15)
        const segmentAngle = (Math.PI * 2) / segments
        
        // 每一层旋转方向不同
        const rotationOffset = timeRef.current * (0.01 + layer * 0.005) * (layer % 2 === 0 ? 1 : -1)

        for (let i = 0; i < segments; i++) {
          const dataIndex = Math.floor((i / segments) * data.length * (0.5 + layer * 0.1)) // 不同层采样不同频段
          const value = safeNumber(data[dataIndex] / 255, 0)

          const startAngle = i * segmentAngle + rotationOffset
          const endAngle = startAngle + segmentAngle * 0.8

          // 动态高度
          const barHeight = 10 + value * (40 + layer * 20)
          const currentRadius = baseRadius + barHeight

          ctx.beginPath()
          ctx.arc(centerX, centerY, baseRadius, startAngle, endAngle)
          ctx.arc(centerX, centerY, currentRadius, endAngle, startAngle, true)
          ctx.closePath()

          const hue = safeHue(240 + layer * 30 + (i / segments) * 60 + value * 60)
          ctx.fillStyle = safeHSLA(hue, 90, 60, 0.4 + value * 0.6)
          
          // 只在高能量时发光，节省性能
          if (value > 0.4) {
              ctx.shadowBlur = 10
              ctx.shadowColor = safeHSLA(hue, 90, 60, 0.8)
          } else {
              ctx.shadowBlur = 0
          }
          
          ctx.fill()
        }
      }
      
      ctx.restore() // 恢复混合模式

      // 3. 绘制中心头像 (保持逻辑)
      const avatarRadius = 50 + avgEnergy * 10
      if (avatarImageRef.current && avatarLoadedRef.current) {
        drawCenterAvatar(ctx, centerX, centerY, avatarRadius, avgEnergy)
      } else {
        // 如果没有头像，画一个更酷的能量球
         for (let i = 3; i >= 0; i--) {
          const coreGrad = safeCreateRadialGradient(
            ctx,
            centerX, centerY, 0,
            centerX, centerY, 50 + i * 20 + avgEnergy * 30
          )
          if (coreGrad) {
            safeAddColorStop(coreGrad, 0, safeRGBA(200, 100, 255, 0.8))
            safeAddColorStop(coreGrad, 0.6, safeRGBA(100, 50, 255, 0.4))
            safeAddColorStop(coreGrad, 1, "transparent")
            ctx.fillStyle = coreGrad
            ctx.beginPath()
            ctx.arc(centerX, centerY, 60 + i * 20 + avgEnergy * 30, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      ctx.shadowBlur = 0
    },
    [drawStars, drawCenterAvatar],
  )

  // 星系漩涡 - 3D 宇宙星云版 (极致 3D 深度与体积感)
  const drawGalaxy = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2
      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
      const bassEnergy = safeNumber(data.slice(0, 20).reduce((sum, val) => sum + val, 0) / 20 / 255, 0)

      drawStars(ctx, width, height, avgEnergy)

      ctx.save()
      ctx.globalCompositeOperation = "screen"

      const time = timeRef.current * 0.015
      const fov = 400 // 透视焦距

      // 1. 体积感星云背景 (多层气态云团)
      const nebulaCount = 8
      for (let i = 0; i < nebulaCount; i++) {
        const angle = time * 0.4 + (i / nebulaCount) * Math.PI * 2
        const radiusBase = 120 + Math.sin(time * 0.5 + i) * 60
        
        // 3.5D 漂移效果
        const z = Math.cos(time * 0.3 + i) * 100
        const perspective = fov / (fov + z)
        
        const x = centerX + Math.cos(angle) * radiusBase * perspective
        const y = centerY + Math.sin(angle) * radiusBase * perspective
        const nebulaSize = (250 + avgEnergy * 150) * perspective
        
        const gradient = safeCreateRadialGradient(ctx, x, y, 0, x, y, nebulaSize)
        if (gradient) {
          // 星云配色：青、紫、深红、品红
          const colors = [
            { h: 180, s: 80, l: 50 }, // 青
            { h: 260, s: 70, l: 40 }, // 紫
            { h: 320, s: 90, l: 50 }, // 品红
            { h: 210, s: 80, l: 30 }, // 深蓝
          ]
          const c = colors[i % colors.length]
          const alpha = (0.05 + bassEnergy * 0.08) * perspective // 降低星云背景透明度 (0.08+ -> 0.05+)
          
          safeAddColorStop(gradient, 0, safeHSLA(c.h, c.s, c.l, alpha))
          safeAddColorStop(gradient, 0.6, safeHSLA(c.h + 20, c.s, c.l - 10, alpha * 0.3)) // 减弱外层扩散 (0.4 -> 0.3)
          safeAddColorStop(gradient, 1, "transparent")
          
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(x, y, nebulaSize, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 2. 3D 螺旋臂粒子流 (深度排序绘制)
      const armCount = 4
      const particlesPerArm = 60
      const rotationY = time * 0.5
      const rotationX = Math.sin(time * 0.2) * 0.5
      
      const allParticles: {x: number, y: number, z: number, size: number, color: string, alpha: number}[] = []

      for (let arm = 0; arm < armCount; arm++) {
        const armPhase = (arm / armCount) * Math.PI * 2
        
        for (let i = 0; i < particlesPerArm; i++) {
          const t = i / particlesPerArm
          const dataIndex = Math.floor(t * data.length * 0.5)
          const value = data[dataIndex] / 255
          
          // 3D 空间坐标计算
          const angle = armPhase + t * Math.PI * 4 + time * 0.8
          const radius = t * (Math.min(width, height) * 0.7)
          
          // 基础坐标
          let px = Math.cos(angle) * radius
          let py = (Math.random() - 0.5) * 40 * t 
          let pz = Math.sin(angle) * radius
          
          // 绕 X 轴旋转
          const cosX = Math.cos(rotationX); const sinX = Math.sin(rotationX)
          const y1 = py * cosX - pz * sinX
          const z1 = py * sinX + pz * cosX
          py = y1; pz = z1
          
          // 绕 Y 轴旋转
          const cosY = Math.cos(rotationY); const sinY = Math.sin(rotationY)
          const x2 = px * cosY + pz * sinY
          const z2 = -px * sinY + pz * cosY
          px = x2; pz = z2
          
          // 透视投影
          const perspective = fov / (fov + pz)
          const screenX = centerX + px * perspective
          const screenY = centerY + py * perspective
          
          const size = (1.2 + value * 5) * perspective * (1.1 - t * 0.5) // 粒子稍微变小 (1.5 -> 1.2)
          const alpha = (0.25 + value * 0.6) * (pz > -fov ? perspective : 0) * (1 - t * 0.3) // 降低粒子亮度 (0.3 -> 0.25)
          const hue = safeHue(180 + t * 150 + value * 60)
          
          allParticles.push({
            x: screenX,
            y: screenY,
            z: pz,
            size: size,
            color: safeHSLA(hue, 100, 75, alpha),
            alpha: alpha
          })
        }
      }

      // 按 Z 深度排序绘制粒子
      allParticles.sort((a, b) => b.z - a.z).forEach(p => {
        if (p.alpha <= 0) return
        
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        // 粒子发光 (显著减弱)
        if (p.size > 4) { // 提高发光门槛 (3 -> 4)
          ctx.shadowBlur = p.size * 1.2 // 减小发光半径 (2 -> 1.2)
          ctx.shadowColor = p.color
        }
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // 3. 超大体积核心 (核心引力感)
      const coreZ = 0
      const corePerspective = fov / (fov + coreZ)
      const coreSize = (25 + bassEnergy * 40) * corePerspective // 减小核心尺寸 (30 -> 25)
      
      const coreGrad = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, coreSize * 4) // 减小梯度半径 (5 -> 4)
      if (coreGrad) {
        safeAddColorStop(coreGrad, 0, "#ffffff")
        safeAddColorStop(coreGrad, 0.1, safeRGBA(255, 255, 200, 0.8)) // 降低透明度 (0.9 -> 0.8)
        safeAddColorStop(coreGrad, 0.3, safeRGBA(0, 200, 255, 0.3)) // 降低透明度 (0.4 -> 0.3)
        safeAddColorStop(coreGrad, 0.6, safeRGBA(100, 50, 255, 0.1)) // 降低透明度 (0.15 -> 0.1)
        safeAddColorStop(coreGrad, 1, "transparent")
        
        ctx.fillStyle = coreGrad
        ctx.beginPath()
        ctx.arc(centerX, centerY, coreSize * 4, 0, Math.PI * 2)
        ctx.fill()
      }
      
      // 核心喷流 (3D 轴向)
      ctx.lineWidth = 2 + bassEnergy * 4
      const jetLength = 150 + bassEnergy * 250
      
      // 向上喷流
      const upJetY = centerY - jetLength * corePerspective
      const upGrad = ctx.createLinearGradient(centerX, centerY, centerX, upJetY)
      upGrad.addColorStop(0, "#fff")
      upGrad.addColorStop(1, "transparent")
      ctx.strokeStyle = upGrad
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX, upJetY)
      ctx.stroke()
      
      // 向下喷流
      const downJetY = centerY + jetLength * corePerspective
      const downGrad = ctx.createLinearGradient(centerX, centerY, centerX, downJetY)
      downGrad.addColorStop(0, "#fff")
      downGrad.addColorStop(1, "transparent")
      ctx.strokeStyle = downGrad
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX, downJetY)
      ctx.stroke()

      ctx.restore()
    },
    [drawStars, drawCenterAvatar],
  )

  // DNA 螺旋 - 3D 基因版
  const drawDNA = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      ctx.clearRect(0, 0, width, height)

      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
      const centerY = height / 2
      
      drawStars(ctx, width, height, avgEnergy)
      
      ctx.save()
      ctx.globalCompositeOperation = "lighter"

      const startX = 0
      const endX = width
      
      const amplitude = height * 0.2 + avgEnergy * height * 0.1 // 基础振幅
      const frequency = (Math.PI * 3.5) / width // 波长
      const speed = timeRef.current * 0.05
      const rotationSpeed = timeRef.current * 0.08 // 整体旋转感
      
      // 存储所有点以便排序（实现简单的深度遮挡感）
      const points: {x: number, y: number, z: number, strand: number, value: number, hue: number}[] = []
      
      for (let strand = 0; strand < 2; strand++) {
        const phase = strand * Math.PI
        const hue = strand === 0 ? 320 : 200

        for (let x = startX; x <= endX; x += 8) {
          const t = x / width
          const dataIndex = Math.floor(t * data.length)
          const value = safeNumber(data[dataIndex] / 255, 0)
          
          const angle = x * frequency + rotationSpeed + phase
          const yRaw = Math.sin(angle) * amplitude * (0.8 + value * 0.5)
          const zRaw = Math.cos(angle) * amplitude * (0.8 + value * 0.5)
          
          points.push({ x, y: yRaw, z: zRaw, strand, value, hue })
        }
      }

      // 绘制连接线 (碱基对)
      for (let x = startX; x <= endX; x += 25) {
        const t = x / width
        const dataIndex = Math.floor(t * data.length)
        const value = safeNumber(data[dataIndex] / 255, 0)
        
        const angle1 = x * frequency + rotationSpeed
        const angle2 = angle1 + Math.PI
        
        const y1 = Math.sin(angle1) * amplitude * (0.8 + value * 0.5)
        const z1 = Math.cos(angle1) * amplitude * (0.8 + value * 0.5)
        const y2 = Math.sin(angle2) * amplitude * (0.8 + value * 0.5)
        const z2 = Math.cos(angle2) * amplitude * (0.8 + value * 0.5)
        
        // 投影
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
      points.sort((a, b) => a.z - b.z).forEach(p => {
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
        
        // 核心亮点
        ctx.fillStyle = safeHSLA(p.hue, 100, 95, alpha)
        ctx.beginPath()
        ctx.arc(p.x, projY, size * 0.6, 0, Math.PI * 2)
        ctx.fill()
      })

      // 4. “双星领跑”效果：两条螺旋线开头的旋转发光球
      const leadX = (timeRef.current * 3) % width // 领跑位置
      for (let strand = 0; strand < 2; strand++) {
        const phase = strand * Math.PI
        const angle = leadX * frequency + rotationSpeed + phase
        
        const yRaw = Math.sin(angle) * amplitude * 1.2
        const zRaw = Math.cos(angle) * amplitude * 1.2
        const perspective = 1 + zRaw / (amplitude * 2.5)
        const projY = centerY + yRaw * perspective
        
        const hue = strand === 0 ? 320 : 200
        const glowSize = 15 + avgEnergy * 25
        
        // 外部大光晕
        const leadGrad = ctx.createRadialGradient(leadX, projY, 0, leadX, projY, glowSize)
        leadGrad.addColorStop(0, safeHSLA(hue, 100, 70, 0.8))
        leadGrad.addColorStop(0.5, safeHSLA(hue, 100, 50, 0.3))
        leadGrad.addColorStop(1, "transparent")
        
        ctx.fillStyle = leadGrad
        ctx.beginPath()
        ctx.arc(leadX, projY, glowSize, 0, Math.PI * 2)
        ctx.fill()
        
        // 内部核心
        ctx.fillStyle = "#fff"
        ctx.shadowBlur = 20
        ctx.shadowColor = safeHSLA(hue, 100, 70, 1)
        ctx.beginPath()
        ctx.arc(leadX, projY, 6 + avgEnergy * 6, 0, Math.PI * 2)
        ctx.fill()
        
        // 领跑拖尾
        for (let j = 0; j < 5; j++) {
           const tailX = leadX - j * 15
           if (tailX < 0) continue
           const tailAngle = tailX * frequency + rotationSpeed + phase
           const ty = centerY + Math.sin(tailAngle) * amplitude * 1.2 * (1 + Math.cos(tailAngle) / 2.5)
           ctx.fillStyle = safeHSLA(hue, 100, 70, 0.4 / (j + 1))
           ctx.beginPath()
           ctx.arc(tailX, ty, (6 - j) + avgEnergy * 4, 0, Math.PI * 2)
           ctx.fill()
        }
      }

      ctx.restore()
      ctx.shadowBlur = 0
    },
    [drawStars],
  )

  // 数字矩阵 - 骇客帝国版 (律动增强)
  const drawMatrix = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
    // 1. 纯黑背景
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, width, height)

    const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
    const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)
    
    // 2. 绘制背景网格 (黑客终端感)
    ctx.save()
    ctx.strokeStyle = "rgba(0, 255, 70, 0.05)"
    ctx.lineWidth = 1
    const gridSize = 40
    ctx.beginPath()
    for (let x = 0; x < width; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, height)
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(width, y)
    }
    ctx.stroke()
    ctx.restore()

    const baseFontSize = 18
    const columns = Math.floor(width / baseFontSize)

    if (!matrixRef.current || matrixRef.current.length !== columns) {
      matrixRef.current = Array.from({ length: columns }, () => ({
        y: Math.random() * -height,
        speed: 5 + Math.random() * 8, // 提高初始速度
        chars: Array.from({ length: 20 + Math.floor(Math.random() * 20) }, () => 
          Math.random() > 0.5 ? String.fromCharCode(0x30a0 + Math.random() * 96) : Math.floor(Math.random() * 2).toString()
        ),
        hue: 120, // 经典矩阵绿
      }))
    }

    // 3. 鼓点瞬间全屏抖动/闪烁 (增加攻击性)
    if (bassEnergy > 0.7) {
      ctx.save()
      ctx.fillStyle = `rgba(0, 255, 100, ${bassEnergy * 0.15})`
      ctx.fillRect(0, 0, width, height)
      ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15)
    }

    // 扫描线效果 (更细更快)
    const scanY = (timeRef.current * 8) % height
    ctx.fillStyle = "rgba(0, 255, 70, 0.05)"
    ctx.fillRect(0, scanY, width, 1)

    matrixRef.current.forEach((col, i) => {
      const dataIndex = Math.floor((i * data.length) / columns)
      const value = safeNumber(data[dataIndex] / 255, 0)
      
      // 鼓点检测
      const isBeat = bassEnergy > 0.6 && value > 0.4
      
      // 速度大幅提升，随音频狂暴
      col.y += col.speed * (1 + avgEnergy * 3 + (isBeat ? 6 : 0))
      
      // 循环重置
      if (col.y > height + baseFontSize * col.chars.length) {
        col.y = -baseFontSize * col.chars.length
        col.speed = 5 + Math.random() * 8
      }

      const x = i * baseFontSize

      col.chars.forEach((char, j) => {
        const y = col.y + j * baseFontSize
        if (y < -baseFontSize || y > height + baseFontSize) return

        const isHead = j === col.chars.length - 1
        
        // 头部极亮，尾部渐隐
        let alpha = isHead ? 1 : (j / col.chars.length) * 0.8
        alpha *= (0.6 + value * 0.4)
        
        let currentFontSize = baseFontSize
        let color = isHead ? "#ffffff" : `rgba(0, 255, 70, ${alpha})`

        // 鼓点放大与变色
        if (isBeat && (isHead || Math.random() < 0.3)) {
          currentFontSize = baseFontSize * (1.3 + value * 1.2)
          color = "#00ffcc"
          ctx.shadowBlur = 25
          ctx.shadowColor = "#00ffcc"
        } else if (isHead) {
          ctx.shadowBlur = 15
          ctx.shadowColor = "rgba(0, 255, 100, 0.8)"
        } else {
          ctx.shadowBlur = 0
        }

        // 字符随机变换 (增加动态感)
        if (Math.random() < 0.08) {
          col.chars[j] = Math.random() > 0.5 ? 
            String.fromCharCode(0x30a0 + Math.random() * 96) : 
            Math.floor(Math.random() * 2).toString()
        }

        ctx.font = `bold ${currentFontSize}px monospace`
        ctx.fillStyle = color
        ctx.fillText(char, x, y)
      })
    })

    if (bassEnergy > 0.7) ctx.restore()
    ctx.shadowBlur = 0
  }, [])

  // 烟花绽放 - 盛世烟火版 (极致色彩 + 震动爆闪)
  const drawFireworks = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      // 1. 纯黑背景 (让烟花更亮)
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)

      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
      const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)
      
      drawStars(ctx, width, height, avgEnergy)
      
      // 衰减震动
      shakeRef.current *= 0.85
      const shakeX = (Math.random() - 0.5) * shakeRef.current
      const shakeY = (Math.random() - 0.5) * shakeRef.current

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
        shakeRef.current += scale * 20 * (0.5 + bassEnergy)

        const particleCount = Math.floor(40 + scale * 300) 
        const baseVelocity = 3 + scale * 18 
        const flashSize = 60 + scale * 250 // 减小爆闪范围 (100+ -> 60+)

        // 爆炸瞬间爆闪 (减弱亮度，增加透明度)
        const flashGradient = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, flashSize)
        if (flashGradient) {
            safeAddColorStop(flashGradient, 0, safeHSLA(baseHue, 100, 98, 0.7)) // 降低中心亮度 (1.0 -> 0.7)
            safeAddColorStop(flashGradient, 0.2, safeHSLA(baseHue, 100, 85, 0.4 * scale)) // 降低层亮度
            safeAddColorStop(flashGradient, 0.5, safeHSLA(baseHue, 100, 70, 0.15 * scale))
            safeAddColorStop(flashGradient, 1, "transparent")
            ctx.fillStyle = flashGradient
            ctx.beginPath()
            ctx.arc(centerX, centerY, flashSize, 0, Math.PI * 2)
            ctx.fill()
            
            // 核心白光 (保持小巧清晰)
            ctx.fillStyle = "#ffffff"
            ctx.beginPath()
            ctx.arc(centerX, centerY, 5 * scale, 0, Math.PI * 2) // 减小核心 (8 -> 5)
            ctx.fill()
        }
        
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2
          const velocity = Math.random() * baseVelocity
          const life = 0.7 + Math.random() * 0.8 + scale * 0.4 
          
          particlesRef.current.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity,
            size: 1.2 + Math.random() * 2.8 + scale * 2.0, // 粒子稍微变细 (1.5+ -> 1.2+)
            color: "",
            life: life, 
            maxLife: life,
            hue: baseHue + Math.random() * 50 - 25,
            speed: velocity 
          })
        }
      }

      particlesRef.current = particlesRef.current.filter((p) => p.life > 0)

      particlesRef.current.forEach((p) => {
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
            ctx.strokeStyle = safeHSLA(hue, 100, 70, alpha * 0.85) // 降低拖尾亮度 (0.9 -> 0.85)
            ctx.lineWidth = p.size * alpha
            ctx.lineCap = "round"
            ctx.stroke()
            
            if (alpha > 0.4) { // 提高显示门槛 (0.3 -> 0.4)
                const glowSize = p.size * 1.8 // 显著减小粒子辉光 (2.5 -> 1.8)
                const gradient = safeCreateRadialGradient(ctx, p.x, p.y, 0, p.x, p.y, glowSize)
                if (gradient) {
                    safeAddColorStop(gradient, 0, safeHSLA(hue, 100, 95, alpha * 0.8)) // 降低辉光透明度
                    safeAddColorStop(gradient, 0.4, safeHSLA(hue, 100, 75, alpha * 0.3)) // 降低辉光深度
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
    },
    [drawStars],
  )

  // 极光幻影
  const drawAurora = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      ctx.clearRect(0, 0, width, height)

      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)

      drawStars(ctx, width, height, avgEnergy)

      const layers = 8
      for (let layer = 0; layer < layers; layer++) {
        ctx.beginPath()
        ctx.moveTo(0, height)

        for (let x = 0; x <= width; x += 5) {
          const dataIndex = Math.floor((x * data.length) / width)
          const value = safeNumber(data[dataIndex] / 255, 0)

          const waveHeight =
            height * 0.3 +
            Math.sin(x * 0.01 + timeRef.current * 0.03 + layer * 0.5) * (80 + value * 120) +
            Math.sin(x * 0.02 + timeRef.current * 0.05) * (40 + value * 60)

          ctx.lineTo(x, waveHeight + layer * 30)
        }

        ctx.lineTo(width, height)
        ctx.closePath()

        const hue = safeHue(120 + layer * 20 + Math.sin(timeRef.current * 0.02) * 30)
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
    },
    [drawStars],
  )

  // 隧道穿梭 - 赛博空间版 (无限纵深)
  const drawVortex = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
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
      const time = timeRef.current * 0.02

      // 绘制背景星空
      drawStars(ctx, width, height, avgEnergy)

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
        let progress = (i / ringCount + timeRef.current * speed) % 1
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
        const progress = (i * 0.17 + timeRef.current * pSpeed) % 1

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
        const gProgress = (j / 5 + timeRef.current * 0.015) % 1
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
        coreVelocityRef.current += impulse
        
        // 冲击时随机改变颜色
        if (Math.random() < 0.3) {
          coreHueRef.current = safeHue(Math.random() * 360)
        }
      }

      // 2. 弹簧物理计算
      const springForce = (0 - coreZoomRef.current) * stiffness
      coreVelocityRef.current += springForce
      coreVelocityRef.current *= damping // 模拟摩擦阻尼
      coreZoomRef.current += coreVelocityRef.current

      // 核心颜色平滑过渡回蓝色调 (赛博空间基色)
      const targetHue = 200 + Math.sin(time * 0.5) * 30
      coreHueRef.current += (targetHue - coreHueRef.current) * 0.05

      // 限制范围，防止过度溢出
      coreZoomRef.current = Math.max(-0.2, Math.min(2.0, coreZoomRef.current))

      const zoom = Math.max(0, coreZoomRef.current) // 仅在正向缩放时显示效果
      const flicker = (Math.random() > 0.5 ? 1 : 0.8) * (1 + zoom * 0.5) // 闪烁效果
      const currentHue = coreHueRef.current

      // 限制核心尺寸和光晕半径，防止遮盖屏幕
      const coreSize = (10 + avgEnergy * 40) * (1 + zoom * 4) // 减小缩放倍数
      const glowRadius = coreSize * (5 + zoom * 6) // 减小光晕范围

      const coreGlow = safeCreateRadialGradient(ctx, 0, 0, 0, 0, 0, glowRadius)
      if (coreGlow) {
        // 使用动态随机颜色
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

        // 额外的强光中心 (闪光灯感)
        if (zoom > 0.1 || avgEnergy > 0.5) {
          ctx.beginPath()
          ctx.arc(0, 0, coreSize * 1.5, 0, Math.PI * 2)
          ctx.fillStyle = "#fff"
          ctx.shadowBlur = 30 * flicker
          ctx.shadowColor = "#fff"
          ctx.fill()
        }
      }

      // 6. 局部闪光 (替代全屏闪光)
      if (zoom > 0.3) {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        const flashAlpha = (zoom - 0.3) * 0.4
        // 将闪光限制在中心区域，而不是全屏
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
      // 暗角 (Vignette)
      const vignette = safeCreateRadialGradient(ctx, centerX, centerY, 0, centerX, centerY, width * 0.8)
      if (vignette) {
        safeAddColorStop(vignette, 0, "transparent")
        safeAddColorStop(vignette, 1, "rgba(0,0,0,0.6)")
        ctx.fillStyle = vignette
        ctx.fillRect(0, 0, width, height)
      }

      // 扫描线 (Scanlines)
      if (Math.sin(time * 5) > 0.8) {
        // 偶尔闪烁的扫描线
        ctx.fillStyle = "rgba(0, 255, 255, 0.03)"
        for (let y = 0; y < height; y += 4) {
          ctx.fillRect(0, y, width, 1)
        }
      }
    },
    [drawStars],
  )


  const drawLightning = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array) => {
      // 1. 背景处理：纯黑夜空
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)

      const avgEnergy = safeNumber(data.reduce((sum, val) => sum + val, 0) / data.length / 255, 0)
      const bassEnergy = safeNumber(data.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10 / 255, 0)

      // 绘制远景星空
      drawStars(ctx, width, height, avgEnergy)

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
      if (bassEnergy > 0.45 && Math.random() < 0.35) {
        // z 轴范围 0.1 (远) 到 1.0 (近)
        const z = 0.2 + Math.random() * 0.8
        const perspectiveScale = z
        
        // 根据 z 轴决定水平位置范围
        const xRange = width * 1.5
        const startX = width / 2 + (Math.random() - 0.5) * xRange * perspectiveScale
        const startY = -50
        
        const points: { x: number; y: number; z: number }[] = [{ x: startX, y: startY, z }]

        let currentX = startX
        let currentY = startY

        // 根据 z 轴计算真实的地面击中点 Y 坐标 (符合近大远小透视)
        // z=0.2 对应远景 (groundHeight), z=1.0 对应近景 (height)
        const targetY = groundHeight + (height - groundHeight) * Math.pow((z - 0.2) / 0.8, 1.5)

        // 闪电向下延伸至计算出的击中点
        while (currentY < targetY) {
          const stepY = (20 + Math.random() * 50) * perspectiveScale
          currentY += stepY
          currentX += (Math.random() - 0.5) * 120 * perspectiveScale

          // 分支逻辑
          if (Math.random() < 0.25) {
            const branchX = currentX
            const branchY = currentY
            for (let b = 0; b < 2; b++) {
              points.push({
                x: branchX + (Math.random() - 0.5) * 80 * perspectiveScale,
                y: Math.min(branchY + (10 + Math.random() * 30) * perspectiveScale, targetY),
                z
              })
            }
          }

          points.push({ x: currentX, y: Math.min(currentY, targetY), z })
        }

        lightningRef.current.push({
          points,
          life: 1.0,
          hue: safeHue(200 + Math.random() * 60),
        })
      }

      // 5. 绘制闪电
      lightningRef.current = lightningRef.current.filter((l) => l.life > 0)

      lightningRef.current.forEach((lightning) => {
        const life = safeAlpha(lightning.life)
        const hue = safeHue(lightning.hue)
        const z = lightning.points[0].z
        const pScale = z // 透视缩放系数
        
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        
        // 根据透视调整粗细和模糊
        const baseWidth = (1 + pScale * 4)
        const glowWidth = baseWidth * 4 * pScale

        // 绘制主干
        ctx.beginPath()
        lightning.points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })

        // 外层辉光
        ctx.shadowBlur = 20 * pScale
        ctx.shadowColor = safeHSLA(hue, 100, 70, life * 0.8)
        ctx.strokeStyle = safeHSLA(hue, 100, 70, life * 0.4)
        ctx.lineWidth = glowWidth
        ctx.stroke()

        // 核心白光
        ctx.shadowBlur = 0
        ctx.strokeStyle = safeRGBA(255, 255, 255, life)
        ctx.lineWidth = baseWidth
        ctx.stroke()

        // 6. 击中地面效果
        const lastPoint = lightning.points[lightning.points.length - 1]
        const hitX = lastPoint.x
        const hitY = lastPoint.y // 使用闪电末端的实际坐标
        const hitSize = 40 * pScale * life
        
        // 只有当闪电确实到达地面区域时才绘制
        if (hitY >= groundHeight - 5) {
          const hitGrad = safeCreateRadialGradient(ctx, hitX, hitY, 0, hitX, hitY, hitSize * 3)
          if (hitGrad) {
            safeAddColorStop(hitGrad, 0, safeHSLA(hue, 100, 95, life))
            safeAddColorStop(hitGrad, 0.4, safeHSLA(hue, 100, 70, life * 0.6))
            safeAddColorStop(hitGrad, 1, "transparent")
            ctx.fillStyle = hitGrad
            ctx.beginPath()
            // 更加扁平的椭圆 (高度缩减更多)，增强贴地感
            ctx.ellipse(hitX, hitY, hitSize * 4, hitSize * 0.5, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          
          // 地面核心反光
          ctx.beginPath()
          ctx.ellipse(hitX, hitY, hitSize * 1.5, hitSize * 0.2, 0, 0, Math.PI * 2)
          ctx.fillStyle = "#fff"
          ctx.fill()
        }

        ctx.restore()
        lightning.life -= 0.08 // 闪电消失速度
      })

      // 全屏闪光
      if (bassEnergy > 0.7) {
        const flashGradient = safeCreateRadialGradient(
          ctx,
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height),
        )
        if (flashGradient) {
          safeAddColorStop(flashGradient, 0, safeRGBA(200, 220, 255, bassEnergy * 0.4))
          safeAddColorStop(flashGradient, 0.5, safeRGBA(150, 180, 255, bassEnergy * 0.2))
          safeAddColorStop(flashGradient, 1, "transparent")
          ctx.fillStyle = flashGradient
          ctx.fillRect(0, 0, width, height)
        }
      }

      ctx.shadowBlur = 0
    },
    [drawStars],
  )

  // 动画循环
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      const container = canvas.parentElement
      if (container) {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
      }
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    const animate = () => {
      timeRef.current += 1

      const drawFunctions: Record<VisualizerType, () => void> = {
        bars: () => drawBars(ctx, canvas.width, canvas.height, analyserData),
        wave: () => drawWave(ctx, canvas.width, canvas.height, analyserData),
        circle: () => drawCircle(ctx, canvas.width, canvas.height, analyserData),
        particles: () => drawParticles(ctx, canvas.width, canvas.height, analyserData),
        spectrum: () => drawRing(ctx, canvas.width, canvas.height, analyserData),
        galaxy: () => drawGalaxy(ctx, canvas.width, canvas.height, analyserData),
        dna: () => drawDNA(ctx, canvas.width, canvas.height, analyserData),
        matrix: () => drawMatrix(ctx, canvas.width, canvas.height, analyserData),
        fireworks: () => drawFireworks(ctx, canvas.width, canvas.height, analyserData),
        aurora: () => drawAurora(ctx, canvas.width, canvas.height, analyserData),
        vortex: () => drawVortex(ctx, canvas.width, canvas.height, analyserData),
        lightning: () => drawLightning(ctx, canvas.width, canvas.height, analyserData),
      }

      const drawFunction = drawFunctions[type]
      if (drawFunction) {
        drawFunction()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [
    type,
    analyserData,
    isPlaying,
    drawBars,
    drawWave,
    drawCircle,
    drawParticles,
    drawRing,
    drawGalaxy,
    drawDNA,
    drawMatrix,
    drawFireworks,
    drawAurora,
    drawVortex,
    drawLightning,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: "linear-gradient(to bottom, #0a0a0f, #1a1a2e)" }}
    />
  )
}
