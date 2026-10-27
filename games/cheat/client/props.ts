import type { PlayViewProps } from '@ogn/core/client'
import type { CheatSettings, CheatView, ClientAction } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<CheatView, ClientAction, CheatSettings>
