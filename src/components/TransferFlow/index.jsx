import React, { useEffect, useState } from "react"
import { FiPause, FiPlay } from "react-icons/fi"

import "./transfer-flow.css"

const steps = [
  { name: "요청 접수", recipient: "입금 확인 전", detail: "송금 요청을 저장하고 심사를 기다립니다." },
  { name: "거래 심사", recipient: "입금 확인 전", detail: "심사를 통과하면 외부 기관에 송금을 요청합니다." },
  { name: "송금 확정", recipient: "입금 확인", detail: "외부 기관의 송금 완료를 확인한 뒤 확정합니다." },
]

function Platform() {
  return (
    <g strokeWidth="1.8" strokeLinejoin="round">
      <path className="tf-platform-edge" d="m-62 85 62 26 62-26v8L0 120l-62-27z" />
      <path className="tf-platform-top" d="m0 58 62 27-62 27-62-27z" />
      <path d="M0 112v8" fill="none" />
    </g>
  )
}

function TransferDrawing({ step }) {
  return (
    <svg className="tf-drawing" viewBox="0 0 500 143" aria-hidden="true" focusable="false">
      <g className="tf-wires" fill="none" strokeLinejoin="round">
        <path d="M83 100l29 12 66-28 38 17" />
        <path d="M249 100l29 12 66-28 38 17" />
      </g>
      <g className="tf-progress-wires" fill="none" strokeLinejoin="round">
        <path className={step >= 1 ? "is-connected" : ""} d="M83 100l29 12 66-28 38 17" />
        <path className={step === 2 ? "is-connected" : ""} d="M249 100l29 12 66-28 38 17" />
      </g>

      <g transform="translate(83 7)" className={'tf-station' + (step === 0 ? " is-active" : " is-past")}>
        <Platform />
        <g className="tf-device" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path className="tf-device-side" d="m-29 45 54-23 8 3-54 24z M25 22l8 3v47l-8 4z" />
          <path className="tf-device-face" d="m-29 45 54-23v54l-7-1-6 7-7-1-7 7-7-1-6 7-7-1-7 5z" />
          <g className="tf-ink" fill="none">
            <path strokeWidth="4" d="m-18 53 15-6" />
            <path d="m-18 63 32-14m-32 22 24-10" />
          </g>
        </g>
      </g>

      <g transform="translate(249 7)" className={'tf-station' + (step === 1 ? " is-active" : step > 1 ? " is-past" : "")}>
        <Platform />
        <g className="tf-device" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path className="tf-device-side" d="m-26 35 28-17 30 3 7 4v29Q38 74 10 93l-7-4q27-20 29-39V21L3 18z" />
          <path className="tf-device-face" d="M-26 35Q-9 30 2 18q12 8 30 3v29Q30 69 3 89q-24-4-29-25z" />
          <path className="tf-ink" fill="none" strokeWidth="4.5" d="m-10 53 9 8 18-23" />
        </g>
      </g>

      <g transform="translate(415 7)" className={'tf-station' + (step === 2 ? " is-active" : "")}>
        <Platform />
        <g className="tf-device" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path className="tf-device-side" d="m17 48 20-9v34L17 83z" />
          <path className="tf-device-face" d="m-29 29 46 20v34l-46-20z" />
          <path className="tf-device-side" d="m-35 30 26-15 25-11 25 27-23 19z" />
          <path className="tf-device-face" d="m-35 30 24-19 29 39z" />
          <path className="tf-ink" fill="none" d="m-12 25 3 1" strokeWidth="3.5" />
          <path className="tf-device-face" d="m-34 63 52 22v5l-52-22z" />
          <path className="tf-device-side" d="m18 85 24-11v5L18 90z" />
          <path className="tf-ink" fill="none" strokeWidth="3.5" d="m-21 44 0 17m13-12v17m13-11v17" />
        </g>
      </g>
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
      <figcaption className="tf-heading">
        <div>
          <span className="tf-heading-label">송금 요청 한 건</span>
          <div className="tf-amount">10,000<span>원</span></div>
        </div>
        {ready && (
          <button type="button" className="tf-play" onClick={togglePlayback}
            aria-label={playing ? "송금 과정 일시 정지" : step === steps.length - 1 ? "송금 과정 다시 재생" : "송금 과정 재생"}>
            {playing ? <FiPause aria-hidden="true" /> : <FiPlay aria-hidden="true" />}
          </button>
        )}
      </figcaption>
      <TransferDrawing step={step} />
      <div className="tf-stages" role="group" aria-label="송금 단계 선택">
        {steps.map(({ name }, index) => (
          <button type="button" key={name} aria-pressed={step === index} disabled={!ready}
            onClick={() => { setPlaying(false); setStep(index) }}>
            {name}
          </button>
        ))}
      </div>
      <div className="tf-result" aria-live={playing ? "off" : "polite"} aria-atomic="true">
        <p className="tf-recipient"><span>수취 계좌</span> <strong>{steps[step].recipient}</strong></p>
        <p className="tf-detail">{steps[step].detail}</p>
      </div>
      <noscript><p className="tf-detail">심사를 통과한 송금은 외부 기관의 완료 응답을 확인한 뒤 확정합니다.</p></noscript>
    </figure>
  )
}
