// shipping/table.js — CURRENT shipping table (effective 2026-09-01). Use these.
// Cost = base + perKg * ceil(weightKg). Weights above 20 kg are not shipped.
export const CURRENT_SHIPPING = {
  A: { base: 5, perKg: 1.2 },
  B: { base: 9, perKg: 2.0 },
};
