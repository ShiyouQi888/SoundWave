import type React from "react"
import type { Metadata, Viewport } from "next"
import { Space_Grotesk, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AudioProvider } from "@/lib/audio-context"
import { MainLayout } from "@/components/main-layout"
import "./globals.css"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SoundWave - 音乐可视化",
  description: "沉浸式音乐可视化体验，上传音乐，探索多种炫酷视觉效果",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#1a1625",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">
        <AudioProvider>
          <MainLayout>{children}</MainLayout>
        </AudioProvider>
        <Analytics />
      </body>
    </html>
  )
}
