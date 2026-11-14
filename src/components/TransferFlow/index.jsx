import React, { useEffect, useState } from "react"
import { FiPause, FiPlay } from "react-icons/fi"

import "./transfer-flow.css"

const steps = [
  { name: "요청 접수", description: "송금 요청을 저장했다. 이때 접수 응답을 보낸다.", position: 161 },
  { name: "거래 심사", description: "심사를 통과하면 은행에 송금을 요청한다.", position: 273 },
  { name: "입금 확인", description: "은행이 입금을 확인하면 송금을 확정한다.", position: 384 },
]

function TransferDrawing({ step }) {
  return (
    <svg className="tf-drawing" viewBox="0 0 440 112" aria-hidden="true" focusable="false">
      <g className="tf-guides">
        <path d="M91 23V94 M161 23V94 M273 23V94 M384 23V94" />
      </g>
      <text className="tf-start-label" x="91" y="13" textAnchor="middle">요청 도착</text>
      <g className="tf-labels">
        <text x="0" y="39">접수 응답</text>
        <text x="0" y="79">송금 확정</text>
      </g>
      <path className="tf-track" d="M91 74H384" />
      <g className="tf-trace">
        <path d="M91 34H161" />
        <path d="M91 74H384" pathLength="293" strokeDasharray="293"
          strokeDashoffset={384 - steps[step].position} />
      </g>
      <g className="tf-origin">
        <circle cx="91" cy="34" r="3" />
        <circle cx="91" cy="74" r="3" />
      </g>
      <circle className="tf-point" cx="161" cy="34" r="5" />
      <circle className="tf-point tf-moving-point" cx="91" cy="74" r="5"
        style={{ transform: `translateX(${steps[step].position - 91}px)` }} />
    </svg>
  )
}

export default function TransferFlow() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReady(true)
    setPlaying(!motion.matches)
    const stopIfReduced = () => {
      if (motion.matches) setPlaying(false)
    }
    motion.addEventListener("change", stopIfReduced)
    return () => motion.removeEventListener("change", stopIfReduced)
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    const timer = window.setTimeout(() => {
      const nextStep = step + 1
      setStep(nextStep)
      if (nextStep === steps.length - 1) setPlaying(false)
    }, 4400)
    return () => window.clearTimeout(timer)
  }, [playing, step])

  function togglePlayback() {
    if (step === steps.length - 1) setStep(0)
    setPlaying(!playing)
  }

  return (
    <figure className="transfer-flow" aria-label="1만 원 송금의 처리 과정">
      <figcaption className="tf-heading">송금 한 건에서 재는 두 시간</figcaption>
      <TransferDrawing step={step} />
      <div className="tf-controls">
        <button type="button" className="tf-play" disabled={!ready} onClick={togglePlayback}
          aria-label={playing ? "송금 과정 일시 정지" : step === steps.length - 1 ? "송금 과정 다시 재생" : "송금 과정 재생"}>
          {playing ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}
          <span>{playing ? "정지" : "재생"}</span>
        </button>
        <div className="tf-stages" role="group" aria-label="송금 단계 선택">
          {steps.map(({ name }, index) => (
            <button type="button" key={name} aria-pressed={step === index} disabled={!ready}
              onClick={() => { setPlaying(false); setStep(index) }}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <p className="tf-detail" aria-live={playing ? "off" : "polite"} aria-atomic="true">{steps[step].description}</p>
      <noscript><p className="tf-detail">심사와 은행 입금 확인에 걸린 시간은 접수 이후에도 계속 누적된다.</p></noscript>
    </figure>
  )
}
