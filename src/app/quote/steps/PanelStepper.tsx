'use client';

import { UI } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';

/**
 * Add or remove a panel.
 *
 * Lifted out of the design step's body so it can be rendered in the sheet's
 * peek row instead: at peek the body is below the fold, and this control plus
 * the primary button are the only two things a customer needs to finish the
 * design. Rendered in exactly one place at a time — see FunnelShell.
 */
export default function PanelStepper() {
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelAdjust = useQuoteStore((s) => s.panelAdjust);
  const setPanelAdjust = useQuoteStore((s) => s.setPanelAdjust);

  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2">
      <span className="text-[17px] font-medium text-neutral-900">{UI.panels}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="panel-minus"
          aria-label={UI.removePanel}
          onClick={() => setPanelAdjust(panelAdjust - 1)}
          disabled={totalPanels <= 1}
          className="h-12 w-12 rounded-xl border border-neutral-300 text-[22px] font-semibold disabled:opacity-40"
        >
          &minus;
        </button>
        <span
          data-testid="panel-count"
          className="min-w-[3ch] text-center text-[19px] font-semibold"
        >
          {totalPanels}
        </span>
        <button
          type="button"
          data-testid="panel-plus"
          aria-label={UI.addPanel}
          onClick={() => setPanelAdjust(panelAdjust + 1)}
          className="h-12 w-12 rounded-xl border border-neutral-300 text-[22px] font-semibold"
        >
          +
        </button>
      </div>
    </div>
  );
}
