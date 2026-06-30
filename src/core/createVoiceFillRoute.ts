import { aiComplete, parseFieldsFromAudio } from './ai-broker'
import type { FieldSchema, ConversationMessage, VoiceFillResponse } from '../types'

function buildSystemPrompt(fields: FieldSchema[]): string {
  const fieldDefs = fields
    .map((f) => {
      let def = `- ${f.key}: ${f.label} (${f.type}`
      if (f.type === 'enum' && f.enumValues) def += `, one of exactly: ${f.enumValues.map((v) => `"${v}"`).join(', ')}`
      if (f.type === 'number') {
        if (f.min !== undefined && f.max !== undefined) def += `, ${f.min}–${f.max}`
        else if (f.min !== undefined) def += `, min ${f.min}`
        else if (f.max !== undefined) def += `, max ${f.max}`
      }
      if (f.description) def += `, e.g. ${f.description}`
      def += `${f.required ? ', required' : ', optional'})`
      return def
    })
    .join('\n')

  return `You are a conversational voice assistant that fills a form by extracting data from natural speech.

Fields:
${fieldDefs}

Rules:
- Extract only fields you are confident about from the user's speech.
- Do not invent values not mentioned.
- For enum fields, map the user's words to the closest valid value.
- For number fields, extract the numeric value only (no units).
- Return ONLY valid JSON, no markdown, no explanation.
- Response format exactly:
{
  "newFields": { ...only fields extracted from this turn... },
  "followUpQuestion": "Natural friendly question asking for the specific missing required fields only"
}`
}

function getMissingFields(fields: FieldSchema[], collected: Record<string, unknown>): string[] {
  return fields
    .filter((f) => f.required)
    .filter((f) => collected[f.key] === undefined || collected[f.key] === null || collected[f.key] === '')
    .map((f) => f.key)
}

function buildFallbackQuestion(fields: FieldSchema[], missingKeys: string[]): string {
  const labels = missingKeys.map((k) => fields.find((f) => f.key === k)?.label ?? k)
  if (labels.length === 1) return `Got it! Just one more — what is the ${labels[0]}?`
  const last = labels.pop()
  return `Almost there! I still need the ${labels.join(', ')}, and ${last}.`
}

function parseJSON(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

/**
 * Factory — returns a Next.js App Router POST handler for any form schema.
 *
 * Usage in app/api/voice-fill/route.ts:
 *   import { createVoiceFillRoute } from 'voice-form-kit/server'
 *   export const POST = createVoiceFillRoute(myFields)
 */
export function createVoiceFillRoute(fields: FieldSchema[]) {
  const SYSTEM_PROMPT = buildSystemPrompt(fields)

  return async function POST(req: Request): Promise<Response> {
    const hasKey = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY
    if (!hasKey) {
      return Response.json(
        { error: 'No AI API key configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.' },
        { status: 503 },
      )
    }

    try {
      const body = await req.json()
      const collectedFields: Record<string, unknown> = body.collectedFields ?? {}
      const conversationHistory: ConversationMessage[] = body.conversationHistory ?? []

      let rawAIText = ''
      let transcriptFromAudio: string | undefined

      if (body.transcript) {
        const messages = [
          ...conversationHistory,
          {
            role: 'user' as const,
            content: `Already collected: ${JSON.stringify(collectedFields)}\nUser now said: "${body.transcript}"`,
          },
        ]
        const result = await aiComplete(messages, { system: SYSTEM_PROMPT, maxTokens: 512 })
        rawAIText = result.text
      } else if (body.audio && body.mimeType) {
        const audioSystemPrompt = `${SYSTEM_PROMPT}\n\nAlready collected: ${JSON.stringify(collectedFields)}`
        const result = await parseFieldsFromAudio(body.audio, body.mimeType, audioSystemPrompt)
        rawAIText = result.fieldsJson
        transcriptFromAudio = result.transcript
      } else {
        return Response.json({ error: 'Provide either transcript or audio.' }, { status: 400 })
      }

      // Parse AI response
      let parsed: Record<string, unknown>
      try {
        parsed = parseJSON(rawAIText)
      } catch {
        parsed = { newFields: parseJSON(rawAIText) }
      }

      const newFields = (parsed.newFields ?? parsed) as Record<string, unknown>
      const merged = { ...collectedFields, ...newFields }
      const missingFields = getMissingFields(fields, merged)
      const complete = missingFields.length === 0
      const followUpQuestion = complete
        ? ''
        : typeof parsed.followUpQuestion === 'string' && parsed.followUpQuestion.length > 0
          ? parsed.followUpQuestion
          : buildFallbackQuestion(fields, missingFields)

      const updatedHistory: ConversationMessage[] = [
        ...conversationHistory,
        ...(body.transcript ? [{ role: 'user' as const, content: body.transcript }] : []),
        ...(transcriptFromAudio ? [{ role: 'user' as const, content: transcriptFromAudio }] : []),
        {
          role: 'assistant' as const,
          content: JSON.stringify({ newFields, followUpQuestion, complete }),
        },
      ]

      const response: VoiceFillResponse = {
        newFields,
        collectedFields: merged,
        missingFields,
        followUpQuestion,
        complete,
        conversationHistory: updatedHistory,
        tier: body.transcript ? 'webspeech' : 'ai-fallback',
        ...(transcriptFromAudio ? { transcript: transcriptFromAudio } : {}),
      }

      return Response.json(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('[voice-fill]', message)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
