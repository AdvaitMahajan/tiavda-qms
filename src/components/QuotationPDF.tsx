import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { SECTION_LABELS } from "@/lib/quotationEngine";

const navy = "#0F2A47";
const gold = "#D4930A";
const muted = "#64748B";
const borderColor = "#CBD5E1";
const altRow = "#F8FAFC";
const sectionBg = "#EDF2F7";

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 58,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1E293B",
  },
  bold: { fontFamily: "Helvetica-Bold" },

  subtitle: {
    fontSize: 10,
    color: muted,
    textAlign: "center",
    marginBottom: 6,
  },
  headerLine: { borderBottomWidth: 2, borderBottomColor: navy, marginBottom: 8 },

  docTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: navy,
    textAlign: "center",
    marginBottom: 14,
  },

  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingLeft: 30 },
  col: { width: "46%" },

  billToBox: {
    padding: 10,
  },
  label: { fontSize: 8, color: muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10, marginBottom: 3 },

  detailRow: { flexDirection: "row", marginBottom: 5 },
  detailLabel: { fontSize: 9, color: muted, width: 78 },
  detailValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  line: { borderBottomWidth: 1, borderBottomColor: borderColor, marginVertical: 8 },

  sectionHeader: {
    flexDirection: "row",
    backgroundColor: navy,
    padding: 6,
    marginTop: 10,
  },
  sectionHeaderText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 10 },

  thRow: { flexDirection: "row", padding: 5, borderBottomWidth: 1, borderBottomColor: borderColor },
  thText: { color: "#1E293B", fontFamily: "Helvetica-Bold", fontSize: 8 },

  tdRow: { flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: borderColor },
  tdText: { fontSize: 9 },

  sectionTotalRow: {
    flexDirection: "row",
    padding: 5,
    backgroundColor: sectionBg,
    borderBottomWidth: 1,
    borderBottomColor: borderColor,
  },
  sectionTotalText: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  totalsBlock: { alignItems: "flex-end", marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", width: 240, marginBottom: 3 },
  totalsLabel: { fontSize: 10, width: 130 },
  totalsValue: { fontSize: 10, width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalsDivider: { borderBottomWidth: 1, borderBottomColor: borderColor, width: 240, marginVertical: 4 },

  grandTotalBox: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 240,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, width: 130 },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, width: 110, textAlign: "right" },

  paymentBlock: { marginTop: 10, padding: 8, backgroundColor: sectionBg, borderRadius: 3 },
  paymentText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center" },

  notes: { marginTop: 12 },
  noteTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4, color: navy },
  noteLine: { fontSize: 8, color: muted, marginBottom: 2 },

  signatoryBlock: {
    marginTop: 50,
    width: 200,
    alignSelf: "flex-end",
  },
  sigLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    width: 180,
    marginBottom: 6,
  },
  sigLabel: { fontSize: 9, color: muted, width: 180 },
  sigCompany: { fontSize: 10, fontFamily: "Helvetica-Bold", color: navy, width: 180, marginTop: 2 },

  pageFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingBottom: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: borderColor,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerCompany: { fontSize: 8, fontFamily: "Helvetica-Bold", color: navy },
  footerPageNum: { fontSize: 8, color: muted },
  footerCenter: { textAlign: "center", fontSize: 7, color: muted, marginTop: 3 },
});

const inr = (n: number) =>
  "Rs. " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

const fmtDate = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type LineItem = { section?: string; description: string; unit: string; qty: number; rate: number; amount: number };

interface Props {
  quotation: {
    variant_label: string | null;
    subtotal: number;
    gst_amount: number;
    gst_rate: number | null;
    gst_type: string | null;
    total_amount: number;
    mobilisation_cost: number;
    drilling_cost: number;
    reporting_cost: number;
    line_items: any;
    num_bores: number;
    depth_per_bore_m: number;
    version: number;
    discount_type?: string | null;
    discount_value?: number | null;
    discount_amount?: number | null;
    quotation_number?: string | null;
  };
  client: { name: string; company: string | null; phone: string; email: string | null; city: string };
  enquiry: { ref_number: string };
  validityDays?: number;
  terms?: string[];
  paymentTerms?: string;
  footerText?: string;
}

const colW = ["6%", "30%", "12%", "12%", "18%", "22%"] as const;

export default function QuotationPDF({ quotation, client, enquiry, validityDays = 30, terms, paymentTerms, footerText }: Props) {
  const items: LineItem[] = typeof quotation.line_items === "string"
    ? JSON.parse(quotation.line_items)
    : quotation.line_items;

  const hasSections = items.some((it) => it.section);

  const sections = hasSections
    ? ["A", "B", "C", "D"].filter((sec) => items.some((it) => it.section === sec))
    : [];

  const notesList = terms && terms.length > 0 ? terms : [];

  let srNo = 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.docTitle}>GEOTECHNICAL INVESTIGATION QUOTATION</Text>

        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.label}>Bill To</Text>
            <Text style={[s.value, s.bold]}>{client.name}</Text>
            {client.company && <Text style={s.value}>{client.company}</Text>}
            <Text style={s.value}>{client.phone}</Text>
            {client.email && <Text style={s.value}>{client.email}</Text>}
            <Text style={s.value}>{client.city}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Quotation Details</Text>
            {quotation.quotation_number && (
              <Text style={s.value}><Text style={s.bold}>Quotation No: </Text>{quotation.quotation_number}</Text>
            )}
            <Text style={s.value}><Text style={s.bold}>Ref: </Text>{enquiry.ref_number}</Text>
            <Text style={s.value}><Text style={s.bold}>Date: </Text>{fmtDate()}</Text>
            <Text style={s.value}><Text style={s.bold}>Variant: </Text>{quotation.variant_label} (V{quotation.version})</Text>
            <Text style={s.value}><Text style={s.bold}>Validity: </Text>{validityDays} days from date of issue</Text>
          </View>
        </View>

        <View style={s.line} />

        {hasSections ? (
          <>
            {sections.map((sec) => {
              const sectionItems = items.filter((it) => it.section === sec);
              const sectionTotal = sectionItems.reduce((sum, it) => sum + it.amount, 0);
              return (
                <View key={sec} wrap={false}>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionHeaderText}>
                      {sec}. {(SECTION_LABELS[sec] ?? sec).toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.thRow}>
                    <Text style={[s.thText, { width: colW[0], textAlign: "center" }]}>Sr</Text>
                    <Text style={[s.thText, { width: colW[1] }]}>Description</Text>
                    <Text style={[s.thText, { width: colW[2] }]}>Unit</Text>
                    <Text style={[s.thText, { width: colW[3], textAlign: "right" }]}>Qty</Text>
                    <Text style={[s.thText, { width: colW[4], textAlign: "right" }]}>Rate</Text>
                    <Text style={[s.thText, { width: colW[5], textAlign: "right" }]}>Amount</Text>
                  </View>
                  {sectionItems.map((item, i) => {
                    srNo++;
                    return (
                      <View key={i} style={[s.tdRow, i % 2 === 1 ? { backgroundColor: altRow } : {}]}>
                        <Text style={[s.tdText, { width: colW[0], textAlign: "center" }]}>{srNo}</Text>
                        <Text style={[s.tdText, { width: colW[1] }]}>{item.description}</Text>
                        <Text style={[s.tdText, { width: colW[2] }]}>{item.unit}</Text>
                        <Text style={[s.tdText, { width: colW[3], textAlign: "right" }]}>{item.qty}</Text>
                        <Text style={[s.tdText, { width: colW[4], textAlign: "right" }]}>{inr(item.rate)}</Text>
                        <Text style={[s.tdText, { width: colW[5], textAlign: "right" }]}>{inr(item.amount)}</Text>
                      </View>
                    );
                  })}
                  <View style={s.sectionTotalRow}>
                    <Text style={[s.sectionTotalText, { width: "78%", textAlign: "right", paddingRight: 8 }]}>
                      Section {sec} Total:
                    </Text>
                    <Text style={[s.sectionTotalText, { width: "22%", textAlign: "right" }]}>
                      {inr(sectionTotal)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <View style={s.thRow}>
              <Text style={[s.thText, { width: "35%" }]}>Description</Text>
              <Text style={[s.thText, { width: "12%" }]}>Unit</Text>
              <Text style={[s.thText, { width: "13%", textAlign: "right" }]}>Qty</Text>
              <Text style={[s.thText, { width: "18%", textAlign: "right" }]}>Rate</Text>
              <Text style={[s.thText, { width: "22%", textAlign: "right" }]}>Amount</Text>
            </View>
            {items.map((item, i) => (
              <View key={i} style={[s.tdRow, i % 2 === 1 ? { backgroundColor: altRow } : {}]}>
                <Text style={[s.tdText, { width: "35%" }]}>{item.description}</Text>
                <Text style={[s.tdText, { width: "12%" }]}>{item.unit}</Text>
                <Text style={[s.tdText, { width: "13%", textAlign: "right" }]}>{item.qty}</Text>
                <Text style={[s.tdText, { width: "18%", textAlign: "right" }]}>{inr(item.rate)}</Text>
                <Text style={[s.tdText, { width: "22%", textAlign: "right" }]}>{inr(item.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Totals */}
        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal:</Text>
            <Text style={s.totalsValue}>{inr(quotation.subtotal)}</Text>
          </View>
          {quotation.discount_amount != null && quotation.discount_amount > 0 && (
            <>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>
                  Discount{quotation.discount_type === "percentage" ? ` (${quotation.discount_value}%)` : " (Flat)"}:
                </Text>
                <Text style={s.totalsValue}>- {inr(quotation.discount_amount)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Net Amount:</Text>
                <Text style={s.totalsValue}>{inr(quotation.subtotal - (quotation.discount_amount ?? 0))}</Text>
              </View>
            </>
          )}
          {quotation.gst_type === "cgst_sgst" ? (
            <>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>CGST @ 9%:</Text>
                <Text style={s.totalsValue}>{inr(quotation.gst_amount / 2)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>SGST @ 9%:</Text>
                <Text style={s.totalsValue}>{inr(quotation.gst_amount / 2)}</Text>
              </View>
            </>
          ) : (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>GST @ {quotation.gst_rate ?? 0}%:</Text>
              <Text style={s.totalsValue}>{inr(quotation.gst_amount)}</Text>
            </View>
          )}
          <View style={s.totalsDivider} />
          <View style={s.grandTotalBox}>
            <Text style={s.grandTotalLabel}>TOTAL AMOUNT:</Text>
            <Text style={s.grandTotalValue}>{inr(quotation.total_amount)}</Text>
          </View>
        </View>

        {/* Payment terms */}
        <View style={s.paymentBlock}>
          <Text style={s.paymentText}>
            Payment Terms: {paymentTerms ?? ""}
          </Text>
        </View>

        {/* Notes */}
        <View style={s.notes}>
          <Text style={s.noteTitle}>Notes:</Text>
          {notesList.map((t, i) => (
            <Text key={i} style={s.noteLine}>{i + 1}. {t}</Text>
          ))}
        </View>

        {/* Signatory — in document flow after notes */}
        <View style={s.signatoryBlock} wrap={false}>
          <View style={s.sigLine} />
          <Text style={s.sigLabel}>Authorized Signatory</Text>
          <Text style={s.sigCompany}>The Company</Text>
        </View>

        {/* Fixed footer — repeats on every page */}
        <View style={s.pageFooter} fixed>
          <View style={s.footerRow}>
            <Text style={s.footerCompany}>The Company</Text>
            <Text
              style={s.footerPageNum}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
          </View>
          {footerText && <Text style={s.footerCenter}>{footerText}</Text>}
        </View>
      </Page>
    </Document>
  );
}
