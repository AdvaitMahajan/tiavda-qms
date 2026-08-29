// @vitest-environment node
//
// Renders the real QuotationPDF component to a file so the layout can be eyeballed
// (and so a broken PDF tree fails CI rather than reaching a client). Writes to
// PDF_OUT when set, otherwise skips writing and just asserts it renders.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import fs from "node:fs";
import QuotationPDF from "@/components/QuotationPDF";
import type { CompanyInfo } from "@/lib/templateRegistry";

const COMPANY: CompanyInfo = {
  name: "Global Geotechnics",
  gstNumber: "27AABCG1234H1Z5",
  panNumber: "AABCG1234H",
  address: "Office No. 12, Pride Icon, Kharadi, Pune 411014",
  email: "info@globalgeotechnics.in",
  phone: "+918291917570",
  state: "Maharashtra",
  bankAccountName: "", bankName: "", bankAccountNumber: "",
  bankAccountType: "Current", bankBranch: "", bankIfsc: "",
};

const LINE_ITEMS = [
  { section: "A", description: "Mobilisation & demobilisation of drilling equipment", unit: "LS", qty: 1, rate: 25000, amount: 25000 },
  { section: "A", description: "Boring in soil up to 15 m depth", unit: "m", qty: 45, rate: 850, amount: 38250 },
  { section: "A", description: "Standard Penetration Test (SPT) at 1.5 m intervals", unit: "nos", qty: 30, rate: 600, amount: 18000 },
  { section: "A", description: "Rock coring with NX size double tube core barrel", unit: "m", qty: 12, rate: 2200, amount: 26400, hidden: true },
  { section: "B", description: "Grain size analysis (sieve + hydrometer)", unit: "nos", qty: 6, rate: 1200, amount: 7200 },
  { section: "B", description: "Triaxial shear test (UU)", unit: "nos", qty: 3, rate: 3500, amount: 10500 },
  { section: "B", description: "Chemical analysis of soil and water", unit: "nos", qty: 2, rate: 2800, amount: 5600, hidden: true },
  { section: "C", description: "Site supervision by qualified geologist", unit: "days", qty: 5, rate: 2500, amount: 12500 },
  { section: "D", description: "Geotechnical investigation report with recommendations", unit: "LS", qty: 1, rate: 15000, amount: 15000 },
];

const TERMS = [
  "This quotation is valid for 30 days from the date of issue.",
  "Rates quoted are exclusive of GST, which will be charged at the prevailing rate.",
  "Water and electricity required for the work shall be provided free of cost at site by the client.",
  "Any boreholes executed beyond the quoted scope will be charged at the same unit rates.",
  "Mobilisation charges are applicable per mobilisation; repeat mobilisation due to site unavailability will be charged separately.",
  "Clearing of site, levelling and providing access to borehole locations is in the client's scope.",
  "Payment terms: 50% advance along with the work order, balance on submission of the final report.",
];

describe("QuotationPDF", () => {
  it("renders a complete quotation without throwing", async () => {
    const element = createElement(QuotationPDF, {
      quotation: {
        variant_label: "Standard", subtotal: 116450, gst_amount: 20961, gst_rate: 18,
        gst_type: "cgst_sgst", total_amount: 137411, mobilisation_cost: 81250,
        drilling_cost: 0, reporting_cost: 15000, line_items: LINE_ITEMS,
        num_bores: 3, depth_per_bore_m: 15, version: 1,
        discount_type: null, discount_value: null, discount_amount: null,
        quotation_number: "GGQ-2026-00001",
      },
      client: {
        name: "Siddhi Kulkarni", company: "Shreeji Developers Pvt. Ltd.",
        phone: "+919876543210", email: "siddhi@shreejidevelopers.in", city: "Pune",
      },
      enquiry: { ref_number: "GG-2026-0001" },
      companyInfo: COMPANY,
      validityDays: 30,
      terms: TERMS,
      paymentTerms: "50% advance with work order, balance on report submission",
      footerText: "Geotechnical Engineering Consultants",
      contactNumbers: ["8291917570", "8828827161"],
    });

    // QuotationPDF returns a <Document>, but its props type isn't DocumentProps,
    // which is what pdf() is declared to take.
    const buffer = await pdf(element as unknown as Parameters<typeof pdf>[0]).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of buffer as unknown as AsyncIterable<Buffer>) chunks.push(chunk);
    const out = Buffer.concat(chunks);

    expect(out.subarray(0, 5).toString()).toBe("%PDF-");
    expect(out.length).toBeGreaterThan(10_000);

    if (process.env.PDF_OUT) fs.writeFileSync(process.env.PDF_OUT, out);
  }, 60_000);
});
