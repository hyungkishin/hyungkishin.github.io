import React, { useState, useEffect, useCallback, useRef } from "react"
import styled from "styled-components"

const GOOGLE_TTS_API_KEY = process.env.GATSBY_GOOGLE_TTS_API_KEY || ""

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  padding: 12px 16px;
  border-radius: 8px;
  background: ${props => props.theme.colors.inlineCodeBackground};
  border: 1px solid ${props => props.theme.colors.border};
  flex-wrap: wrap;
`

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: ${props => props.theme.colors.accent};
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const StopButton = styled(Button)`
  background: ${props => props.theme.colors.secondaryText};
`

const Label = styled.span`
  font-size: 0.85rem;
  color: ${props => props.theme.colors.secondaryText};
  margin-left: 4px;
  user-select: none;
`

const SelectGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
`

const Select = styled.select`
  font-size: 0.8rem;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  cursor: pointer;
`

const VOICE_OPTIONS = [
  { name: "ko-KR-Neural2-A", label: "여성 1" },
  { name: "ko-KR-Neural2-B", label: "여성 2" },
  { name: "ko-KR-Neural2-C", label: "남성 1" },
  { name: "ko-KR-Wavenet-A", label: "여성 3" },
  { name: "ko-KR-Wavenet-C", label: "남성 2" },
]

// 텍스트를 ~4000바이트 이하 청크로 분할 (API 제한 5000바이트)
const splitText = text => {
  const maxLen = 1500
  const sentences = text.split(/(?<=[.!?다요죠음됨함임]\s)|(?<=\n)/)
  const chunks = []
  let current = ""

  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current.trim()) chunks.push(current.trim())
      current = s
    } else {
      current += s
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

const getArticleText = () => {
  const el = document.getElementById("article-body")
  if (!el) return ""
  const clone = el.cloneNode(true)
  clone
    .querySelectorAll("pre, code, .mermaid-diagram, .katex")
    .forEach(n => n.remove())
  return clone.textContent || ""
}

// ── Google Cloud TTS ──
const fetchGoogleTTS = async (text, voiceName, rate) => {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ko-KR", name: voiceName },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: rate,
          pitch: 0,
        },
      }),
    }
  )
  if (!res.ok) throw new Error("Google TTS API error")
  const data = await res.json()
  return data.audioContent // base64
}

const base64ToAudio = base64 => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: "audio/mp3" })
  return new Audio(URL.createObjectURL(blob))
}

// ── Web Speech API fallback ──
const pickBestVoice = () => {
  const voices = window.speechSynthesis.getVoices()
  const korean = voices.filter(v => v.lang.startsWith("ko"))
  return (
    korean.find(v => v.name === "Google 한국의") || korean[0] || null
  )
}

const TextToSpeech = () => {
  const [status, setStatus] = useState("idle")
  const [rate, setRate] = useState(1)
  const [voiceName, setVoiceName] = useState(VOICE_OPTIONS[0].name)
  const audioRef = useRef(null)
  const chunksRef = useRef([])
  const chunkIndexRef = useRef(0)
  const stoppedRef = useRef(false)

  const useGoogleTTS = !!GOOGLE_TTS_API_KEY

  // ── Google TTS 재생 ──
  const playGoogleChunk = useCallback(
    async index => {
      if (stoppedRef.current) return
      const chunks = chunksRef.current
      if (index >= chunks.length) {
        setStatus("idle")
        return
      }
      chunkIndexRef.current = index
      try {
        const base64 = await fetchGoogleTTS(chunks[index], voiceName, rate)
        if (stoppedRef.current) return
        const audio = base64ToAudio(base64)
        audioRef.current = audio
        audio.onended = () => playGoogleChunk(index + 1)
        audio.onerror = () => setStatus("idle")
        audio.play()
      } catch {
        setStatus("idle")
      }
    },
    [voiceName, rate]
  )

  // ── Web Speech fallback 재생 ──
  const playSpeechChunk = useCallback(
    index => {
      if (stoppedRef.current) return
      const chunks = chunksRef.current
      if (index >= chunks.length) {
        setStatus("idle")
        return
      }
      chunkIndexRef.current = index
      const utterance = new SpeechSynthesisUtterance(chunks[index])
      utterance.lang = "ko-KR"
      utterance.rate = rate
      const voice = pickBestVoice()
      if (voice) utterance.voice = voice
      utterance.onend = () => playSpeechChunk(index + 1)
      utterance.onerror = e => {
        if (e.error !== "canceled") setStatus("idle")
      }
      window.speechSynthesis.speak(utterance)
    },
    [rate]
  )

  const handlePlay = useCallback(() => {
    if (status === "paused") {
      if (useGoogleTTS && audioRef.current) {
        audioRef.current.play()
      } else {
        window.speechSynthesis.resume()
      }
      setStatus("speaking")
      return
    }

    // 새로 시작
    stoppedRef.current = false
    const text = getArticleText()
    if (!text.trim()) return

    chunksRef.current = splitText(text)
    chunkIndexRef.current = 0
    setStatus("speaking")

    if (useGoogleTTS) {
      playGoogleChunk(0)
    } else {
      window.speechSynthesis.cancel()
      playSpeechChunk(0)
    }
  }, [status, useGoogleTTS, playGoogleChunk, playSpeechChunk])

  const handlePause = useCallback(() => {
    if (useGoogleTTS && audioRef.current) {
      audioRef.current.pause()
    } else {
      window.speechSynthesis.pause()
    }
    setStatus("paused")
  }, [useGoogleTTS])

  const handleStop = useCallback(() => {
    stoppedRef.current = true
    if (useGoogleTTS && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    } else {
      window.speechSynthesis.cancel()
    }
    chunksRef.current = []
    chunkIndexRef.current = 0
    setStatus("idle")
  }, [useGoogleTTS])

  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel()
    }
  }, [])

  if (typeof window === "undefined") return null
  if (!useGoogleTTS && !("speechSynthesis" in window)) return null

  return (
    <Wrapper>
      {status === "speaking" ? (
        <Button onClick={handlePause} title="일시정지">
          ⏸
        </Button>
      ) : (
        <Button onClick={handlePlay} title="읽어주기">
          ▶
        </Button>
      )}
      <StopButton
        onClick={handleStop}
        disabled={status === "idle"}
        title="정지"
      >
        ⏹
      </StopButton>
      <Label>
        {status === "idle" && "글 읽어주기"}
        {status === "speaking" && "읽는 중..."}
        {status === "paused" && "일시정지"}
      </Label>
      <SelectGroup>
        {useGoogleTTS && (
          <Select
            value={voiceName}
            onChange={e => setVoiceName(e.target.value)}
            title="음성 선택"
          >
            {VOICE_OPTIONS.map(v => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </Select>
        )}
        <Select
          value={rate}
          onChange={e => setRate(Number(e.target.value))}
          title="읽기 속도"
        >
          <option value={0.8}>느리게</option>
          <option value={1}>보통</option>
          <option value={1.2}>약간 빠르게</option>
          <option value={1.5}>빠르게</option>
        </Select>
      </SelectGroup>
    </Wrapper>
  )
}

export default TextToSpeech
