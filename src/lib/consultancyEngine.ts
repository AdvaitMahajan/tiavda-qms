export type ConsultancyLineItem = {
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
};

export const DEFAULT_CONSULTANCY_ITEMS: ConsultancyLineItem[] = [
  { description: "Structural Analysis & Drawing Assessment", unit: "LS", qty: 1, rate: 0, amount: 0 },
  { description: "Soil Investigation Supervision", unit: "LS", qty: 1, rate: 0, amount: 0 },
  { description: "Foundation Design & Recommendation", unit: "LS", qty: 1, rate: 0, amount: 0 },
  { description: "Report Preparation & Submission", unit: "LS", qty: 1, rate: 0, amount: 0 },
  { description: "Travel & Miscellaneous", unit: "LS", qty: 1, rate: 0, amount: 0 },
];


function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeConsultancyTotals(
  items: ConsultancyLineItem[],
  gstRate: number,
): { subtotal: number; gstAmount: number; total: number } {
  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const gstAmount = round2(subtotal * (gstRate / 100));
  const total = round2(subtotal + gstAmount);
  return { subtotal, gstAmount, total };
}

export function buildLumpSumItems(
  description: string,
  amount: number,
): ConsultancyLineItem[] {
  return [{ description, unit: "LS", qty: 1, rate: amount, amount }];
}
