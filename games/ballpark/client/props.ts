import type { PlayViewProps } from '@wsfg/core/client'
import type { BallparkSettings, BallparkView, ClientAction } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<BallparkView, ClientAction, BallparkSettings>
