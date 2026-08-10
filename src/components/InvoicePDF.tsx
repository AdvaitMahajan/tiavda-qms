import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfLetterhead } from "@/components/pdf/PdfLetterhead";
import type { CompanyInfo } from "@/lib/templateRegistry";

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

  headerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: navy,
  },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: navy },
  companyTag: { fontSize: 8, color: muted, marginTop: 2 },
  invoiceTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: gold },

  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  col: { width: "48%" },

  label: { fontSize: 8, color: muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10, marginBottom: 3 },

  line: { borderBottomWidth: 1, borderBottomColor: borderColor, marginVertical: 10 },

  thRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: borderColor, backgroundColor: navy },
  thText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9 },

  tdRow: { flexDirection: "row", padding: 6, borderBottomWidth: 0.5, borderBottomColor: borderColor },
  tdText: { fontSize: 9 },

  totalsBlock: { alignItems: "flex-end", marginTop: 14 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", width: 240, marginBottom: 3 },
  totalsLabel: { fontSize: 10, width: 130 },
  totalsValue: { fontSize: 10, width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalsDivider: { borderBottomWidth: 1, borderBottomColor: borderColor, width: 240, marginVertical: 4 },

  grandTotalBox: { flexDirection: "row", justifyContent: "flex-end", width: 240, marginTop: 4, padding: 6, backgroundColor: sectionBg, borderRadius: 3 },
  grandTotalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, width: 130 },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, width: 110, textAlign: "right" },

  bankBlock: { marginTop: 16, padding: 10, backgroundColor: sectionBg, borderRadius: 3 },
  bankTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: navy, marginBottom: 6 },
  bankLine: { fontSize: 9, marginBottom: 2 },

  termsBlock: { marginTop: 14 },
  termsTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4, color: navy },
  termsLine: { fontSize: 8, color: muted, marginBottom: 2 },

  sigBlock: { marginTop: 40, width: 200, alignSelf: "flex-end" },
  sigLine: { borderBottomWidth: 1, borderBottomColor: "#1E293B", width: 180, marginBottom: 6 },
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

const fmtDate = (d?: string) => {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

interface PaymentRow {
  description: string;
  amount: number;
}

interface Props {
  invoiceNumber: string;
  invoiceDate?: string;
  refNumber: string;
  client: {
    name: string;
    company: string | null;
    phone: string;
    email: string | null;
    city: string;
    gst_number?: string | null;
  };
  payments: PaymentRow[];
  subtotal: number;
  gstRate: number;
  gstType: "igst" | "cgst_sgst";
  gstAmount: number;
  totalAmount: number;
  bankDetails?: {
    account_name?: string;
    bank_name?: string;
    branch?: string;
    account_number?: string;
    account_type?: string;
    ifsc?: string;
    upi?: string;
  } | null;
  terms?: string[];
  companyGst?: string;
  companyInfo?: CompanyInfo | null;
}

const DEFAULT_INVOICE_TERMS = [
  "This is a computer-generated invoice and does not require a physical signature.",
  "Payment is due within 7 days from the date of this invoice.",
  "Please include the invoice number as reference in your payment transaction.",
  "For any queries regarding this invoice, please contact accounts@company.com.",
];

export default function InvoicePDF({
  invoiceNumber,
  invoiceDate,
  refNumber,
  client,
  payments,
  subtotal,
  gstRate,
  gstType,
  gstAmount,
  totalAmount,
  bankDetails,
  terms,
  companyGst,
  companyInfo,
}: Props) {
  const notesList = terms && terms.length > 0 ? terms : DEFAULT_INVOICE_TERMS;
  const colW = ["8%", "62%", "30%"] as const;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header: company letterhead + invoice title */}
        <PdfLetterhead company={companyInfo} />
        <View style={s.headerBand}>
          <View />
          <Text style={s.invoiceTitle}>TAX INVOICE</Text>
        </View>

        {/* Two-column: Bill To + Invoice Details */}
        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.label}>Bill To</Text>
            <Text style={[s.value, s.bold]}>{client.name}</Text>
            {client.company && <Text style={s.value}>{client.company}</Text>}
            <Text style={s.value}>{client.phone}</Text>
            {client.email && <Text style={s.value}>{client.email}</Text>}
            <Text style={s.value}>{client.city}</Text>
            {client.gst_number && (
              <Text style={[s.value, { marginTop: 4 }]}>
                <Text style={s.bold}>GSTIN: </Text>{client.gst_number}
              </Text>
            )}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Invoice Details</Text>
            <Text style={s.value}><Text style={s.bold}>Invoice No: </Text>{invoiceNumber}</Text>
            <Text style={s.value}><Text style={s.bold}>Date: </Text>{fmtDate(invoiceDate)}</Text>
            <Text style={s.value}><Text style={s.bold}>Enquiry Ref: </Text>{refNumber}</Text>
          </View>
        </View>

        <View style={s.line} />

        {/* Payment items table */}
        <View style={s.thRow}>
          <Text style={[s.thText, { width: colW[0], textAlign: "center" }]}>Sr</Text>
          <Text style={[s.thText, { width: colW[1] }]}>Description</Text>
          <Text style={[s.thText, { width: colW[2], textAlign: "right" }]}>Amount</Text>
        </View>
        {payments.map((p, i) => (
          <View key={i} style={[s.tdRow, i % 2 === 1 ? { backgroundColor: altRow } : {}]}>
            <Text style={[s.tdText, { width: colW[0], textAlign: "center" }]}>{i + 1}</Text>
            <Text style={[s.tdText, { width: colW[1] }]}>{p.description}</Text>
            <Text style={[s.tdText, { width: colW[2], textAlign: "right" }]}>{inr(p.amount)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal:</Text>
            <Text style={s.totalsValue}>{inr(subtotal)}</Text>
          </View>
          {gstType === "cgst_sgst" ? (
            <>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>CGST @ {gstRate / 2}%:</Text>
                <Text style={s.totalsValue}>{inr(gstAmount / 2)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>SGST @ {gstRate / 2}%:</Text>
                <Text style={s.totalsValue}>{inr(gstAmount / 2)}</Text>
              </View>
            </>
          ) : (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>IGST @ {gstRate}%:</Text>
              <Text style={s.totalsValue}>{inr(gstAmount)}</Text>
            </View>
          )}
          <View style={s.totalsDivider} />
          <View style={s.grandTotalBox}>
            <Text style={s.grandTotalLabel}>Total:</Text>
            <Text style={s.grandTotalValue}>{inr(totalAmount)}</Text>
          </View>
        </View>

        {/* Bank Details */}
        {bankDetails && (
          <View style={s.bankBlock}>
            <Text style={s.bankTitle}>Bank Details for Payment</Text>
            {bankDetails.account_name && <Text style={s.bankLine}><Text style={s.bold}>Account Name: </Text>{bankDetails.account_name}</Text>}
            {bankDetails.bank_name && (
              <Text style={s.bankLine}>
                <Text style={s.bold}>Bank: </Text>{bankDetails.bank_name}{bankDetails.branch ? `, ${bankDetails.branch}` : ""}
              </Text>
            )}
            {bankDetails.account_number && (
              <Text style={s.bankLine}>
                <Text style={s.bold}>Account No: </Text>{bankDetails.account_number}{bankDetails.account_type ? ` (${bankDetails.account_type})` : ""}
              </Text>
            )}
            {bankDetails.ifsc && <Text style={s.bankLine}><Text style={s.bold}>IFSC: </Text>{bankDetails.ifsc}</Text>}
            {bankDetails.upi && <Text style={s.bankLine}><Text style={s.bold}>UPI: </Text>{bankDetails.upi}</Text>}
          </View>
        )}

        {/* Terms */}
        <View style={s.termsBlock}>
          <Text style={s.termsTitle}>Terms & Conditions</Text>
          {notesList.map((note, i) => (
            <Text key={i} style={s.termsLine}>{i + 1}. {note}</Text>
          ))}
        </View>

        {/* Signatory */}
        <View style={s.sigBlock}>
          <View style={s.sigLine} />
          <Text style={s.sigLabel}>Authorized Signatory</Text>
          <Text style={s.sigCompany}>The Company</Text>
        </View>

        {/* Footer */}
        <View style={s.pageFooter} fixed>
          <View style={s.footerRow}>
            <Text style={s.footerCompany}>The Company</Text>
            <Text style={s.footerPageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
          <Text style={s.footerCenter}>Geotechnical Investigation & Consultancy | +91 8605811117 | accounts@company.com</Text>
        </View>
      </Page>
    </Document>
  );
}
