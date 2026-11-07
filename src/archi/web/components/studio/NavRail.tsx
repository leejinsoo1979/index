'use client';

import { StudioRail } from './StudioRail';

/**
 * Agent Studio navigation. Every studio screen renders <NavRail />; it is now the shared 60px icon
 * rail (same frame as the INDEX wiki) instead of the old 176px labelled menu with the Pro-plan card.
 */
export function NavRail() {
  return <StudioRail />;
}
