'use client'

import { useState, useRef, useCallback } from 'react'
import type { FieldSchema, VoiceFormStatus, VoiceFormTier, VoiceFillResponse } from '../types'

export interface UseVoiceFormConfig {
  /** Field definitions — drives AI prompt and missing-field detection */
  fields: FieldSchema[]
  /** API endpoint — defaults to '/api/voice-fill' */
  apiEndpoint?: string
  /** Called after each turn with newly extracted fields */
  onFields: (fields: Record<string, unknown>) => void
  /** Called when all required fields are collected — trigger form submit here */
  onComplete?: () => void
  onError?: (message: string) => void
  /** Confidence threshold below which audio fallback is used (0–1). Default: 0.3 */
  confidenceThreshold?: number
}

export function useVoiceForm({
  fields,
  apiEndpoint = '/api/voice-fill',
  onFields,
  onComplete,
  onError,
  confidenceThreshold = 0.3,
}: UseVoiceFormConfig) {
  const [status, setStatus] = useState<VoiceFormStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [tier, setTier] = useState<VoiceFormTier>(null)
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [turn, setTurn] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const collectedFieldsRef = useRef<Record<string, unknown>>({})
  const conversationHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])

  // Keep startListening in a ref so speakAndListen can call it without circular deps
  const startListeningRef = useRef<() => void>(() => {})

  const isSupported =
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in (window as any))

  // ── SpeechSynthesis ───────────────────────────────────────────────────────
  const speakAndListen = useCallback((question: string) => {
    setStatus('speaking')
    setFollowUpQuestion(question)

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      startListeningRef.current()
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(question)
    utterance.rate = 1.0
    utterance.onend = () => startListeningRef.current()
    utterance.onerror = () => startListeningRef.current()
    window.speechSynthesis.speak(utterance)
  }, [])

  // ── Handle API response ───────────────────────────────────────────────────
  const handleResponse = useCallback(
    (data: VoiceFillResponse, currentTier: VoiceFormTier) => {
      collectedFieldsRef.current = data.collectedFields ?? collectedFieldsRef.current
      conversationHistoryRef.current = data.conversationHistory ?? conversationHistoryRef.current

      setMissingFields(data.missingFields ?? [])
      setTier(currentTier)

      if (data.newFields && Object.keys(data.newFields).length > 0) {
        onFields(data.newFields)
      }

      if (data.complete) {
        setFollowUpQuestion('')
        setStatus('done')
        setTimeout(() => onComplete?.(), 600)
      } else {
        setTurn((t) => t + 1)
        speakAndListen(data.followUpQuestion)
      }
    },
    [onFields, onComplete, speakAndListen],
  )

  // ── API call via transcript ───────────────────────────────────────────────
  const parseViaTranscript = useCallback(
    async (text: string) => {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: text,
          collectedFields: collectedFieldsRef.current,
          conversationHistory: conversationHistoryRef.current,
        }),
      })
      const data: VoiceFillResponse = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI broker error.')
      handleResponse(data, 'webspeech')
    },
    [apiEndpoint, handleResponse],
  )

  // ── API call via audio blob ───────────────────────────────────────────────
  const parseViaAudio = useCallback(
    async (blob: Blob) => {
      const arrayBuffer = await blob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64,
          mimeType: blob.type || 'audio/webm',
          collectedFields: collectedFieldsRef.current,
          conversationHistory: conversationHistoryRef.current,
        }),
      })
      const data: VoiceFillResponse = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI audio error.')
      if (data.transcript) setTranscript(data.transcript)
      handleResponse(data, 'ai-fallback')
    },
    [apiEndpoint, handleResponse],
  )

  // ── Audio recording helpers ───────────────────────────────────────────────
  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
    } catch { /* best-effort */ }
  }, [])

  const stopAudioRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') { resolve(null); return }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        recorder.stream.getTracks().forEach((t) => t.stop())
        resolve(blob)
      }
      recorder.stop()
    })
  }, [])

  // ── Core: one listening turn ──────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSupported) {
      setStatus('unsupported')
      onError?.('Speech recognition is not supported in this browser. Use Chrome or Edge.')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => { setStatus('listening'); startAudioRecording() }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = async (event: any) => {
      const result = event.results[0][0]
      const text: string = result.transcript
      const conf: number = result.confidence ?? 1
      setTranscript(text)
      setConfidence(conf)
      setStatus('processing')
      const audioBlob = await stopAudioRecording()
      try {
        if (conf >= confidenceThreshold) {
          await parseViaTranscript(text)
        } else if (audioBlob && audioBlob.size > 0) {
          await parseViaAudio(audioBlob)
        } else {
          await parseViaTranscript(text)
        }
      } catch (err) {
        setStatus('error')
        onError?.(err instanceof Error ? err.message : 'Could not process voice input.')
      }
    }

    recognition.onerror = async () => {
      const audioBlob = await stopAudioRecording()
      if (audioBlob && audioBlob.size > 0) {
        setStatus('processing')
        try {
          await parseViaAudio(audioBlob)
        } catch (err) {
          setStatus('error')
          onError?.(err instanceof Error ? err.message : 'Microphone error. Check permissions.')
        }
      } else {
        setStatus('error')
        onError?.('Microphone error. Check permissions and try again.')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [
    isSupported, confidenceThreshold, onError,
    startAudioRecording, stopAudioRecording,
    parseViaTranscript, parseViaAudio,
  ])

  // Update the ref so speakAndListen always calls the latest startListening
  startListeningRef.current = startListening

  // ── Public API ────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    setTurn(0)
    setFollowUpQuestion('')
    setMissingFields([])
    collectedFieldsRef.current = {}
    conversationHistoryRef.current = []

    // Pre-populate missing fields from schema for first-turn UI
    const required = fields.filter((f) => f.required).map((f) => f.key)
    setMissingFields(required)

    startListening()
  }, [fields, startListening])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    recognitionRef.current?.stop()
    stopAudioRecording()
    setStatus('idle')
  }, [stopAudioRecording])

  const reset = useCallback(() => {
    window.speechSynthesis?.cancel()
    recognitionRef.current?.stop()
    stopAudioRecording()
    collectedFieldsRef.current = {}
    conversationHistoryRef.current = []
    setTranscript('')
    setConfidence(null)
    setTier(null)
    setFollowUpQuestion('')
    setMissingFields([])
    setTurn(0)
    setStatus('idle')
  }, [stopAudioRecording])

  return {
    status,
    transcript,
    confidence,
    tier,
    followUpQuestion,
    missingFields,
    turn,
    isSupported,
    start,
    stop,
    reset,
  }
}
