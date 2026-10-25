import type { PlayViewProps } from '@wsfg/core/client'
import type { ClientAction, InOrderSettings, InOrderView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<InOrderView, ClientAction, InOrderSettings>
