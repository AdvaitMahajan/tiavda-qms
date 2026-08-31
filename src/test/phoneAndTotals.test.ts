import { describe, it, expect } from "vitest";
import { normalizePhone, phoneKey, samePhone, validateIndianMobile } from "@/lib/phone";
import { computeTotals, computeTotalsWithDiscount, visibleItems } from "@/lib/quotationEngine";

describe("phone normalisation", () => {
  it("stores every accepted format as the same E.164 number", () => {
    for (const input of ["9876543210", "+91 98765 43210", "98765-43210", "+919876543210"]) {
      expect(normalizePhone(input)).toBe("+919876543210");
    }
  });

  it("treats the same line written differently as one number", () => {
    expect(samePhone("+91 98765 43210", "9876543210")).toBe(true);
    expect(samePhone("098765-43210", "+919876543210")).toBe(true);
    expect(samePhone("9876543210", "9123456780")).toBe(false);
  });

  it("refuses to match on too few digits, rather than matching everything", () => {
    expect(phoneKey("12345")).toBe("");
    expect(samePhone("12345", "12345")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });

  it("validates Indian mobiles with or without the country code", () => {
    expect(validateIndianMobile("9876543210")).toBe(true);
    expect(validateIndianMobile("+91 98765 43210")).toBe(true);
    expect(validateIndianMobile("1234567890")).toBe(false); // must start 6-9
    expect(validateIndianMobile("98765")).toBe(false);
  });
});

describe("suppressed line items", () => {
  const items = [
    { section: "A", description: "Boring", unit: "m", qty: 45, rate: 850, amount: 38250 },
    { section: "A", description: "Rock coring", unit: "m", qty: 12, rate: 2200, amount: 26400, hidden: true },
    { section: "B", description: "Sieve analysis", unit: "nos", qty: 6, rate: 1200, amount: 7200 },
  ];

  it("drops hidden rows from the visible set but keeps them on the record", () => {
    expect(visibleItems(items)).toHaveLength(2);
    expect(items).toHaveLength(3);
  });

  it("excludes hidden rows from the subtotal and section totals", () => {
    const t = computeTotals(items);
    expect(t.subtotal).toBe(45450); // 38250 + 7200, not 71850
    expect(t.sections.A).toBe(38250);
    expect(t.sections.B).toBe(7200);
  });

  it("keeps the stored subtotal equal to what the PDF's visible rows add up to", () => {
    // The PDF prints the stored subtotal but only the visible rows, so the two
    // must agree — counting a suppressed item would show a total no line explains.
    const printed = visibleItems(items).reduce((s, it) => s + it.amount, 0);
    expect(computeTotals(items).subtotal).toBe(printed);
  });

  it("excludes hidden rows from discount, GST and grand total", () => {
    const t = computeTotalsWithDiscount(items, { type: "percentage", value: 10 }, 18);
    expect(t.subtotal).toBe(45450);
    expect(t.discountAmount).toBe(4545);
    expect(t.netAmount).toBe(40905);
    expect(t.gstAmount).toBe(7362.9);
    expect(t.grandTotal).toBe(48267.9);
  });
});
