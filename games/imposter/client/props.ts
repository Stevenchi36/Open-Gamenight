import type { PlayViewProps } from '@ogn/core/client'
import type { ClientAction, ImposterSettings, ImposterView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<ImposterView, ClientAction, ImposterSettings>
