# Integrating voice-form-kit in a New App

Step-by-step guide to add conversational voice fill to any React / Next.js form.

---

## Prerequisites

- Next.js 14+ (App Router)
- React 18+
- Tailwind CSS (for VoiceButton styles)
- At least one AI API key: `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`

---

## 1. Install the package

```bash
pnpm add github:ligamentsAICompany/voice-form-kit
```

Add to `next.config.ts` so Next.js transpiles the package:

```ts
const nextConfig: NextConfig = {
  transpilePackages: ['voice-form-kit'],
}
```

---

## 2. Set environment variables

Create `.env.local` at the **project root** (Next.js won't load from `src/`):

```bash
# Use whichever provider you prefer — only one is required
GEMINI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# Optional: override provider (default is 'gemini')
# VOICE_FORM_PROVIDER=openai
```

**Provider → model mapping:**

| `VOICE_FORM_PROVIDER` | Text model | Audio fallback |
|---|---|---|
| `gemini` (default) | `gemini-2.5-flash` | Gemini multimodal |
| `openai` | `gpt-4o-mini` | Whisper + GPT |
| `anthropic` | `claude-sonnet-4-6` | — (text only) |

---

## 3. Define your form fields

Create a `FieldSchema[]` describing every field the user can speak.

```ts
import type { FieldSchema } from 'voice-form-kit'

export const myFormFields: FieldSchema[] = [
  {
    key: 'name',          // must match your form field name exactly
    label: 'Name',        // shown in the "still needed" chips
    type: 'string',
    required: true,
  },
  {
    key: 'amount',
    label: 'Amount',
    type: 'number',
    required: true,
    min: 1,
    max: 1000000,
  },
  {
    key: 'status',
    label: 'Status',
    type: 'enum',
    required: true,
    enumValues: ['active', 'inactive', 'pending'],  // exact values the AI will map to
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'string',
    required: false,
    description: 'any additional context',           // hint for the AI prompt
  },
]
```

**Field types:**

| `type` | Use for | Extra props |
|--------|---------|------------|
| `string` | Text, names, descriptions | `description` (AI hint) |
| `number` | Numeric values | `min`, `max` |
| `enum` | Fixed-choice fields | `enumValues: string[]` |

---

## 4. Create the API route

Create `src/app/api/voice-fill/route.ts`:

```ts
import { createVoiceFillRoute } from 'voice-form-kit/server'
import { myFormFields } from '@/lib/my-form-fields'  // your FieldSchema[]

export const POST = createVoiceFillRoute(myFormFields)
```

If you have **multiple forms** in the same app, create a separate route for each:

```
src/app/api/voice-fill/route.ts         → main form
src/app/api/voice-fill-orders/route.ts  → orders form
src/app/api/voice-fill-profile/route.ts → profile form
```

Each route uses `createVoiceFillRoute(itsOwnFields)`.

---

## 5. Wire the hook into your form

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useVoiceForm, VoiceButton } from 'voice-form-kit'
import { myFormFields } from '@/lib/my-form-fields'
import { mySchema, type MyFormValues } from '@/schemas/my-schema'

export function MyForm() {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<MyFormValues>({
    resolver: zodResolver(mySchema),
  })

  // ── Step 1: handle incoming fields from voice ──────────────────────────
  const handleVoiceFields = useCallback(
    (fields: Record<string, unknown>) => {
      // Only set keys that belong to this form
      const allowed = myFormFields.map((f) => f.key)
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setValue(key as keyof MyFormValues, fields[key] as any, { shouldValidate: true })
        }
      }
    },
    [setValue],
  )

  // ── Step 2: handle completion — auto-submit when all required fields filled
  const handleVoiceComplete = useCallback(() => {
    handleSubmit((values) => {
      // your submit logic
      console.log('submitted', values)
    })()
  }, [handleSubmit])

  // ── Step 3: initialise the hook ─────────────────────────────────────────
  const voice = useVoiceForm({
    fields: myFormFields,
    apiEndpoint: '/api/voice-fill',   // matches your route
    onFields: handleVoiceFields,
    onComplete: handleVoiceComplete,  // omit if you don't want auto-submit
    onError: (msg) => toast.error(msg),
  })

  // ── Step 4: popup open/close state ──────────────────────────────────────
  const [voiceOpen, setVoiceOpen] = useState(false)

  const handleVoiceTrigger = useCallback(() => {
    if (!voiceOpen) setVoiceOpen(true)
    voice.status === 'listening' ? voice.stop() : voice.start()
  }, [voiceOpen, voice])

  const handleVoiceClose = useCallback(() => {
    voice.reset()
    setVoiceOpen(false)
  }, [voice])

  return (
    <form onSubmit={handleSubmit(/* your handler */)}>
      {/* ── Step 5: place VoiceButton in your form header ─────────────── */}
      <div className="flex items-center justify-between">
        <h2>My Form</h2>
        <VoiceButton
          status={voiceOpen ? voice.status : 'idle'}
          transcript={voice.transcript}
          confidence={voice.confidence}
          tier={voice.tier}
          followUpQuestion={voice.followUpQuestion}
          missingFields={voice.missingFields}
          fieldLabels={Object.fromEntries(myFormFields.map((f) => [f.key, f.label]))}
          turn={voice.turn}
          onStart={handleVoiceTrigger}
          onStop={voice.stop}
          onClose={handleVoiceClose}
        />
      </div>

      {/* your form fields below */}
    </form>
  )
}
```

---

## 6. VoiceButton props reference

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `status` | `VoiceFormStatus` | ✅ | Use `voiceOpen ? voice.status : 'idle'` |
| `transcript` | `string` | ✅ | `voice.transcript` |
| `confidence` | `number \| null` | ✅ | `voice.confidence` |
| `tier` | `VoiceFormTier` | ✅ | `voice.tier` |
| `followUpQuestion` | `string` | ✅ | `voice.followUpQuestion` |
| `missingFields` | `string[]` | ✅ | `voice.missingFields` |
| `fieldLabels` | `Record<string, string>` | — | Maps field key → display label for chips |
| `turn` | `number` | ✅ | `voice.turn` |
| `onStart` | `() => void` | ✅ | Your trigger handler |
| `onStop` | `() => void` | ✅ | `voice.stop` |
| `onClose` | `() => void` | ✅ | Your close handler |
| `buttonLabel` | `string` | — | Button text. Default: `'Voice fill'` |

---

## 7. useVoiceForm options reference

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `fields` | `FieldSchema[]` | ✅ | — | Your form field definitions |
| `apiEndpoint` | `string` | — | `'/api/voice-fill'` | Route created in step 4 |
| `onFields` | `(fields) => void` | ✅ | — | Called per turn — call `setValue` here |
| `onComplete` | `() => void` | — | — | Called when all required fields done |
| `onError` | `(msg) => void` | — | — | Called on mic/AI errors |
| `confidenceThreshold` | `number` | — | `0.3` | Below this, audio fallback is used |

---

## How the conversational loop works

```
User speaks
    │
    ▼
Web Speech API → transcript + confidence score
    │
    ├─ confidence ≥ 0.3 ──▶ transcript → AI → extract fields
    │
    └─ confidence < 0.3 ──▶ audio blob → AI (multimodal) → transcribe + extract
                 OR speech error
    │
    ▼
AI returns { newFields, missingFields, followUpQuestion, complete }
    │
    ├─ complete: false ──▶ SpeechSynthesis speaks followUpQuestion
    │                       → auto-restarts listening (next turn)
    │
    └─ complete: true  ──▶ onComplete() called → form auto-submits
```

**Browser support:**

| Browser | Web Speech | Audio fallback |
|---------|-----------|----------------|
| Chrome / Edge | ✅ | ✅ |
| Firefox / Safari | ❌ | ✅ (records + sends to AI) |

---

## Updating the package

```bash
# Pull latest from the org repo
pnpm update voice-form-kit

# Or pin to a specific release tag
pnpm add github:ligamentsAICompany/voice-form-kit#v1.1.0
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `No AI API key configured` | Check `.env.local` is at project root, not inside `src/` |
| `model … is no longer available` | Update model name in `VOICE_FORM_PROVIDER` or open `ai-broker.ts` in the kit |
| `Microphone error` | Browser needs `https://` or `localhost` for mic access |
| Fields not filling | Make sure `key` in `FieldSchema` exactly matches your form field name |
| Popup clips off screen | `VoiceButton` uses `right-0` positioning — ensure parent has `position: relative` |
