import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { pdf } from "@react-pdf/renderer";
import QuotationPDF from "@/components/QuotationPDF";
import { PaymentsTab } from "@/components/enquiry/PaymentsTab";
import { CommunicationTab } from "@/components/enquiry/CommunicationTab";
import { JobCompletionTab } from "@/components/enquiry/JobCompletionTab";
import { MobilisationSection } from "@/components/enquiry/MobilisationSection";
import { FollowUpsTab } from "@/components/enquiry/FollowUpsTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Loader2, ChevronDown, ChevronUp, Download, Send, AlertTriangle,
  ArrowLeft, CheckCircle2, MapPin, Phone, Mail, MessageCircle,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Enquiry = Tables<"enquiries">;
type Client = Tables<"clients">;
type Quotation = Tables<"quotations">;

type LineItem = { description: string; unit: string; qty: number; rate: number; amount: number };

const soilTypeLabels: Record<string, string> = {
  soil: "Soil",
  rock: "Rock",
  mixed: "Mixed",
};

const structureTypeLabels: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  infrastructure: "Infrastructure",
  other: "Other",
};

// Gradient per variant
const VARIANT_GRADIENTS: Record<string, string> = {
  A: "linear-gradient(90deg,#1565C0,#2979FF)",
  B: "linear-gradient(90deg,#6A1B9A,#AB47BC)",
  C: "linear-gradient(90deg,#E65100,#FF8F00)",
  D: "linear-gradient(90deg,#00897B,#26A69A)",
};

function VariantCard({
  q, isBest, onApprove, pdfLoading, onSend,
}: { q: Quotation; isBest: boolean; onApprove: (q: Quotation) => void; pdfLoading: string | null; onSend?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const items: LineItem[] = typeof q.line_items === "string" ? JSON.parse(q.line_items) : (q.line_items as any);
  const isApproved = q.status === "approved" || q.status === "sent" || q.status === "accepted";
  const gradient = VARIANT_GRADIENTS[q.variant] ?? VARIANT_GRADIENTS.A;

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "16px",
        border: isApproved ? "2px solid #1565C0" : "1px solid #E0E7EF",
        boxShadow: isApproved
          ? "0 4px 20px rgba(21,101,192,0.15)"
          : "0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
        position: "relative",
        transition: "all 0.2s ease",
      }}
      className={q.pdf_status === "generating" ? "animate-pulse" : ""}
    >
      {/* Top accent bar */}
      <div style={{ height: "4px", background: gradient, position: "absolute", top: 0, left: 0, right: 0 }} />

      <div className="p-5 pt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-sm font-bold px-2.5 py-0.5 rounded-lg"
              style={{ background: "#F0F4F8", color: "#0A1929" }}
            >
              {q.variant}
            </span>
            <span className="text-sm font-medium" style={{ color: "#0A1929" }}>{q.variant_label}</span>
          </div>
          <div className="flex items-center gap-2">
            {isBest && q.status === "draft" && (
              <span
                className="text-[11px] font-semibold px-2.5 py-[3px] rounded-full"
                style={{ background: "linear-gradient(135deg,#FF8F00,#FFB300)", color: "white" }}
              >
                Best Value
              </span>
            )}
            {isApproved && (
              <span
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-[3px] rounded-full"
                style={{ background: "linear-gradient(135deg,#00897B,#26A69A)", color: "white" }}
              >
                <CheckCircle2 style={{ width: "11px", height: "11px" }} />
                Approved
              </span>
            )}
            {q.status === "superseded" && (
              <span
                className="text-[11px] font-semibold px-2.5 py-[3px] rounded-full"
                style={{ background: "#F0F4F8", color: "#546E7A" }}
              >
                Superseded
              </span>
            )}
          </div>
        </div>

        <p
          className="font-bold mb-3"
          style={{ fontFamily: "Sora, sans-serif", fontSize: "32px", color: "#0A1929", lineHeight: 1.1 }}
        >
          {formatCurrency(q.total_amount)}
        </p>

        <div className="space-y-1 text-sm mb-3" style={{ color: "#546E7A" }}>
          <p>Mobilisation: {formatCurrency(q.mobilisation_cost)}</p>
          <p>Drilling: {formatCurrency(q.drilling_cost)}</p>
          <p>Reporting: {formatCurrency(q.reporting_cost)}</p>
        </div>
        <p className="text-xs mb-4" style={{ color: "#546E7A" }}>
          {q.num_bores} bores @ {q.depth_per_bore_m}m depth
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-medium mb-3"
          style={{ color: "#1565C0" }}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide Breakdown" : "View Breakdown"}
        </button>

        {expanded && (
          <div className="mb-4 rounded-lg overflow-hidden text-xs" style={{ border: "1px solid #E0E7EF" }}>
            <div className="grid grid-cols-5 gap-0 font-semibold" style={{ background: "#0A1929", color: "white" }}>
              <div className="p-2 col-span-2">Description</div>
              <div className="p-2 text-right">Qty</div>
              <div className="p-2 text-right">Rate</div>
              <div className="p-2 text-right">Amount</div>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-5 gap-0" style={{ background: i % 2 === 1 ? "#F8FAFC" : "#FFFFFF" }}>
                <div className="p-2 col-span-2">{item.description}</div>
                <div className="p-2 text-right font-mono">{item.qty}</div>
                <div className="p-2 text-right font-mono">{formatCurrency(item.rate)}</div>
                <div className="p-2 text-right font-mono">{formatCurrency(item.amount)}</div>
              </div>
            ))}
          </div>
        )}

        {q.pdf_status === "generating" && (
          <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#1565C0" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…
          </div>
        )}

        {q.pdf_url && q.pdf_status === "ready" && (
          <div className="flex gap-2 mb-3">
            <a href={q.pdf_url} target="_blank" rel="noreferrer">
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: "linear-gradient(135deg,#1565C0,#2979FF)",
                  color: "white",
                  boxShadow: "0 2px 8px rgba(21,101,192,0.3)",
                }}
              >
                <Download className="h-3 w-3" />Download PDF
              </button>
            </a>
            {isApproved && onSend ? (
              <button
                onClick={onSend}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: "linear-gradient(135deg,#1565C0,#2979FF)",
                  color: "white",
                  boxShadow: "0 2px 8px rgba(21,101,192,0.3)",
                }}
              >
                <Send className="h-3 w-3" />Send to Client
              </button>
            ) : (
              <button
                disabled
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold opacity-40"
                style={{ background: "#F0F4F8", color: "#546E7A" }}
              >
                <Send className="h-3 w-3" />Send to Client
              </button>
            )}
          </div>
        )}

        {q.pdf_status === "failed" && (
          <p className="text-xs mb-3" style={{ color: "#C62828" }}>PDF generation failed — use Retry below.</p>
        )}

        {q.status === "draft" && (
          <button
            onClick={() => onApprove(q)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg,#FF8F00,#FFB300)",
              color: "white",
              boxShadow: "0 4px 12px rgba(255,143,0,0.3)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
          >
            Approve This Variant
          </button>
        )}
      </div>
    </div>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approveTarget, setApproveTarget] = useState<Quotation | null>(null);
  const [approving, setApproving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("quotations");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendChannelEmail, setSendChannelEmail] = useState(true);
  const [sendChannelWhatsapp, setSendChannelWhatsapp] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: enq } = await supabase.from("enquiries").select("*").eq("id", id).single();
    if (!enq) { setLoading(false); return; }
    setEnquiry(enq);
    const [clientRes, quotRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", enq.client_id).single(),
      supabase.from("quotations").select("*").eq("enquiry_id", id).order("version", { ascending: false }).order("variant"),
    ]);
    setClient(clientRes.data);
    setQuotations(quotRes.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const generateQuotations = async () => {
    if (!enquiry) return;
    setGenerating(true);

    const { data: rate, error: rateErr } = await supabase
      .from("rate_matrix").select("*")
      .ilike("city", enquiry.site_city).eq("structure_type", enquiry.structure_type)
      .eq("is_active", true).is("effective_to", null).limit(1).maybeSingle();

    if (rateErr || !rate) {
      toast.error(`No rate matrix configured for ${enquiry.site_city}. Please add rates first.`);
      setGenerating(false);
      return;
    }

    const B = enquiry.num_bores;
    const D = enquiry.expected_depth_m ? Number(enquiry.expected_depth_m) : 10;
    const soilR = 0.7, rockR = 0.3;
    const currentMaxVersion = quotations.length > 0 ? Math.max(...quotations.map((q) => q.version)) : 0;
    const newVersion = currentMaxVersion + 1;

    const draftIds = quotations.filter((q) => q.status === "draft").map((q) => q.id);
    if (draftIds.length) {
      await supabase.from("quotations").update({ status: "superseded" as any }).in("id", draftIds);
    }

    const variants = [
      { variant: "A", label: "Standard", bores: B, depth: D },
      { variant: "B", label: "Conservative", bores: B, depth: +(D * 1.15).toFixed(2) },
      { variant: "C", label: "Extended", bores: B + 2, depth: +(D * 1.15).toFixed(2) },
      { variant: "D", label: "Minimal", bores: Math.max(2, B - 1), depth: D },
    ];

    for (const v of variants) {
      const mob = rate.rate_per_bore * v.bores;
      const drill = ((rate.rate_per_metre_soil * soilR) + (rate.rate_per_metre_rock * rockR)) * v.depth * v.bores;
      const report = rate.rate_reporting * v.bores;
      const sub = mob + drill + report;
      const gst = +(sub * 0.18).toFixed(2);
      const total = +(sub + gst).toFixed(2);

      const line_items = [
        { description: "Site Mobilisation", unit: "per bore", qty: v.bores, rate: rate.rate_per_bore, amount: +mob.toFixed(2) },
        { description: "Drilling — Soil", unit: "per metre", qty: +(v.depth * v.bores * soilR).toFixed(2), rate: rate.rate_per_metre_soil, amount: +((rate.rate_per_metre_soil * soilR) * v.depth * v.bores).toFixed(2) },
        { description: "Drilling — Rock", unit: "per metre", qty: +(v.depth * v.bores * rockR).toFixed(2), rate: rate.rate_per_metre_rock, amount: +((rate.rate_per_metre_rock * rockR) * v.depth * v.bores).toFixed(2) },
        { description: "Report Writing", unit: "per bore", qty: v.bores, rate: rate.rate_reporting, amount: +report.toFixed(2) },
        { description: "GST @ 18%", unit: "", qty: 1, rate: gst, amount: gst },
      ];

      await supabase.from("quotations").insert({
        enquiry_id: enquiry.id, variant: v.variant, variant_label: v.label,
        num_bores: v.bores, depth_per_bore_m: v.depth,
        soil_type: (enquiry.soil_type_hint || "soil") as any,
        mobilisation_cost: +mob.toFixed(2), drilling_cost: +drill.toFixed(2),
        reporting_cost: +report.toFixed(2), travel_cost: 0, subtotal: +sub.toFixed(2),
        gst_rate: 18.0, gst_type: "igst", gst_amount: gst, total_amount: total,
        line_items: JSON.stringify(line_items) as any, rate_matrix_id: rate.id,
        status: "draft", version: newVersion,
      });
    }

    toast.success("4 quotation variants generated!");
    setGenerating(false);
    fetchAll();
  };

  const generatePdf = async (q: Quotation) => {
    if (!client || !enquiry) return;
    setPdfLoading(q.id);
    await supabase.from("quotations").update({ pdf_status: "generating" }).eq("id", q.id);
    try {
      const blob = await pdf(<QuotationPDF quotation={q} client={client} enquiry={enquiry} />).toBlob();
      const year = new Date().getFullYear();
      const filename = `${enquiry.ref_number}-v${q.version}-${q.variant}.pdf`;
      const path = `${year}/${enquiry.ref_number}/${filename}`;
      const { error: upErr } = await supabase.storage.from("quotation-pdfs").upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = await supabase.storage.from("quotation-pdfs").createSignedUrl(path, 3600);
      await supabase.from("quotations").update({ pdf_url: urlData?.signedUrl ?? null, pdf_status: "ready" }).eq("id", q.id);
      toast.success("PDF generated successfully");
    } catch (err: any) {
      await supabase.from("quotations").update({ pdf_status: "failed" }).eq("id", q.id);
      toast.error("PDF generation failed: " + (err.message || "Unknown error"));
    } finally {
      setPdfLoading(null);
      fetchAll();
    }
  };

  const handleApprove = async () => {
    if (!approveTarget || !enquiry) return;
    setApproving(true);
    try {
      const { error: approveErr } = await supabase.from("quotations").update({
        status: "approved" as any, approved_at: new Date().toISOString(), approved_by: user!.id,
      }).eq("id", approveTarget.id);
      if (approveErr) {
        if (approveErr.code === "23505") {
          toast.error("Another variant was just approved — please refresh the page.");
          setApproving(false); setApproveTarget(null); return;
        }
        throw approveErr;
      }
      await supabase.from("quotations").update({ status: "superseded" as any })
        .eq("enquiry_id", enquiry.id).neq("id", approveTarget.id)
        .in("status", ["draft", "approved", "sent"] as any);
      const prevStatus = enquiry.status;
      await supabase.from("enquiries").update({ status: "pending" as any }).eq("id", enquiry.id);
      await supabase.from("enquiry_events").insert({
        enquiry_id: enquiry.id, event_type: "quotation_approved",
        from_status: prevStatus as any, to_status: "pending" as any, triggered_by: user!.id,
      });
      toast.success(`Variant ${approveTarget.variant} approved successfully!`);
      setApproveTarget(null);
      await fetchAll();
      const { data: updatedQ } = await supabase.from("quotations").select("*").eq("id", approveTarget.id).single();
      if (updatedQ) generatePdf(updatedQ);
    } catch (err: any) {
      toast.error(err.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const handleSendToClient = async () => {
    if (!enquiry || !client) return;
    setSending(true);
    try {
      const approvedQuotation = quotations.find(
        (q) => q.status === "approved" || q.status === "sent"
      );
      if (!approvedQuotation) {
        toast.error("No approved quotation found. Please approve a variant first.");
        setSending(false);
        return;
      }

      const subject = `Quotation from Tiavda Enterprises — ${enquiry.ref_number}`;
      const validityDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0A1929; padding: 24px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Tiavda Enterprises</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px;">Geotechnical Consultants</p>
  </div>
  <div style="background: #ffffff; border: 1px solid #E0E7EF; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">Dear ${client.name},</p>
    <p>Thank you for your enquiry. Please find below the quotation details for your project.</p>
    <div style="background: #F0F4F8; border: 1px solid #E0E7EF; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px;"><strong>Reference Number:</strong> <span style="font-family: monospace;">${enquiry.ref_number}</span></p>
      <p style="margin: 0 0 8px;"><strong>Total Amount:</strong> ${formatCurrency(approvedQuotation.total_amount)}</p>
      <p style="margin: 0;"><strong>Valid Until:</strong> ${validityDate}</p>
    </div>
    <p>Please find the detailed quotation attached as a PDF. If you have any questions or would like to proceed, please contact us.</p>
    <p style="margin-top: 32px;">Best regards,<br/><strong>Tiavda Enterprises</strong><br/>+91 8605811117</p>
  </div>
</body>
</html>`;

      let emailSent = false;
      let whatsappSent = false;

      if (sendChannelEmail && client.email && !client.email_bounced) {
        const { error: emailErr } = await supabase.functions.invoke("send-email", {
          body: {
            to: client.email,
            subject,
            html_body: htmlBody,
            attachment_url: approvedQuotation.pdf_url ?? undefined,
          },
        });
        if (emailErr) {
          console.error("Email send error:", emailErr);
          toast.error("Email delivery failed — continuing.");
        } else {
          emailSent = true;
          await supabase.from("communication_log").insert({
            enquiry_id: enquiry.id,
            client_id: client.id,
            channel: "email" as any,
            direction: "outbound" as any,
            subject,
            body: "Quotation email sent",
            status: "sent",
            sent_by: user?.id ?? null,
          });
        }
      }

      if (sendChannelWhatsapp && client.whatsapp_number && !client.whatsapp_invalid) {
        const formattedAmount = new Intl.NumberFormat("en-IN", {
          style: "currency", currency: "INR", maximumFractionDigits: 0,
        }).format(Number(approvedQuotation.total_amount));
        const { data: waData, error: waErr } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone_number: client.whatsapp_number,
            template_name: "qms_quotation_sent",
            parameters: [
              { name: "client_name", value: client.name },
              { name: "ref_number", value: enquiry.ref_number },
              { name: "amount", value: formattedAmount },
              { name: "validity_days", value: "30" },
            ],
          },
        });
        if (waErr || waData?.error) {
          const errMsg = waData?.error || waErr?.message || "Unknown error";
          console.error("WhatsApp send error:", errMsg);
          if (waData?.whatsapp_invalid) {
            await supabase.from("clients").update({ whatsapp_invalid: true }).eq("id", client.id);
          }
          toast.error("WhatsApp delivery failed — continuing.");
        } else {
          whatsappSent = true;
          await supabase.from("communication_log").insert({
            enquiry_id: enquiry.id,
            client_id: client.id,
            channel: "whatsapp" as any,
            direction: "outbound" as any,
            subject: `WhatsApp: Quotation ${enquiry.ref_number}`,
            body: "Quotation WhatsApp sent",
            status: "sent",
            sent_by: user?.id ?? null,
          });
        }
      }

      await supabase.from("quotations").update({
        status: "sent" as any,
        sent_at: new Date().toISOString(),
      }).eq("id", approvedQuotation.id);

      const prevStatus = enquiry.status;
      await supabase.from("enquiries").update({ status: "sent" as any }).eq("id", enquiry.id);

      // Read automation settings before inserting follow-up
      const { data: settingsRows } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", ["auto_followup_after_quote", "auto_followup_days"]);
      const settingsMap = new Map(settingsRows?.map((r) => [r.key, r.value]) ?? []);
      const autoFollowupEnabled = (settingsMap.get("auto_followup_after_quote") ?? "true") !== "false";
      const followupDays = parseInt(settingsMap.get("auto_followup_days") ?? "3", 10) || 3;

      if (autoFollowupEnabled) {
        const scheduled = new Date();
        scheduled.setDate(scheduled.getDate() + followupDays);
        await supabase.from("follow_ups").insert({
          enquiry_id: enquiry.id,
          scheduled_date: scheduled.toISOString().slice(0, 10),
          auto_scheduled: true,
          outcome: "pending" as any,
          notes: "Auto: post-quote follow-up",
        });
      }

      await supabase.from("enquiry_events").insert({
        enquiry_id: enquiry.id,
        event_type: "quotation_sent",
        from_status: prevStatus as any,
        to_status: "sent" as any,
        triggered_by: user?.id ?? null,
      });

      if (emailSent || whatsappSent) {
        toast.success("Quotation sent to client successfully!");
      } else {
        toast.error("No channels were successfully delivered — check client contact details.");
      }

      setSendModalOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to send quotation");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1565C0" }} /></div>;
  if (!enquiry) return (
    <div className="text-center py-20">
      <p className="text-lg mb-4" style={{ color: "#546E7A" }}>Enquiry not found</p>
      <Button variant="outline" onClick={() => navigate("/enquiries")}><ArrowLeft className="mr-2 h-4 w-4" />Back to Enquiries</Button>
    </div>
  );

  const drafts = quotations.filter((q) => q.status === "draft");
  const bestId = drafts.length > 0 ? drafts.reduce((a, b) => a.total_amount < b.total_amount ? a : b).id : null;
  const showJobTabs = enquiry.status === "confirmed" || enquiry.status === "completed";

  const allTabs = [
    { key: "quotations", label: "Quotations" },
    { key: "follow-ups", label: "Follow-ups" },
    { key: "payments", label: "Payments" },
    { key: "communications", label: "Communications" },
    ...(showJobTabs ? [{ key: "job", label: "Job Completion" }] : []),
  ];

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 120px)" }}>
      {/* ── Left panel (320px) ── */}
      <div
        style={{
          width: "320px",
          flexShrink: 0,
          background: "#FFFFFF",
          borderRight: "1px solid #E0E7EF",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Header gradient */}
        <div
          style={{
            background: "linear-gradient(135deg, #0A1929 0%, #1565C0 100%)",
            padding: "24px",
            flexShrink: 0,
          }}
        >
          {/* Back arrow */}
          <button
            onClick={() => navigate("/enquiries")}
            className="flex items-center gap-1.5 mb-4 transition-opacity hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 500 }}
          >
            <ArrowLeft style={{ width: "15px", height: "15px" }} />
            Back
          </button>
          {/* Ref number */}
          <p
            className="font-bold mb-2"
            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "22px", color: "white", letterSpacing: "0.02em" }}
          >
            {enquiry.ref_number}
          </p>
          {/* Status badge — glass style */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "white",
                borderRadius: "9999px",
                padding: "2px 10px",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              {enquiry.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          </div>
          {/* City */}
          <div className="flex items-center gap-1.5 mt-3">
            <MapPin style={{ width: "13px", height: "13px", color: "rgba(255,255,255,0.65)" }} />
            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px" }}>{enquiry.site_city}</span>
          </div>
        </div>

        {/* Client section */}
        <div style={{ padding: "20px", borderBottom: "1px solid #E0E7EF" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#546E7A" }}>
            Client
          </p>
          {client ? (
            <div className="space-y-2">
              <p className="text-base font-semibold" style={{ color: "#0A1929" }}>{client.name}</p>
              {client.phone && (
                <div className="flex items-center gap-2">
                  <Phone style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0 }} />
                  <span className="text-sm font-mono" style={{ color: "#546E7A" }}>{client.phone}</span>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-2">
                  <Mail style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0 }} />
                  <span className="text-sm" style={{ color: "#546E7A" }}>{client.email}</span>
                </div>
              )}
              {client.whatsapp_number && (
                <div className="flex items-center gap-2">
                  <MessageCircle style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0 }} />
                  <span className="text-sm font-mono" style={{ color: "#546E7A" }}>{client.whatsapp_number}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#546E7A" }}>Loading…</p>
          )}
        </div>

        {/* Site info */}
        <div style={{ padding: "20px", borderBottom: "1px solid #E0E7EF" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#546E7A" }}>
            Site Details
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Structure", structureTypeLabels[enquiry.structure_type] || enquiry.structure_type],
              ["Bores", enquiry.num_bores.toString()],
              ["Depth", enquiry.expected_depth_m ? `${enquiry.expected_depth_m}m` : "TBD"],
              ["Soil Hint", enquiry.soil_type_hint ? (soilTypeLabels[enquiry.soil_type_hint] || enquiry.soil_type_hint) : "Not specified"],
            ].map(([label, val]) => (
              <div key={label} style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>{label}</p>
                <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={generateQuotations}
            disabled={generating}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#1565C0,#2979FF)",
              color: "white",
              boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
          >
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : quotations.length > 0 ? "Re-generate Quotation" : "Generate Quotation"}
          </button>
          <button
            onClick={() => setActiveTab("follow-ups")}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "#F0F4F8", color: "#0A1929" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E8EEF5"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
          >
            Add Follow-up
          </button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Tabs bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #E0E7EF",
            background: "white",
            padding: "0 24px",
            gap: "4px",
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          {allTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "12px 16px",
                fontSize: "13px",
                fontWeight: activeTab === tab.key ? 600 : 500,
                color: activeTab === tab.key ? "#0A1929" : "#546E7A",
                borderBottom: activeTab === tab.key ? "2px solid #1565C0" : "2px solid transparent",
                background: "transparent",
                marginBottom: "-1px",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.key) {
                  (e.currentTarget as HTMLElement).style.background = "#F8FAFC";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          style={{
            padding: "24px",
            background: "#F0F4F8",
            flex: 1,
            minHeight: "400px",
          }}
        >
          {/* Mobilisation section in job tabs */}
          {showJobTabs && activeTab === "job" && (
            <div className="mb-6">
              <MobilisationSection
                enquiryId={enquiry.id}
                enquiry={{ id: enquiry.id, ref_number: enquiry.ref_number, site_city: enquiry.site_city, client_id: enquiry.client_id }}
              />
            </div>
          )}

          {activeTab === "quotations" && (
            <div className="space-y-4">
              {quotations.length === 0 ? (
                <div
                  className="rounded-xl p-12 text-center"
                  style={{ background: "#FFFFFF", border: "1px solid #E0E7EF" }}
                >
                  <AlertTriangle className="mx-auto mb-3 h-10 w-10" style={{ color: "#E65100" }} />
                  <p className="mb-4" style={{ color: "#546E7A" }}>
                    No quotations yet. Click "Generate Quotation" in the left panel to create 4 variants.
                  </p>
                  <Button variant="outline" onClick={() => navigate("/rate-matrix")}>Go to Rate Matrix</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quotations.map((q) => (
                    <VariantCard
                      key={q.id}
                      q={q}
                      isBest={q.id === bestId}
                      onApprove={setApproveTarget}
                      pdfLoading={pdfLoading}
                      onSend={() => setSendModalOpen(true)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "follow-ups" && <FollowUpsTab enquiryId={enquiry.id} />}
          {activeTab === "payments" && <PaymentsTab enquiryId={enquiry.id} />}
          {activeTab === "communications" && <CommunicationTab enquiryId={enquiry.id} />}
          {activeTab === "job" && showJobTabs && <JobCompletionTab enquiryId={enquiry.id} />}
        </div>
      </div>

      {/* Send to Client modal */}
      <Dialog open={sendModalOpen} onOpenChange={(o) => !o && setSendModalOpen(false)}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
              Send Quotation to Client
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm" style={{ color: "#546E7A" }}>
              Choose delivery channel(s) for{" "}
              <span className="font-mono font-semibold" style={{ color: "#0A1929" }}>{enquiry?.ref_number}</span>:
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="ch-email"
                  checked={sendChannelEmail}
                  onCheckedChange={(v) => setSendChannelEmail(!!v)}
                  disabled={!client?.email || !!client?.email_bounced}
                />
                <Label htmlFor="ch-email" className="text-sm">
                  Email{client?.email ? ` — ${client.email}` : " (no email on file)"}
                  {client?.email_bounced && <span className="ml-2 text-xs" style={{ color: "#C62828" }}>(bounced)</span>}
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="ch-wa"
                  checked={sendChannelWhatsapp}
                  onCheckedChange={(v) => setSendChannelWhatsapp(!!v)}
                  disabled={!client?.whatsapp_number || !!client?.whatsapp_invalid}
                />
                <Label htmlFor="ch-wa" className="text-sm">
                  WhatsApp{client?.whatsapp_number ? ` — ${client.whatsapp_number}` : " (no WhatsApp on file)"}
                  {client?.whatsapp_invalid && <span className="ml-2 text-xs" style={{ color: "#C62828" }}>(invalid)</span>}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setSendModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSendToClient}
              disabled={sending || (!sendChannelEmail && !sendChannelWhatsapp)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg,#1565C0,#2979FF)",
                color: "white",
                boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
              }}
            >
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Send</>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve modal */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
              Approve Variant {approveTarget?.variant} — {approveTarget?.variant_label}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm mb-1" style={{ color: "#546E7A" }}>
            Total Amount:{" "}
            <span className="font-semibold" style={{ color: "#0A1929" }}>
              {approveTarget ? formatCurrency(approveTarget.total_amount) : ""}
            </span>
          </p>
          <p className="text-xs" style={{ color: "#546E7A" }}>Other draft variants will be superseded.</p>
          <DialogFooter className="mt-6">
            <button
              onClick={() => setApproveTarget(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg,#FF8F00,#FFB300)",
                color: "white",
                boxShadow: "0 4px 12px rgba(255,143,0,0.3)",
              }}
            >
              {approving ? <><Loader2 className="h-4 w-4 animate-spin" />Approving…</> : "Confirm Approval"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
