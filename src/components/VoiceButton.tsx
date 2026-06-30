'use client'

import { useEffect, useRef } from 'react'
import type { VoiceFormStatus, VoiceFormTier } from '../types'

export interface VoiceButtonProps {
  status: VoiceFormStatus
  transcript: string
  confidence: number | null
  tier: VoiceFormTier
  followUpQuestion: string
  /** Array of field keys still needed — provide label map via fieldLabels */
  missingFields: string[]
  /** Map of field key → human label for the chips e.g. { requiredKw: 'Required kW' } */
  fieldLabels?: Record<string, string>
  turn: number
  onStart: () => void
  onStop: () => void
  onClose: () => void
  /** Override button label. Default: 'Voice fill' */
  buttonLabel?: string
}

const STATUS_LABEL: Record<VoiceFormStatus, string> = {
  idle: 'Tap the mic and speak',
  listening: 'Listening…',
  processing: 'Processing…',
  speaking: 'Please answer…',
  done: 'All fields filled',
  error: 'Something went wrong',
  unsupported: 'Not supported in this browser',
}

export function VoiceButton({
  status,
  transcript,
  confidence,
  tier,
  followUpQuestion,
  missingFields,
  fieldLabels = {},
  turn,
  onStart,
  onStop,
  onClose,
  buttonLabel = 'Voice fill',
}: VoiceButtonProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const isListening  = status === 'listening'
  const isProcessing = status === 'processing'
  const isSpeaking   = status === 'speaking'
  const isDone       = status === 'done'
  const isError      = status === 'error' || status === 'unsupported'
  const isActive     = isListening || isProcessing || isSpeaking

  return (
    <div ref={popupRef} className="relative">
      {/* Trigger chip */}
      <button
        type="button"
        onClick={isActive ? onStop : onStart}
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 font-sans text-[11px] font-semibold transition-colors',
          isActive
            ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
            : 'border-border/50 bg-card text-foreground/60 hover:bg-secondary hover:text-foreground',
        ].join(' ')}
        aria-label={buttonLabel}
      >
        {isActive ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
        {buttonLabel}
        {isActive && <PulseDot />}
      </button>

      {/* Popup */}
      {status !== 'idle' && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border/50 bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                Voice Input
              </span>
              {turn > 0 && (
                <span className="rounded-full bg-secondary px-2 py-0.5 font-sans text-[10px] text-foreground/40">
                  Turn {turn + 1}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-5 w-5 place-items-center rounded text-foreground/40 hover:text-foreground"
              aria-label="Close voice input"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 px-4 py-5">
            {/* Icon */}
            <div className="relative grid h-14 w-14 place-items-center">
              {isListening && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
                  <span className="absolute inset-1 animate-ping rounded-full bg-blue-500/15" style={{ animationDelay: '150ms' }} />
                </>
              )}
              {isSpeaking && <span className="absolute inset-0 animate-pulse rounded-full bg-violet-500/15" />}
              <div className={[
                'relative grid h-14 w-14 place-items-center rounded-full transition-colors',
                isListening  ? 'bg-blue-500/20 text-blue-400'
                : isProcessing ? 'bg-amber-500/15 text-amber-400'
                : isSpeaking   ? 'bg-violet-500/15 text-violet-400'
                : isDone       ? 'bg-emerald-500/15 text-emerald-400'
                : isError      ? 'bg-destructive/15 text-destructive'
                :                'bg-secondary text-foreground/60',
              ].join(' ')}>
                {isDone ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : isError ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                ) : isSpeaking ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                )}
              </div>
            </div>

            {/* Status */}
            <p className="font-sans text-[12px] font-semibold text-foreground">{STATUS_LABEL[status]}</p>

            {/* Follow-up question bubble */}
            {(isSpeaking || (followUpQuestion && isListening)) && (
              <div className="w-full rounded-lg border border-violet-500/20 bg-violet-500/8 px-3 py-2.5">
                <p className="font-sans text-[11px] font-medium leading-relaxed text-violet-300">
                  {followUpQuestion}
                </p>
              </div>
            )}

            {/* Missing fields chips */}
            {missingFields.length > 0 && !isDone && (
              <div className="w-full">
                <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-foreground/35">
                  Still needed
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missingFields.map((f) => (
                    <span
                      key={f}
                      className="rounded-full border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 font-sans text-[10px] text-amber-400"
                    >
                      {fieldLabels[f] ?? f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tier badge */}
            {isDone && tier && (
              <div className={[
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[10px] font-semibold',
                tier === 'ai-fallback' ? 'bg-violet-500/10 text-violet-400' : 'bg-emerald-500/10 text-emerald-400',
              ].join(' ')}>
                {tier === 'ai-fallback' ? '✦ AI enhanced' : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    Web Speech{confidence !== null ? ` · ${Math.round(confidence * 100)}%` : ''}
                  </>
                )}
              </div>
            )}

            {/* Low confidence hint */}
            {isProcessing && confidence !== null && confidence < 0.3 && (
              <p className="font-sans text-[10px] text-amber-400">
                Low confidence ({Math.round(confidence * 100)}%) — switching to AI…
              </p>
            )}

            {/* Transcript */}
            {transcript && !isSpeaking && (
              <div className="w-full rounded-lg bg-secondary/60 px-3 py-2">
                <p className="font-sans text-[11px] italic text-foreground/60">&ldquo;{transcript}&rdquo;</p>
              </div>
            )}

            {isDone && (
              <p className="font-sans text-[10px] text-emerald-400/70">Submitting form…</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PulseDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
    </span>
  )
}
