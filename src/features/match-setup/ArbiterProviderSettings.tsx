import { getRegisteredArbiter } from '@/arbiter/registry'
import type { ArbiterSideConfig } from '@/arbiter/types'
import { AiProviderSettings } from '@/shared/ai-providers/ui/AiProviderSettings'
import { reatomMemo } from '@/shared/ui/reatomMemo'

export const ArbiterProviderSettings = reatomMemo(({
  value,
  onChange,
  errors,
}: {
  value: ArbiterSideConfig
  onChange: (next: ArbiterSideConfig) => void
  errors: Record<string, Array<string>>
}) => {
  const descriptor = getRegisteredArbiter(value.arbiterKey)

  return (
    <AiProviderSettings
      actorKey={value.arbiterKey}
      value={{
        apiKey: '',
        model: value.arbiterConfig.model,
      }}
      onChange={(next) =>
        onChange({
          arbiterKey: value.arbiterKey,
          arbiterConfig: {
            model: next.model,
          },
        } as ArbiterSideConfig)
      }
      errors={errors}
      modelOptions={descriptor.modelOptions}
    />
  )
}, 'ArbiterProviderSettings')
