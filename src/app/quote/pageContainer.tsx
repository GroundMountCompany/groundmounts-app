'use client';

import { JSX } from 'react';
import FunnelShell from './FunnelShell';

/**
 * The funnel is one full-viewport shell now: map plus a bottom sheet on a
 * phone, map plus a side panel on a desktop. The old per-step page layouts,
 * with their own sticky buttons and scrolling sections, are gone.
 */
export const PageContainer = (): JSX.Element => <FunnelShell />;

export default PageContainer;
