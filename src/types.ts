export type FieldType = 'string' | 'number' | 'enum'

export type FieldSchema = {
  /** Form field key — must match your form's field name exactly */
  key: string
  /** Human-readable label shown in the "still needed" chips */
  label: string
  /** Data type — drives AI prompt and value coercion */
  type: FieldType
  /** Whether this field must be collected before onComplete fires */
  required?: boolean
  /** For type:'enum' — the exact accepted values */
  enumValues?: string[]
  /** Extra hint for the AI prompt e.g. "e.g. Dual 13.8 kV utility feeds" */
  description?: string
  /** For type:'number' minimum value */
  min?: number
  /** For type:'number' maximum value */
  max?: number
}

export type VoiceFormStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'done'
  | 'error'
  | 'unsupported'

export type VoiceFormTier = 'webspeech' | 'ai-fallback' | null

export type VoiceFillResponse = {
  newFields: Record<string, unknown>
  collectedFields: Record<string, unknown>
  missingFields: string[]
  followUpQuestion: string
  complete: boolean
  conversationHistory: ConversationMessage[]
  tier: VoiceFormTier
  transcript?: string
  error?: string
}

export type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AIProvider = 'gemini' | 'openai' | 'anthropic'

export type AICompletionOptions = {
  model?: string
  maxTokens?: number
  system?: string
}

export type AICompletionResult = {
  text: string
  provider: string
  model: string
}

export type AudioParseResult = {
  fieldsJson: string
  transcript: string
  provider: string
  model: string
}
