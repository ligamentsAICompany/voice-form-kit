// Client-side
export { useVoiceForm } from './hooks/useVoiceForm'
export { VoiceButton } from './components/VoiceButton'

// Types
export type {
  FieldSchema,
  FieldType,
  VoiceFormStatus,
  VoiceFormTier,
  VoiceFillResponse,
  AIProvider,
} from './types'
export type { UseVoiceFormConfig } from './hooks/useVoiceForm'
export type { VoiceButtonProps } from './components/VoiceButton'

// Server-side (ai-broker + route factory exported from /server path in package.json)
// Import via: import { createVoiceFillRoute } from 'voice-form-kit/server'
