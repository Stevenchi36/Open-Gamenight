import type { PlayViewProps } from '@wsfg/core/client'
import type { ClientAction, FlockSettings, FlockView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<FlockView, ClientAction, FlockSettings>
