import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { COMPANY_LOGO_DATA_URI } from "@/lib/companyLogo";
import type { CompanyInfo } from "@/lib/templateRegistry";

/**
 * Shared letterhead header for every client-facing PDF (quotation SI, BOQ,
 * consultancy, invoice): the company logo plus the company details block, then
 * a divider. Company details come from Settings via getCompanyInfoFromSettings.
 */
const navy = "#0F2A47";
const muted = "#546E7A";

const s = StyleSheet.create({
  wrap: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  // The logo artwork has whitespace above the wordmark; the negative top margin
  // lifts it so the wordmark aligns with the top of the address block.
  logo: { width: 200, objectFit: "contain", marginTop: -16 },
  details: { alignItems: "flex-end", maxWidth: 240 },
  detailLine: { fontSize: 8, color: muted, textAlign: "right", marginBottom: 1.5 },
  // Slight negative top margin lifts the divider up under the header content
  // (the tall logo box would otherwise leave a big gap), but leaves breathing
  // room so it doesn't touch the logo; tighter marginBottom to the text below.
  rule: { borderBottomWidth: 2, borderBottomColor: navy, marginTop: -8, marginBottom: 5 },
});

export function PdfLetterhead({ company }: { company?: CompanyInfo | null }) {
  const c = company;
  const contact = [c?.email, c?.phone].filter(Boolean).join("  ·  ");
  const tax = [c?.gstNumber && `GSTIN: ${c.gstNumber}`, c?.panNumber && `PAN: ${c.panNumber}`]
    .filter(Boolean)
    .join("   |   ");
  return (
    <View>
      <View style={s.wrap}>
        <Image src={COMPANY_LOGO_DATA_URI} style={s.logo} />
        <View style={s.details}>
          {c?.address ? <Text style={s.detailLine}>{c.address}</Text> : null}
          {c?.state ? <Text style={s.detailLine}>{c.state}</Text> : null}
          {tax ? <Text style={s.detailLine}>{tax}</Text> : null}
          {contact ? <Text style={s.detailLine}>{contact}</Text> : null}
        </View>
      </View>
      <View style={s.rule} />
    </View>
  );
}
