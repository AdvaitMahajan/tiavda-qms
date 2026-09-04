import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "@/components/pdf/pdfSetup";
import { PdfLetterhead } from "@/components/pdf/PdfLetterhead";
import type { CompanyInfo } from "@/lib/templateRegistry";
import { visibleItems } from "@/lib/quotationEngine";
import { PdfOfficeFooter } from "@/components/pdf/PdfOfficeFooter";

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

  thRow: { flexDirection: "row", padding: 5, borderBottomWidth: 1, borderBottomColor: borderColor },
  thText: { color: "#1E293B", fontFamily: "Helvetica-Bold", fontSize: 8 },

  tdRow: { flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: borderColor },
  tdText: { fontSize: 9 },

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
  noteTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6, color: navy, textTransform: "uppercase", letterSpacing: 0.5 },
  termRow: { flexDirection: "row", marginBottom: 3 },
  termNum: { fontSize: 8, color: muted, width: 16 },
  termText: { fontSize: 8, color: muted, flex: 1, lineHeight: 1.4 },

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

type LineItem = { description: string; unit: string; qty: number; rate: number; amount: number; hidden?: boolean };

interface Props {
  quotation: {
    variant_label: string | null;
    subtotal: number;
    gst_amount: number;
    gst_rate: number | null;
    gst_type: string | null;
    total_amount: number;
    line_items: any;
    version: number;
    is_lump_sum?: boolean;
    discount_type?: string | null;
    discount_value?: number | null;
    discount_amount?: number | null;
    quotation_number?: string | null;
  };
  client: { name: string; company: string | null; phone: string; email: string | null; city: string };
  enquiry: { ref_number: string };
  companyInfo?: CompanyInfo | null;
  projectScope?: string;
  validityDays?: number;
  terms?: string[];
  paymentTerms?: string;
  footerText?: string;
  /** Office contact numbers printed under the address at the foot. */
  contactNumbers?: string[];
}

const colW = ["8%", "38%", "12%", "10%", "16%", "16%"] as const;

export default function ConsultancyPDF({
  quotation, client, enquiry, companyInfo, projectScope,
  validityDays = 30, terms, paymentTerms, footerText, contactNumbers,
}: Props) {
  // Items marked out of scope are suppressed from the client-facing document.
  const items: LineItem[] = visibleItems(
    typeof quotation.line_items === "string"
      ? JSON.parse(quotation.line_items)
      : quotation.line_items,
  );

  const notesList = terms && terms.length > 0 ? terms : [];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfLetterhead company={companyInfo} variant="banner" />
        <Text style={s.docTitle}>CONSULTANCY SERVICES QUOTATION</Text>

        <View style={s.twoCol}>
          <View style={s.col}>
            {/* Company/organisation leads, then the contact person, as asked. */}
            <Text style={[s.value, s.bold]}>{client.company || client.name}</Text>
            {client.company && client.name ? <Text style={s.value}>{client.name}</Text> : null}
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
            <Text style={s.value}><Text style={s.bold}>Version: </Text>V{quotation.version}</Text>
            <Text style={s.value}><Text style={s.bold}>Validity: </Text>{validityDays} days from date of issue</Text>
          </View>
        </View>

        {projectScope && (
          <View style={{ marginBottom: 6 }}>
            <Text style={s.label}>Project Scope</Text>
            <Text style={s.value}>{projectScope}</Text>
          </View>
        )}

        <View style={s.line} />

        {/* Table header */}
        <View style={s.thRow}>
          <Text style={[s.thText, { width: colW[0], textAlign: "center" }]}>Sr</Text>
          <Text style={[s.thText, { width: colW[1] }]}>Description</Text>
          <Text style={[s.thText, { width: colW[2] }]}>Unit</Text>
          <Text style={[s.thText, { width: colW[3], textAlign: "right" }]}>Qty</Text>
          <Text style={[s.thText, { width: colW[4], textAlign: "right" }]}>Rate</Text>
          <Text style={[s.thText, { width: colW[5], textAlign: "right" }]}>Amount</Text>
        </View>

        {/* Table rows */}
        {items.map((item, i) => (
          <View key={i} style={[s.tdRow, i % 2 === 1 ? { backgroundColor: altRow } : {}]}>
            <Text style={[s.tdText, { width: colW[0], textAlign: "center" }]}>{i + 1}</Text>
            <Text style={[s.tdText, { width: colW[1] }]}>{item.description}</Text>
            <Text style={[s.tdText, { width: colW[2] }]}>{item.unit}</Text>
            <Text style={[s.tdText, { width: colW[3], textAlign: "right" }]}>{item.qty}</Text>
            <Text style={[s.tdText, { width: colW[4], textAlign: "right" }]}>{inr(item.rate)}</Text>
            <Text style={[s.tdText, { width: colW[5], textAlign: "right" }]}>{inr(item.amount)}</Text>
          </View>
        ))}

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
                <Text style={s.totalsLabel}>CGST @ {(quotation.gst_rate ?? 0) / 2}%:</Text>
                <Text style={s.totalsValue}>{inr(quotation.gst_amount / 2)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>SGST @ {(quotation.gst_rate ?? 0) / 2}%:</Text>
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

        {/* Payment terms — only when set; otherwise an unconfigured setting
            prints a bare grey "Payment Terms:" bar with nothing after it. */}
        {paymentTerms?.trim() ? (
          <View style={s.paymentBlock}>
            <Text style={s.paymentText}>Payment Terms: {paymentTerms.trim()}</Text>
          </View>
        ) : null}

        {/* Signatory — in document flow after the totals */}
        <View style={s.signatoryBlock} wrap={false}>
          <View style={s.sigLine} />
          <Text style={s.sigLabel}>Authorized Signatory</Text>
          <Text style={s.sigCompany}>{companyInfo?.name || "The Company"}</Text>
        </View>

        {/* Office address and contact numbers */}
        <PdfOfficeFooter company={companyInfo} contactNumbers={contactNumbers} />

        {/* Notes — below the office address; wrap={false} carries the whole
            block to the next page rather than splitting it. */}
        {notesList.length > 0 && (
          <View style={s.notes} wrap={false}>
            <Text style={s.noteTitle}>Notes</Text>
            {notesList.map((t, i) => (
              <View key={i} style={s.termRow}>
                <Text style={s.termNum}>{i + 1}.</Text>
                <Text style={s.termText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Fixed footer — repeats on every page */}
        <View style={s.pageFooter} fixed>
          <View style={s.footerRow}>
            <Text style={s.footerCompany}>{companyInfo?.name || "The Company"}</Text>
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
