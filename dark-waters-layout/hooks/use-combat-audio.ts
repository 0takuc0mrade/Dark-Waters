"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type AudioCue =
  | "turnReady"
  | "playerHit"
  | "playerMiss"
  | "enemyHit"
  | "enemyMiss"
  | "victory"
  | "defeat"
  | "draw"
export type AudioMode = "synth" | "pack"

interface ToneStep {
  frequency: number
  duration: number
  delay: number
  gain: number
  type: OscillatorType
}

const LS_AUDIO_ENABLED = "dark-waters-audio-enabled"
const LS_AUDIO_MODE = "dark-waters-audio-mode"
const LS_MUSIC_ENABLED = "dark-waters-music-enabled"
const LS_SFX_VOLUME = "dark-waters-sfx-volume"
const LS_MUSIC_VOLUME = "dark-waters-music-volume"
const MUSIC_TRACK_URL = "/audio/ambient-command-loop.wav"

const CUE_ASSET_MAP: Record<AudioCue, string> = {
  turnReady: "/audio/turn-ready.wav",
  playerHit: "/audio/player-hit.wav",
  playerMiss: "/audio/player-miss.wav",
  enemyHit: "/audio/enemy-hit.wav",
  enemyMiss: "/audio/enemy-miss.wav",
  victory: "/audio/victory.wav",
  defeat: "/audio/defeat.wav",
  draw: "/audio/draw.wav",
}

const CUE_STEPS: Record<AudioCue, ToneStep[]> = {
  turnReady: [
    { frequency: 420, duration: 0.09, delay: 0, gain: 0.045, type: "triangle" },
    { frequency: 620, duration: 0.12, delay: 0.1, gain: 0.045, type: "triangle" },
  ],
  playerHit: [
    { frequency: 520, duration: 0.07, delay: 0, gain: 0.05, type: "square" },
    { frequency: 760, duration: 0.09, delay: 0.08, gain: 0.05, type: "square" },
  ],
  playerMiss: [{ frequency: 180, duration: 0.11, delay: 0, gain: 0.04, type: "sine" }],
  enemyHit: [
    { frequency: 220, duration: 0.08, delay: 0, gain: 0.055, type: "sawtooth" },
    { frequency: 160, duration: 0.14, delay: 0.09, gain: 0.04, type: "sawtooth" },
  ],
  enemyMiss: [{ frequency: 320, duration: 0.08, delay: 0, gain: 0.035, type: "triangle" }],
  victory: [
    { frequency: 392, duration: 0.1, delay: 0, gain: 0.05, type: "triangle" },
    { frequency: 523, duration: 0.12, delay: 0.12, gain: 0.05, type: "triangle" },
    { frequency: 659, duration: 0.2, delay: 0.26, gain: 0.055, type: "triangle" },
  ],
  defeat: [
    { frequency: 300, duration: 0.09, delay: 0, gain: 0.05, type: "sawtooth" },
    { frequency: 220, duration: 0.12, delay: 0.1, gain: 0.05, type: "sawtooth" },
    { frequency: 160, duration: 0.16, delay: 0.24, gain: 0.05, type: "sawtooth" },
  ],
  draw: [
    { frequency: 260, duration: 0.1, delay: 0, gain: 0.04, type: "triangle" },
    { frequency: 260, duration: 0.1, delay: 0.14, gain: 0.04, type: "triangle" },
  ],
}

export function useCombatAudio() {
  const [audioEnabled, setAudioEnabledState] = useState(true)
  const [audioMode, setAudioModeState] = useState<AudioMode>("pack")
  const [musicEnabled, setMusicEnabledState] = useState(true)
  const [sfxVolume, setSfxVolumeState] = useState(0.75)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const contextRef = useRef<AudioContext | null>(null)
  const musicRef = useRef<HTMLAudioElement | null>(null)

  const ensureContext = useCallback(() => {
    if (typeof window === "undefined") return null
    const AudioContextImpl = window.AudioContext
    if (!AudioContextImpl) return null
    if (!contextRef.current) {
      contextRef.current = new AudioContextImpl()
    }
    return contextRef.current
  }, [])

  useEffect(() => {
    const savedPreference = localStorage.getItem(LS_AUDIO_ENABLED)
    const savedMode = localStorage.getItem(LS_AUDIO_MODE)
    const savedMusicEnabled = localStorage.getItem(LS_MUSIC_ENABLED)
    const savedSfxVolume = localStorage.getItem(LS_SFX_VOLUME)
    const savedMusicVolume = localStorage.getItem(LS_MUSIC_VOLUME)

    if (savedPreference === "false") {
      setAudioEnabledState(false)
    }
    if (savedMode === "synth" || savedMode === "pack") {
      setAudioModeState(savedMode)
    }
    if (savedMusicEnabled === "false") {
      setMusicEnabledState(false)
    }
    if (savedSfxVolume) {
      const parsed = Number(savedSfxVolume)
      if (Number.isFinite(parsed)) setSfxVolumeState(Math.max(0, Math.min(1, parsed)))
    }
    if (savedMusicVolume) {
      const parsed = Number(savedMusicVolume)
      if (Number.isFinite(parsed)) setMusicVolumeState(Math.max(0, Math.min(1, parsed)))
    }
  }, [])

  const setAudioEnabled = useCallback((enabled: boolean) => {
    setAudioEnabledState(enabled)
    localStorage.setItem(LS_AUDIO_ENABLED, enabled ? "true" : "false")
  }, [])

  const setAudioMode = useCallback((mode: AudioMode) => {
    setAudioModeState(mode)
    localStorage.setItem(LS_AUDIO_MODE, mode)
  }, [])

  const setMusicEnabled = useCallback((enabled: boolean) => {
    setMusicEnabledState(enabled)
    localStorage.setItem(LS_MUSIC_ENABLED, enabled ? "true" : "false")
  }, [])

  const setSfxVolume = useCallback((next: number) => {
    const normalized = Math.max(0, Math.min(1, next))
    setSfxVolumeState(normalized)
    localStorage.setItem(LS_SFX_VOLUME, String(normalized))
  }, [])

  const setMusicVolume = useCallback((next: number) => {
    const normalized = Math.max(0, Math.min(1, next))
    setMusicVolumeState(normalized)
    localStorage.setItem(LS_MUSIC_VOLUME, String(normalized))
  }, [])

  const ensureMusic = useCallback(() => {
    if (typeof window === "undefined") return null
    if (!musicRef.current) {
      const audio = new Audio(MUSIC_TRACK_URL)
      audio.loop = true
      audio.preload = "auto"
      musicRef.current = audio
    }
    return musicRef.current
  }, [])

  const syncMusicPlayback = useCallback(async () => {
    const music = ensureMusic()
    if (!music) return

    music.volume = audioEnabled && musicEnabled ? musicVolume : 0
    if (!audioEnabled || !musicEnabled) {
      music.pause()
      return
    }

    try {
      await music.play()
    } catch {
      // Browser autoplay policies may block until first user gesture.
    }
  }, [audioEnabled, ensureMusic, musicEnabled, musicVolume])

  useEffect(() => {
    void syncMusicPlayback()
  }, [syncMusicPlayback])

  const playSynthCue = useCallback(
    async (cue: AudioCue) => {
      if (!audioEnabled) return
      const ctx = ensureContext()
      if (!ctx) return false
      if (ctx.state === "suspended") {
        try {
          await ctx.resume()
        } catch {
          return false
        }
      }

      const now = ctx.currentTime
      for (const step of CUE_STEPS[cue]) {
        const oscillator = ctx.createOscillator()
        const gainNode = ctx.createGain()
        oscillator.type = step.type
        oscillator.frequency.setValueAtTime(step.frequency, now + step.delay)

        const cueGain = Math.max(0.0001, step.gain * sfxVolume)
        gainNode.gain.setValueAtTime(0.0001, now + step.delay)
        gainNode.gain.exponentialRampToValueAtTime(cueGain, now + step.delay + 0.01)
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          now + step.delay + step.duration
        )

        oscillator.connect(gainNode)
        gainNode.connect(ctx.destination)
        oscillator.start(now + step.delay)
        oscillator.stop(now + step.delay + step.duration + 0.02)
      }
      return true
    },
    [audioEnabled, ensureContext, sfxVolume]
  )

  const playPackCue = useCallback(
    async (cue: AudioCue) => {
      if (!audioEnabled) return false
      const src = CUE_ASSET_MAP[cue]
      const fx = new Audio(src)
      fx.preload = "auto"
      fx.volume = sfxVolume
      try {
        await fx.play()
        return true
      } catch {
        return false
      }
    },
    [audioEnabled, sfxVolume]
  )

  const playCue = useCallback(
    async (cue: AudioCue) => {
      if (!audioEnabled) return
      if (audioMode === "pack") {
        const played = await playPackCue(cue)
        if (played) return
      }
      await playSynthCue(cue)
    },
    [audioEnabled, audioMode, playPackCue, playSynthCue]
  )

  useEffect(() => {
    const unlockAudio = async () => {
      const ctx = ensureContext()
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume()
        } catch {
          // ignored
        }
      }
      await syncMusicPlayback()
    }

    window.addEventListener("pointerdown", unlockAudio, { passive: true })
    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
    }
  }, [ensureContext, syncMusicPlayback])

  useEffect(() => {
    return () => {
      if (!contextRef.current) return
      void contextRef.current.close()
      contextRef.current = null
      if (musicRef.current) {
        musicRef.current.pause()
        musicRef.current = null
      }
    }
  }, [])

  return {
    audioEnabled,
    setAudioEnabled,
    audioMode,
    setAudioMode,
    musicEnabled,
    setMusicEnabled,
    sfxVolume,
    setSfxVolume,
    musicVolume,
    setMusicVolume,
    playCue,
  }
}
