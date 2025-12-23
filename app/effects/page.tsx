"use client"

import { useAudio } from "@/lib/audio-context"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { VisualizerSelector } from "@/components/visualizer-selector"
import { RotateCcw, Volume2, Disc3, Music, Headphones, Radio, Mic2, Drum, Guitar } from "lucide-react"

const presets = [
  { name: "标准", desc: "原始音效", bass: 0, treble: 0, stereoWidth: 0, compression: 0, icon: Music },
  { name: "重低音", desc: "增强低频", bass: 8, treble: 2, stereoWidth: 0, compression: 2, icon: Drum },
  { name: "清晰人声", desc: "突出人声", bass: -3, treble: 5, stereoWidth: 0, compression: 4, icon: Mic2 },
  { name: "流行音乐", desc: "均衡增强", bass: 4, treble: 4, stereoWidth: 2, compression: 3, icon: Radio },
  { name: "摇滚", desc: "强劲有力", bass: 6, treble: 6, stereoWidth: 3, compression: 5, icon: Guitar },
  { name: "古典", desc: "温暖自然", bass: 2, treble: -2, stereoWidth: 4, compression: 1, icon: Headphones },
  { name: "电子", desc: "动感十足", bass: 7, treble: 5, stereoWidth: 5, compression: 6, icon: Disc3 },
  { name: "爵士", desc: "圆润柔和", bass: 3, treble: 1, stereoWidth: 3, compression: 2, icon: Music },
]

export default function EffectsPage() {
  const { effects, setEffects, visualizerType, setVisualizerType } = useAudio()

  const resetEffects = () => {
    setEffects({
      bass: 0,
      treble: 0,
      reverb: 0,
      echo: 0,
      stereoWidth: 0,
      compression: 0,
    })
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 md:px-6 py-4 border-b border-border/50">
        <h1 className="text-xl md:text-2xl font-bold">音效调节</h1>
        <p className="text-sm text-muted-foreground mt-1">自定义你的听觉与视觉体验</p>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6 md:space-y-8">
        {/* Visualizer Selection */}
        <section>
          <h2 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-primary" />
            可视化效果 (12种)
          </h2>
          <VisualizerSelector selected={visualizerType} onSelect={setVisualizerType} layout="grid" />
        </section>

        {/* Equalizer */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary" />
              均衡器
            </h2>
            <Button variant="outline" size="sm" onClick={resetEffects} className="gap-2 bg-transparent text-xs md:text-sm">
              <RotateCcw className="w-3 h-3 md:w-4 md:h-4" />
              重置全部
            </Button>
          </div>

          <div className="grid gap-4 md:gap-6 md:grid-cols-2">
            {/* Bass */}
            <div className="space-y-3 p-3 md:p-4 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-sm md:text-base font-medium flex items-center gap-2">
                  <Drum className="w-4 h-4 text-pink-400" />
                  低音 (Bass)
                </label>
                <span className="text-xs md:text-sm text-primary font-mono">
                  {effects.bass > 0 ? "+" : ""}
                  {effects.bass} dB
                </span>
              </div>
              <Slider
                value={[effects.bass]}
                min={-12}
                max={12}
                step={1}
                onValueChange={(v) => setEffects({ ...effects, bass: v[0] })}
                className="[&_[role=slider]]:bg-pink-500"
              />
              <p className="text-[10px] md:text-xs text-muted-foreground">增强低频音效，让音乐更有厚重感和冲击力</p>
            </div>

            {/* Treble */}
            <div className="space-y-3 p-3 md:p-4 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-sm md:text-base font-medium flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-cyan-400" />
                  高音 (Treble)
                </label>
                <span className="text-xs md:text-sm text-primary font-mono">
                  {effects.treble > 0 ? "+" : ""}
                  {effects.treble} dB
                </span>
              </div>
              <Slider
                value={[effects.treble]}
                min={-12}
                max={12}
                step={1}
                onValueChange={(v) => setEffects({ ...effects, treble: v[0] })}
                className="[&_[role=slider]]:bg-cyan-500"
              />
              <p className="text-[10px] md:text-xs text-muted-foreground">调节高频亮度，让声音更清晰、明亮</p>
            </div>

            {/* Stereo Width */}
            <div className="space-y-3 p-3 md:p-4 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-sm md:text-base font-medium flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-purple-400" />
                  声场宽度
                </label>
                <span className="text-xs md:text-sm text-primary font-mono">{effects.stereoWidth}</span>
              </div>
              <Slider
                value={[effects.stereoWidth]}
                min={0}
                max={10}
                step={1}
                onValueChange={(v) => setEffects({ ...effects, stereoWidth: v[0] })}
                className="[&_[role=slider]]:bg-purple-500"
              />
              <p className="text-[10px] md:text-xs text-muted-foreground">扩展立体声场，营造更沉浸的空间感</p>
            </div>

            {/* Compression */}
            <div className="space-y-3 p-3 md:p-4 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-sm md:text-base font-medium flex items-center gap-2">
                  <Radio className="w-4 h-4 text-orange-400" />
                  动态压缩
                </label>
                <span className="text-xs md:text-sm text-primary font-mono">{effects.compression}</span>
              </div>
              <Slider
                value={[effects.compression]}
                min={0}
                max={10}
                step={1}
                onValueChange={(v) => setEffects({ ...effects, compression: v[0] })}
                className="[&_[role=slider]]:bg-orange-500"
              />
              <p className="text-[10px] md:text-xs text-muted-foreground">压缩动态范围，让音量更均衡、有力</p>
            </div>
          </div>
        </section>

        {/* Presets */}
        <section>
          <h2 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            预设效果
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
            {presets.map((preset) => {
              const Icon = preset.icon
              const isActive =
                effects.bass === preset.bass &&
                effects.treble === preset.treble &&
                effects.stereoWidth === preset.stereoWidth &&
                effects.compression === preset.compression

              return (
                <Button
                  key={preset.name}
                  variant="outline"
                  className={`h-auto py-3 md:py-4 flex-col gap-1 md:gap-2 bg-transparent transition-all ${
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:border-primary/50 hover:bg-primary/5"
                  }`}
                  onClick={() =>
                    setEffects({
                      ...effects,
                      bass: preset.bass,
                      treble: preset.treble,
                      stereoWidth: preset.stereoWidth,
                      compression: preset.compression,
                    })
                  }
                >
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="font-medium text-xs md:text-sm">{preset.name}</span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">{preset.desc}</span>
                </Button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
