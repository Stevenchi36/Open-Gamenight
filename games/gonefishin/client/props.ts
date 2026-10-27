import type { PlayViewProps } from '@ogn/core/client'
import type { ClientAction, GoneFishinSettings, GoneFishinView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<GoneFishinView, ClientAction, GoneFishinSettings>
