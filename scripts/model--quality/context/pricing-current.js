// pricing/rules.js — CURRENT pricing rules (effective 2026-09-01). Use these.
export const CURRENT_PRICING = {
  minSubtotal: 100,   // discount applies only from this subtotal
  percent: 0.15,      // 15% of the subtotal
  cap: 30,            // never more than 30
  vipBonusPercent: 0.05, // VIP customers get 5 more percentage points, before the cap
};
