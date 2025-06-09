import * as React from 'react';     // bundle React
// expose it globally so every module in the IIFE can see it
;(window as any).React = React;

import { createRoot } from 'react-dom/client';
// ❶  Import the page as-is ─ if the UI lives in `app/page.tsx`:
import Page from '../src/app/page';      // adjust path if needed

class GroundmountsWidget extends HTMLElement {
  connectedCallback() {
    const mount = document.createElement('div');
    this.attachShadow({ mode: 'open' }).appendChild(mount);

    // ❷  Render your page inside Shadow DOM (no style leakage)
    createRoot(mount).render(<Page />);
  }
}

customElements.define('groundmounts-app', GroundmountsWidget);
