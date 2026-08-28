import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { CompanyInfo } from "@/lib/templateRegistry";

/**
 * Closing block at the foot of a quotation: the office address followed by the
 * contact numbers. Both come from Settings — the address from `company_address`
 * / `company_state`, the numbers from `quotation_contact_numbers` — so they are
 * edited in one place rather than baked into the PDF.
 */
const navy = "#0F2A47";
const muted = "#546E7A";
const borderColor = "#CBD5E1";

const s = StyleSheet.create({
  wrap: { marginTop: 18, paddingTop: 8, borderTopWidth: 1, borderTopColor: borderColor },
  heading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: navy,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: "center",
  },
  line: { fontSize: 9, color: "#1E293B", textAlign: "center", marginBottom: 2 },
  contact: { fontSize: 9, fontFamily: "Helvetica-Bold", color: navy, textAlign: "center", marginTop: 3 },
  meta: { fontSize: 8, color: muted, textAlign: "center", marginTop: 3 },
});

export function PdfOfficeFooter({
  company,
  contactNumbers = [],
}: {
  company?: CompanyInfo | null;
  /** Displayed on one line below the address, joined with a bullet. */
  contactNumbers?: string[];
}) {
  const address = [company?.address, company?.state].filter(Boolean).join(", ");
  const numbers = contactNumbers.filter(Boolean);
  const tax = [company?.gstNumber && `GSTIN: ${company.gstNumber}`, company?.email]
    .filter(Boolean)
    .join("   |   ");

  if (!address && numbers.length === 0) return null;

  return (
    <View style={s.wrap} wrap={false}>
      <Text style={s.heading}>Office Address</Text>
      {company?.name ? <Text style={[s.line, { fontFamily: "Helvetica-Bold" }]}>{company.name}</Text> : null}
      {address ? <Text style={s.line}>{address}</Text> : null}
      {numbers.length > 0 ? <Text style={s.contact}>{numbers.join("   ·   ")}</Text> : null}
      {tax ? <Text style={s.meta}>{tax}</Text> : null}
    </View>
  );
}
