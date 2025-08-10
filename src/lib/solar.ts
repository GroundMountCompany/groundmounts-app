export const PANEL_WATTS = 400; // adjust if needed
export const CAP_FACTOR = 0.18; // average capacity factor; tweak per region
export const BILL_PER_KWH = 0.14; // $/kWh; tweak per utility/region

// Estimate monthly kWh from monthly bill
export function estimateMonthlyKWh(avgBillUSD: number, $perKWh = BILL_PER_KWH) {
  if (!avgBillUSD || $perKWh <= 0) return 0;
  return avgBillUSD / $perKWh;
}

// Convert desired monthly kWh offset -> DC kW (very simple model)
export function kWFromMonthlyKWh(targetMonthlyKWh: number, cap = CAP_FACTOR) {
  // kWh/month ≈ kW * 30 * 24 * cap
  if (!targetMonthlyKWh || cap <= 0) return 0;
  const kW = targetMonthlyKWh / (30 * 24 * cap);
  return Math.max(0, kW);
}

export function panelsFromkW(dcKW: number, panelW = PANEL_WATTS) {
  if (!dcKW) return 0;
  const w = dcKW * 1000;
  return Math.max(1, Math.ceil(w / panelW));
}

// Simple rows/cols layout for N panels aiming for ~square-ish footprint
export function layoutForPanels(n: number) {
  if (n <= 0) return { rows: 1, cols: 1 };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { rows, cols };
}