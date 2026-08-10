import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PdfLetterhead } from "@/components/pdf/PdfLetterhead";
import type { TemplateDefinition, CompanyInfo, ProjectHeader } from "@/lib/templateRegistry";

const navy = "#0F2A47";
const gold = "#D4930A";
const muted = "#64748B";
const borderColor = "#CBD5E1";
const altRow = "#F8FAFC";
const sectionBg = "#EDF2F7";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 58, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1E293B" },
  bold: { fontFamily: "Helvetica-Bold" },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center", marginBottom: 4 },
  scopeLine: { fontSize: 10, color: muted, textAlign: "center", marginBottom: 14 },
  twoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingLeft: 30 },
  col: { width: "46%" },
  label: { fontSize: 8, color: muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10, marginBottom: 3 },
  line: { borderBottomWidth: 1, borderBottomColor: borderColor, marginVertical: 8 },

  projectHeaderBlock: { marginBottom: 12 },
  phRow: { flexDirection: "row", marginBottom: 4 },
  phLabel: { fontSize: 9, color: muted, width: 70 },
  phValue: { fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 },

  sectionHeader: { flexDirection: "row", backgroundColor: navy, padding: 6, marginTop: 10 },
  sectionHeaderText: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 10 },
  subsectionHeader: { flexDirection: "row", backgroundColor: "#E2E8F0", padding: 4, paddingLeft: 12 },
  subsectionText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#334155" },

  thRow: { flexDirection: "row", padding: 5, borderBottomWidth: 1, borderBottomColor: borderColor },
  thText: { color: "#1E293B", fontFamily: "Helvetica-Bold", fontSize: 8 },
  tdRow: { flexDirection: "row", padding: 5, borderBottomWidth: 0.5, borderBottomColor: borderColor },
  tdText: { fontSize: 9 },
  qroBadge: { fontSize: 7, color: gold, fontFamily: "Helvetica-Bold" },

  sectionTotalRow: { flexDirection: "row", padding: 5, backgroundColor: sectionBg, borderBottomWidth: 1, borderBottomColor: borderColor },
  sectionTotalText: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  totalsBlock: { alignItems: "flex-end", marginTop: 12 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", width: 240, marginBottom: 3 },
  totalsLabel: { fontSize: 10, width: 130 },
  totalsValue: { fontSize: 10, width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalsDivider: { borderBottomWidth: 1, borderBottomColor: borderColor, width: 240, marginVertical: 4 },
  grandTotalBox: { flexDirection: "row", justifyContent: "flex-end", width: 240, marginTop: 4 },
  grandTotalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, width: 130 },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, width: 110, textAlign: "right" },

  paymentBlock: { marginTop: 10, padding: 8, backgroundColor: sectionBg, borderRadius: 3 },
  paymentTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: navy, marginBottom: 4 },
  paymentLine: { fontSize: 9, color: "#1E293B", marginBottom: 2 },

  notes: { marginTop: 12 },
  noteTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4, color: navy },
  noteLine: { fontSize: 8, color: muted, marginBottom: 2 },

  companyBlock: { marginTop: 16, borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 10 },
  companyName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: navy, marginBottom: 4 },
  companyRow: { flexDirection: "row", marginBottom: 2 },
  companyLabel: { fontSize: 8, color: muted, width: 90 },
  companyValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  signatoryBlock: { marginTop: 50, width: 200, alignSelf: "flex-end" },
  sigLine: { borderBottomWidth: 1, borderBottomColor: "#1E293B", width: 180, marginBottom: 6 },
  sigLabel: { fontSize: 9, color: muted, width: 180 },
  sigCompany: { fontSize: 10, fontFamily: "Helvetica-Bold", color: navy, width: 180, marginTop: 2 },

  pageFooter: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 40, paddingBottom: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: borderColor },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerCompany: { fontSize: 8, fontFamily: "Helvetica-Bold", color: navy },
  footerPageNum: { fontSize: 8, color: muted },
  footerCenter: { textAlign: "center", fontSize: 7, color: muted, marginTop: 3 },

  summaryPage: { paddingTop: 40, paddingBottom: 58, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica" },
  summaryTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center", marginBottom: 6 },
  summarySubtitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center", marginBottom: 20 },
  summaryRow: { flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: borderColor },
  summaryLabel: { fontSize: 10, flex: 1 },
  summaryValue: { fontSize: 10, fontFamily: "Helvetica-Bold", width: 140, textAlign: "right" },
  summaryTotalRow: { flexDirection: "row", padding: 8, backgroundColor: navy },
  summaryTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "white", flex: 1 },
  summaryTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "white", width: 140, textAlign: "right" },
});

const inr = (n: number) =>
  "Rs. " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

const fmtDate = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type LineItem = {
  section?: string;
  subsection?: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  remark?: string;
  is_qro?: boolean;
};

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
    discount_type?: string | null;
    discount_value?: number | null;
    discount_amount?: number | null;
    quotation_number?: string | null;
    template_type?: string;
  };
  client: { name: string; company: string | null; phone: string; email: string | null; city: string };
  enquiry: { ref_number: string };
  template: TemplateDefinition;
  companyInfo?: CompanyInfo;
  projectHeader?: ProjectHeader;
  validityDays?: number;
  terms?: string[];
  paymentTerms?: string;
  footerText?: string;
}

export default function BOQTemplatePDF({
  quotation,
  client,
  enquiry,
  template,
  companyInfo,
  projectHeader,
  validityDays = 30,
  terms,
  paymentTerms,
  footerText,
}: Props) {
  const items: LineItem[] =
    typeof quotation.line_items === "string"
      ? JSON.parse(quotation.line_items)
      : quotation.line_items;

  const layout = template.layout;
  const hasRemarks = layout.hasRemarks;

  const sections = [...new Set(items.filter((it) => it.section).map((it) => it.section!))];
  const sectionLabels: Record<string, string> = {};
  for (const sec of template.sections) {
    sectionLabels[sec.key] = sec.label;
  }

  const notesList = terms && terms.length > 0 ? terms : template.defaultNotes;
  const payTerms = paymentTerms || template.defaultPaymentTerms;

  const colW = hasRemarks
    ? (["5%", "28%", "9%", "9%", "14%", "17%", "18%"] as const)
    : (["6%", "30%", "12%", "12%", "18%", "22%"] as const);

  let srNo = 0;

  const renderDetailPage = () => (
    <Page size="A4" style={s.page}>
      <PdfLetterhead company={companyInfo} />
      <Text style={s.docTitle}>{layout.title}</Text>
      {layout.hasSummaryPage && (
        <Text style={s.scopeLine}>SCOPE: Bill of Quantities for Carrying Out Soil Investigation Works</Text>
      )}

      {layout.hasProjectHeader && projectHeader && (
        <View style={s.projectHeaderBlock}>
          <View style={s.phRow}><Text style={s.phLabel}>Project:</Text><Text style={s.phValue}>{projectHeader.project}</Text></View>
          <View style={s.phRow}><Text style={s.phLabel}>Client:</Text><Text style={s.phValue}>{projectHeader.client}</Text></View>
          <View style={s.phRow}><Text style={s.phLabel}>Title:</Text><Text style={s.phValue}>{projectHeader.title}</Text></View>
          <View style={s.phRow}><Text style={s.phLabel}>Revision:</Text><Text style={s.phValue}>{projectHeader.revision}</Text></View>
          <View style={s.phRow}><Text style={s.phLabel}>Date:</Text><Text style={s.phValue}>{projectHeader.date || fmtDate()}</Text></View>
        </View>
      )}

      {!layout.hasProjectHeader && (
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
      )}

      <View style={s.line} />

      {sections.map((sec) => {
        const sectionItems = items.filter((it) => it.section === sec);
        const sectionTotal = sectionItems.filter((it) => !it.is_qro).reduce((sum, it) => sum + it.amount, 0);
        const subsections = [...new Set(sectionItems.filter((it) => it.subsection).map((it) => it.subsection!))];
        const hasSubsections = subsections.length > 0;

        return (
          <View key={sec}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionHeaderText}>
                {sec}. {(sectionLabels[sec] ?? sec).toUpperCase()}
              </Text>
            </View>

            <View style={s.thRow}>
              <Text style={[s.thText, { width: colW[0], textAlign: "center" }]}>Sr</Text>
              <Text style={[s.thText, { width: colW[1] }]}>Description</Text>
              <Text style={[s.thText, { width: colW[2] }]}>Unit</Text>
              <Text style={[s.thText, { width: colW[3], textAlign: "right" }]}>Qty</Text>
              <Text style={[s.thText, { width: colW[4], textAlign: "right" }]}>Rate</Text>
              <Text style={[s.thText, { width: colW[5], textAlign: "right" }]}>Amount</Text>
              {hasRemarks && <Text style={[s.thText, { width: colW[6] }]}>Remark</Text>}
            </View>

            {hasSubsections
              ? subsections.map((sub) => {
                  const subItems = sectionItems.filter((it) => it.subsection === sub);
                  return (
                    <View key={sub}>
                      <View style={s.subsectionHeader}>
                        <Text style={s.subsectionText}>{sub}</Text>
                      </View>
                      {subItems.map((item, i) => {
                        srNo++;
                        return renderRow(item, i, srNo, colW, hasRemarks);
                      })}
                    </View>
                  );
                }).concat(
                  sectionItems.filter((it) => !it.subsection).map((item, i) => {
                    srNo++;
                    return renderRow(item, i, srNo, colW, hasRemarks);
                  }),
                )
              : sectionItems.map((item, i) => {
                  srNo++;
                  return renderRow(item, i, srNo, colW, hasRemarks);
                })}

            <View style={s.sectionTotalRow}>
              <Text style={[s.sectionTotalText, { width: hasRemarks ? "82%" : "78%", textAlign: "right", paddingRight: 8 }]}>
                Section {sec} Total:
              </Text>
              <Text style={[s.sectionTotalText, { width: hasRemarks ? "18%" : "22%", textAlign: "right" }]}>
                {inr(sectionTotal)}
              </Text>
            </View>
          </View>
        );
      })}

      {layout.taxDisplay !== "summary_sheet" && (
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
          {layout.taxDisplay === "split_cgst_sgst" ? (
            <>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>SGST @ {(quotation.gst_rate ?? 18) / 2}%:</Text>
                <Text style={s.totalsValue}>{inr(quotation.gst_amount / 2)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>CGST @ {(quotation.gst_rate ?? 18) / 2}%:</Text>
                <Text style={s.totalsValue}>{inr(quotation.gst_amount / 2)}</Text>
              </View>
            </>
          ) : (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>GST @ {quotation.gst_rate ?? 18}%:</Text>
              <Text style={s.totalsValue}>{inr(quotation.gst_amount)}</Text>
            </View>
          )}
          <View style={s.totalsDivider} />
          <View style={s.grandTotalBox}>
            <Text style={s.grandTotalLabel}>GRAND TOTAL:</Text>
            <Text style={s.grandTotalValue}>{inr(quotation.total_amount)}</Text>
          </View>
        </View>
      )}

      {layout.taxDisplay === "summary_sheet" && (
        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Total (Excl. GST):</Text>
            <Text style={s.totalsValue}>{inr(quotation.subtotal)}</Text>
          </View>
        </View>
      )}

      {notesList.length > 0 && (
        <View style={s.notes}>
          <Text style={s.noteTitle}>Notes:</Text>
          {notesList.map((t, i) => (
            <Text key={i} style={s.noteLine}>{i + 1}. {t}</Text>
          ))}
        </View>
      )}

      {layout.showPaymentTermsOnPdf && payTerms && (
        <View style={s.paymentBlock}>
          <Text style={s.paymentTitle}>Terms of Payment:</Text>
          {payTerms.split("|").map((term, i) => (
            <Text key={i} style={s.paymentLine}>
              {String.fromCharCode(97 + i)}) {term.trim()}
            </Text>
          ))}
        </View>
      )}

      {layout.hasCompanyInfo && companyInfo && companyInfo.name && (
        <View style={s.companyBlock}>
          <Text style={s.companyName}>For {companyInfo.name}</Text>
          {layout.showBankingOnPdf && (
            <View style={{ marginTop: 6 }}>
              <Text style={[s.noteTitle, { fontSize: 9 }]}>Banking Details:</Text>
              {companyInfo.bankAccountName && (
                <View style={s.companyRow}><Text style={s.companyLabel}>Acc. Name:</Text><Text style={s.companyValue}>{companyInfo.bankAccountName}</Text></View>
              )}
              {companyInfo.bankName && (
                <View style={s.companyRow}><Text style={s.companyLabel}>Bank Name:</Text><Text style={s.companyValue}>{companyInfo.bankName}</Text></View>
              )}
              {companyInfo.bankAccountNumber && (
                <View style={s.companyRow}><Text style={s.companyLabel}>A/C No.:</Text><Text style={s.companyValue}>{companyInfo.bankAccountNumber}</Text></View>
              )}
              {companyInfo.bankAccountType && (
                <View style={s.companyRow}><Text style={s.companyLabel}>Acc. Type:</Text><Text style={s.companyValue}>{companyInfo.bankAccountType}</Text></View>
              )}
              {companyInfo.bankBranch && (
                <View style={s.companyRow}><Text style={s.companyLabel}>Branch:</Text><Text style={s.companyValue}>{companyInfo.bankBranch}</Text></View>
              )}
              {companyInfo.bankIfsc && (
                <View style={s.companyRow}><Text style={s.companyLabel}>IFSC Code:</Text><Text style={s.companyValue}>{companyInfo.bankIfsc}</Text></View>
              )}
              {companyInfo.gstNumber && (
                <View style={s.companyRow}><Text style={s.companyLabel}>GST No.:</Text><Text style={s.companyValue}>{companyInfo.gstNumber}</Text></View>
              )}
              {companyInfo.panNumber && (
                <View style={s.companyRow}><Text style={s.companyLabel}>PAN No.:</Text><Text style={s.companyValue}>{companyInfo.panNumber}</Text></View>
              )}
            </View>
          )}
        </View>
      )}

      {!layout.hasCompanyInfo && (
        <View style={s.signatoryBlock} wrap={false}>
          <View style={s.sigLine} />
          <Text style={s.sigLabel}>Authorized Signatory</Text>
          <Text style={s.sigCompany}>{companyInfo?.name || "The Company"}</Text>
        </View>
      )}

      <View style={s.pageFooter} fixed>
        <View style={s.footerRow}>
          <Text style={s.footerCompany}>{companyInfo?.name || "The Company"}</Text>
          <Text style={s.footerPageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
        {footerText && <Text style={s.footerCenter}>{footerText}</Text>}
      </View>
    </Page>
  );

  const renderSummaryPage = () => {
    const netSubtotal = quotation.subtotal - (quotation.discount_amount ?? 0);
    return (
      <Page size="A4" style={s.summaryPage}>
        <Text style={s.summaryTitle}>{layout.title}</Text>
        <Text style={s.summarySubtitle}>SUMMARY</Text>

        <View style={s.thRow}>
          <Text style={[s.thText, { width: "8%" }]}>S.No</Text>
          <Text style={[s.thText, { flex: 1 }]}>Description of Works</Text>
          <Text style={[s.thText, { width: "30%", textAlign: "right" }]}>Total Amount in INR</Text>
        </View>

        {sections.map((sec, i) => {
          const sectionItems = items.filter((it) => it.section === sec && !it.is_qro);
          const sectionTotal = sectionItems.reduce((sum, it) => sum + it.amount, 0);
          return (
            <View key={sec} style={s.summaryRow}>
              <Text style={[s.tdText, { width: "8%" }]}>{toRoman(i + 1)}</Text>
              <Text style={[s.tdText, { flex: 1 }]}>{sectionLabels[sec] ?? sec}</Text>
              <Text style={[s.tdText, { width: "30%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{inr(sectionTotal)}</Text>
            </View>
          );
        })}

        <View style={s.summaryRow}>
          <Text style={[s.tdText, { width: "8%" }]} />
          <Text style={[s.tdText, { flex: 1, fontFamily: "Helvetica-Bold" }]}>Total Amount in Rs (Excl GST)</Text>
          <Text style={[s.tdText, { width: "30%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{inr(netSubtotal)}</Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={[s.tdText, { width: "8%" }]} />
          <Text style={[s.tdText, { flex: 1 }]}>GST @ {quotation.gst_rate ?? 18}%</Text>
          <Text style={[s.tdText, { width: "30%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{inr(quotation.gst_amount)}</Text>
        </View>

        <View style={s.summaryTotalRow}>
          <Text style={s.summaryTotalLabel}>Total Amount in Rs (Incl GST)</Text>
          <Text style={s.summaryTotalValue}>{inr(quotation.total_amount)}</Text>
        </View>

        <View style={s.pageFooter} fixed>
          <View style={s.footerRow}>
            <Text style={s.footerCompany}>{companyInfo?.name || "The Company"}</Text>
            <Text style={s.footerPageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </View>
      </Page>
    );
  };

  return (
    <Document>
      {layout.hasSummaryPage && renderSummaryPage()}
      {renderDetailPage()}
    </Document>
  );
}

function renderRow(
  item: LineItem,
  i: number,
  srNo: number,
  colW: readonly string[],
  hasRemarks: boolean,
) {
  return (
    <View key={`${srNo}-${i}`} style={[s.tdRow, i % 2 === 1 ? { backgroundColor: altRow } : {}]}>
      <Text style={[s.tdText, { width: colW[0], textAlign: "center" }]}>{srNo}</Text>
      <Text style={[s.tdText, { width: colW[1] }]}>{item.description}</Text>
      <Text style={[s.tdText, { width: colW[2] }]}>{item.unit}</Text>
      <Text style={[s.tdText, { width: colW[3], textAlign: "right" }]}>
        {item.is_qro ? "QRO" : item.qty}
      </Text>
      <Text style={[s.tdText, { width: colW[4], textAlign: "right" }]}>
        {item.is_qro ? "-" : inr(item.rate)}
      </Text>
      <Text style={[s.tdText, { width: colW[5], textAlign: "right" }]}>
        {item.is_qro ? <Text style={s.qroBadge}>QRO</Text> : inr(item.amount)}
      </Text>
      {hasRemarks && (
        <Text style={[s.tdText, { width: colW[6] }]}>{item.remark ?? ""}</Text>
      )}
    </View>
  );
}

function toRoman(num: number): string {
  const map: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, symbol] of map) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}
