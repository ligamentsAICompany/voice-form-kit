/**
 * AI Broker — provider-agnostic layer.
 * Set ACTIVE_PROVIDER to switch between Gemini, OpenAI, or Anthropic.
 *
 * Required env vars per provider:
 *   gemini    → GEMINI_API_KEY
 *   openai    → OPENAI_API_KEY
 *   anthropic → ANTHROPIC_API_KEY
 */

import type { AIProvider, AICompletionOptions, AICompletionResult, AudioParseResult } from '../types'

export const ACTIVE_PROVIDER: AIProvider = (process.env.VOICE_FORM_PROVIDER as AIProvider) ?? 'gemini'

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(
  messages: { role: 'user' | 'assistant'; content: string }[],
  options: AICompletionOptions,
): Promise<AICompletionResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = options.model ?? 'claude-sonnet-4-6'
  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 1024,
    system: options.system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })
  const block = response.content[0]
  const text = block.type === 'text' ? block.text : ''
  return { text, provider: 'anthropic', model }
}

// ── Gemini ───────────────────────────────────────────────────────────────────

async function callGemini(
  messages: { role: 'user' | 'assistant'; content: string }[],
  options: AICompletionOptions,
): Promise<AICompletionResult> {
  const { GoogleGenAI } = await import('@google/genai')
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const model = options.model ?? 'gemini-2.5-flash'
  const contents = [
    ...(options.system
      ? [
          { role: 'user' as const, parts: [{ text: `[System]: ${options.system}` }] },
          { role: 'model' as const, parts: [{ text: 'Understood.' }] },
        ]
      : []),
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
  ]
  const response = await client.models.generateContent({ model, contents })
  const text = response.text ?? ''
  return { text, provider: 'gemini', model }
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(
  messages: { role: 'user' | 'assistant'; content: string }[],
  options: AICompletionOptions,
): Promise<AICompletionResult> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = options.model ?? 'gpt-4o-mini'
  const response = await client.chat.completions.create({
    model,
    max_tokens: options.maxTokens ?? 1024,
    messages: [
      ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  })
  const text = response.choices[0]?.message?.content ?? ''
  return { text, provider: 'openai', model }
}

// ── Gemini audio (multimodal inline) ─────────────────────────────────────────

export async function parseFieldsFromAudioGemini(
  audioBase64: string,
  mimeType: string,
  systemPrompt: string,
): Promise<AudioParseResult> {
  const { GoogleGenAI } = await import('@google/genai')
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const model = 'gemini-2.5-flash'
  const prompt = `${systemPrompt}\n\nTranscribe the audio then extract fields.\nReturn JSON: {"_transcript":"<words>","field1":"...","field2":...}`
  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: prompt },
        ],
      },
    ],
  })
  const raw = (response.text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)
  const { _transcript: transcript = '', ...fields } = parsed
  return { fieldsJson: JSON.stringify(fields), transcript, provider: 'gemini', model }
}

// ── OpenAI audio (Whisper STT + GPT parse) ────────────────────────────────────

export async function parseFieldsFromAudioOpenAI(
  audioBase64: string,
  mimeType: string,
  systemPrompt: string,
): Promise<AudioParseResult> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const audioBuffer = Buffer.from(audioBase64, 'base64')
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
  const audioFile = new File([audioBuffer], `audio.${ext}`, { type: mimeType })
  const transcription = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file: audioFile,
    language: 'en',
  })
  const transcript = transcription.text
  const parseResponse = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `User said: "${transcript}"` },
    ],
  })
  const fieldsJson = parseResponse.choices[0]?.message?.content ?? '{}'
  return { fieldsJson, transcript, provider: 'openai', model: 'whisper-1 + gpt-4o-mini' }
}

// ── Public ───────────────────────────────────────────────────────────────────

export async function aiComplete(
  messages: { role: 'user' | 'assistant'; content: string }[],
  options: AICompletionOptions = {},
): Promise<AICompletionResult> {
  switch (ACTIVE_PROVIDER) {
    case 'anthropic': return callAnthropic(messages, options)
    case 'gemini':    return callGemini(messages, options)
    case 'openai':    return callOpenAI(messages, options)
    default: throw new Error(`Unknown AI provider: ${ACTIVE_PROVIDER}`)
  }
}

export async function parseFieldsFromAudio(
  audioBase64: string,
  mimeType: string,
  systemPrompt: string,
): Promise<AudioParseResult> {
  switch (ACTIVE_PROVIDER) {
    case 'gemini': return parseFieldsFromAudioGemini(audioBase64, mimeType, systemPrompt)
    case 'openai': return parseFieldsFromAudioOpenAI(audioBase64, mimeType, systemPrompt)
    default:       return parseFieldsFromAudioGemini(audioBase64, mimeType, systemPrompt)
  }
}
