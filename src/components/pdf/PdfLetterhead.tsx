import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { COMPANY_LOGO_DATA_URI } from "@/lib/companyLogo";
import type { CompanyInfo } from "@/lib/templateRegistry";

/**
 * Shared letterhead header for every client-facing PDF (quotation SI, BOQ,
 * consultancy, invoice): the company logo plus the company details block, then
 * a divider. Company details come from Settings via getCompanyInfoFromSettings.
 *
 * Two layouts:
 *  - "compact" (default) — logo left, details right. Used by the invoice.
 *  - "banner" — logo across the full content width with the details centred
 *    underneath. Used by quotations.
 */
const navy = "#0F2A47";
const muted = "#546E7A";

// The source artwork is 1600×639 with generous whitespace above and below the
// wordmark. Rendered at the full 515pt content width it would stand 206pt tall,
// most of it empty. The banner therefore draws the image at full width inside a
// shorter clipping box and pulls it up, so only the artwork band shows — the
// equivalent of a crop, without needing a second asset.
const LOGO_W = 515;                                  // A4 width less 40pt margins
const LOGO_SCALE = LOGO_W / 1600;
const ART_TOP_PX = 185;                              // first row of artwork
const ART_BOTTOM_PX = 515;                           // last row of artwork
const BANNER_OFFSET = -(ART_TOP_PX * LOGO_SCALE);    // ≈ -59.5pt
const BANNER_HEIGHT = (ART_BOTTOM_PX - ART_TOP_PX) * LOGO_SCALE; // ≈ 106pt

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

  bannerClip: { width: LOGO_W, height: BANNER_HEIGHT, overflow: "hidden", position: "relative" },
  // Absolutely positioned, so the shorter clipping box crops the image instead
  // of resizing it — an in-flow child gets compressed to the box height, which
  // squashes the wordmark rather than trimming the whitespace around it.
  bannerLogo: { position: "absolute", top: BANNER_OFFSET, left: 0, width: LOGO_W },
  bannerDetails: { alignItems: "center", marginTop: 2 },
  bannerLine: { fontSize: 8, color: muted, textAlign: "center", marginBottom: 1.5 },
  bannerRule: { borderBottomWidth: 2, borderBottomColor: navy, marginTop: 5, marginBottom: 6 },
});

export function PdfLetterhead({
  company,
  variant = "compact",
}: {
  company?: CompanyInfo | null;
  variant?: "compact" | "banner";
}) {
  const c = company;
  const contact = [c?.email, c?.phone].filter(Boolean).join("  ·  ");
  const tax = [c?.gstNumber && `GSTIN: ${c.gstNumber}`, c?.panNumber && `PAN: ${c.panNumber}`]
    .filter(Boolean)
    .join("   |   ");

  if (variant === "banner") {
    return (
      <View>
        <View style={s.bannerClip}>
          <Image src={COMPANY_LOGO_DATA_URI} style={s.bannerLogo} />
        </View>
        <View style={s.bannerDetails}>
          {tax ? <Text style={s.bannerLine}>{tax}</Text> : null}
          {contact ? <Text style={s.bannerLine}>{contact}</Text> : null}
        </View>
        <View style={s.bannerRule} />
      </View>
    );
  }

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
