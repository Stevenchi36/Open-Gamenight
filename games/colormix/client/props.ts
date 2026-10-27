import type { PlayViewProps } from '@ogn/core/client'
import type { ClientAction, ColorMixSettings, ColorMixView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<ColorMixView, ClientAction, ColorMixSettings>
