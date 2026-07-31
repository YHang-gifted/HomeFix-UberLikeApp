import { type ComponentType } from 'react';

import type { LiveMapProps } from '../../app/src/features/tracking/liveMap';

// Web platform stub for ./liveMap. Metro resolves this file (not liveMap.tsx) when bundling for
// web, so the web bundle NEVER evaluates `react-native-maps` — a native-only module that throws on
// web at import (`codegenNativeComponent is not a function`) and would blank the whole page. The
// live map is a native feature; on web the customer keeps the static map thumbnail, so this stub
// simply reports "unavailable" and renders nothing. Keep the exported shape identical to
// liveMap.tsx. See `docs/live-tracking.md`.
export type LiveMapView = ComponentType<LiveMapProps>;

export const liveMapAvailable: boolean = false;

export const deviceLiveMap: LiveMapView = () => null;
