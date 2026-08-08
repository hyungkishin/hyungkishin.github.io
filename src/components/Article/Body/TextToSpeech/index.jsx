import React, { useState, useRef, useCallback, useEffect } from "react"
import styled from "styled-components"

import ttsManifest from "data/ttsManifest.json"

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 12px 16px;
  border-radius: 8px;
  background: ${props => props.theme.colors.inlineCodeBackground};
  border: 1px solid ${props => props.theme.colors.border};
`

const PlayButton = styled.button`
  flex: none;
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
  font-size: 0.9rem;
  line-height: 1;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;
  }
`

const Seek = styled.input`
  flex: 1;
  min-width: 0;
  height: 4px;
  accent-color: ${props => props.theme.colors.accent};
  cursor: pointer;
`

const Time = styled.span`
  flex: none;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: ${props => props.theme.colors.secondaryText};
  user-select: none;
`

const Rate = styled.select`
  flex: none;
  font-size: 0.78rem;
  padding: 3px 4px;
  border-radius: 4px;
  border: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  cursor: pointer;
`

const RATES = [0.9, 1, 1.15, 1.3, 1.5]

const clock = seconds => {
  if (!Number.isFinite(seconds)) return "0:00"
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

// gatsby의 slug를 tts.mjs가 쓰는 키로 바꾼다. /a/b/ 는 a-b 다.
const manifestKey = slug => slug.replace(/^\/|\/$/g, "").split("/").join("-")

const TextToSpeech = ({ slug }) => {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)

  const entry = slug ? ttsManifest[manifestKey(slug)] : null

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.playbackRate = rate
      audio.play()
    } else {
      audio.pause()
    }
  }, [rate])

  const seek = useCallback(event => {
    const audio = audioRef.current
    if (audio) audio.currentTime = Number(event.target.value)
  }, [])

  if (!entry) return null

  return (
    <Wrapper>
      {/* 본문이 길어 파일이 크다. 눌렀을 때만 받는다. */}
      <audio
        ref={audioRef}
        src={`/tts/${manifestKey(slug)}.mp3`}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
      />
      <PlayButton
        onClick={toggle}
        aria-label={playing ? "낭독 일시정지" : "글 읽어주기"}
      >
        {playing ? "❚❚" : "▶"}
      </PlayButton>
      <Seek
        type="range"
        min={0}
        max={duration || 0}
        step={1}
        value={current}
        onChange={seek}
        aria-label="재생 위치"
      />
      <Time>
        {clock(current)} / {clock(duration)}
      </Time>
      <Rate
        value={rate}
        onChange={e => setRate(Number(e.target.value))}
        aria-label="읽기 속도"
      >
        {RATES.map(r => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </Rate>
    </Wrapper>
  )
}

export default TextToSpeech
