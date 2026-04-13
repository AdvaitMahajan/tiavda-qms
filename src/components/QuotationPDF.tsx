import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

const navy = "#0F2A47";
const gold = "#D4930A";
const muted = "#64748B";
const borderColor = "#CBD5E1";
const altRow = "#F8FAFC";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1E293B" },
  center: { textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },
  line: { borderBottomWidth: 1, borderBottomColor: borderColor, marginVertical: 10 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center", marginBottom: 2 },
  subtitle: { fontSize: 10, color: muted, textAlign: "center", marginBottom: 4 },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center", marginTop: 8, marginBottom: 6 },
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  col: { width: "48%" },
  label: { fontSize: 8, color: muted, marginBottom: 2 },
  value: { fontSize: 10, marginBottom: 3 },
  thRow: { flexDirection: "row", backgroundColor: navy, padding: 6 },
  thText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9 },
  tdRow: { flexDirection: "row", padding: 6, borderBottomWidth: 0.5, borderBottomColor: borderColor },
  tdText: { fontSize: 9 },
  rightAlign: { textAlign: "right" },
  totalsBlock: { alignItems: "flex-end", marginTop: 8 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", width: 220, marginBottom: 3 },
  totalsLabel: { fontSize: 10, width: 120 },
  totalsValue: { fontSize: 10, width: 100, textAlign: "right", fontFamily: "Helvetica-Bold" },
  grandTotal: { fontSize: 13, fontFamily: "Helvetica-Bold", color: navy },
  terms: { marginTop: 14 },
  termTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  termLine: { fontSize: 9, color: muted, marginBottom: 2 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40 },
  footerLine: { borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 8 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 9 },
  footerCenter: { textAlign: "center", fontSize: 8, color: muted, marginTop: 6 },
});

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtDate = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type LineItem = { description: string; unit: string; qty: number; rate: number; amount: number };

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
  };
  client: { name: string; company: string | null; phone: string; email: string | null; city: string };
  enquiry: { ref_number: string };
}

const colW = ["30%", "12%", "13%", "20%", "25%"] as const;

export default function QuotationPDF({ quotation, client, enquiry }: Props) {
  const items: LineItem[] = typeof quotation.line_items === "string"
    ? JSON.parse(quotation.line_items)
    : quotation.line_items;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>TIAVDA ENTERPRISES</Text>
        <Text style={s.subtitle}>Geotechnical Consultants | Pune, Maharashtra</Text>
        <View style={s.line} />
        <Text style={s.docTitle}>GEOTECHNICAL INVESTIGATION QUOTATION</Text>

        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={[s.label, s.bold]}>Bill To:</Text>
            <Text style={[s.value, s.bold]}>{client.name}</Text>
            {client.company && <Text style={s.value}>{client.company}</Text>}
            <Text style={s.value}>{client.phone}</Text>
            {client.email && <Text style={s.value}>{client.email}</Text>}
            <Text style={s.value}>{client.city}</Text>
          </View>
          <View style={s.col}>
            <Text style={s.value}><Text style={s.bold}>Quotation Ref: </Text>{enquiry.ref_number}</Text>
            <Text style={s.value}><Text style={s.bold}>Date: </Text>{fmtDate()}</Text>
            <Text style={s.value}><Text style={s.bold}>Variant: </Text>{quotation.variant_label}</Text>
            <Text style={s.value}><Text style={s.bold}>Validity: </Text>30 days from date of issue</Text>
          </View>
        </View>

        <View style={s.line} />

        {/* Table header */}
        <View style={s.thRow}>
          <Text style={[s.thText, { width: colW[0] }]}>Description</Text>
          <Text style={[s.thText, { width: colW[1] }]}>Unit</Text>
          <Text style={[s.thText, { width: colW[2], textAlign: "right" }]}>Qty</Text>
          <Text style={[s.thText, { width: colW[3], textAlign: "right" }]}>Rate</Text>
          <Text style={[s.thText, { width: colW[4], textAlign: "right" }]}>Amount</Text>
        </View>
        {items.map((item, i) => (
          <View key={i} style={[s.tdRow, i % 2 === 1 ? { backgroundColor: altRow } : {}]}>
            <Text style={[s.tdText, { width: colW[0] }, item.description.startsWith("GST") ? { fontStyle: "italic" } : {}]}>{item.description}</Text>
            <Text style={[s.tdText, { width: colW[1] }]}>{item.unit}</Text>
            <Text style={[s.tdText, { width: colW[2], textAlign: "right" }]}>{item.qty}</Text>
            <Text style={[s.tdText, { width: colW[3], textAlign: "right" }]}>{inr(item.rate)}</Text>
            <Text style={[s.tdText, { width: colW[4], textAlign: "right" }]}>{inr(item.amount)}</Text>
          </View>
        ))}

        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal:</Text>
            <Text style={s.totalsValue}>{inr(quotation.subtotal)}</Text>
          </View>
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
              <Text style={s.totalsLabel}>GST @ {quotation.gst_rate ?? 18}%:</Text>
              <Text style={s.totalsValue}>{inr(quotation.gst_amount)}</Text>
            </View>
          )}
          <View style={[s.line, { width: 220 }]} />
          <View style={s.totalsRow}>
            <Text style={[s.totalsLabel, s.grandTotal]}>TOTAL AMOUNT:</Text>
            <Text style={[s.totalsValue, s.grandTotal]}>{inr(quotation.total_amount)}</Text>
          </View>
        </View>

        <View style={s.terms}>
          <Text style={s.termTitle}>Terms &amp; Conditions:</Text>
          <Text style={s.termLine}>1. This quotation is valid for 30 days from the date of issue.</Text>
          <Text style={s.termLine}>2. Advance payment of 50% required before mobilisation.</Text>
          <Text style={s.termLine}>3. Work subject to site accessibility and ground conditions.</Text>
          <Text style={s.termLine}>4. GST as applicable.</Text>
        </View>

        <View style={s.footer}>
          <View style={s.footerLine}>
            <View style={s.footerRow}>
              <Text>Authorized Signatory</Text>
              <Text style={s.bold}>Tiavda Enterprises</Text>
            </View>
            <Text style={s.footerCenter}>This is a computer-generated quotation.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}