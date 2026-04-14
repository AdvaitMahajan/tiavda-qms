import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import { pdf } from "@react-pdf/renderer";
import QuotationPDF from "@/components/QuotationPDF";
import { PaymentsTab } from "@/components/enquiry/PaymentsTab";
import { CommunicationTab } from "@/components/enquiry/CommunicationTab";
import { JobCompletionTab } from "@/components/enquiry/JobCompletionTab";
import { MobilisationSection } from "@/components/enquiry/MobilisationSection";
import { FollowUpsTab } from "@/components/enquiry/FollowUpsTab";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, ChevronDown, ChevronUp, Download, Send, AlertTriangle, ArrowLeft, CheckCircle2, MapPin } from "lucide-react";
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

function VariantCard({
  q, isBest, onApprove, pdfLoading, onSend,
}: { q: Quotation; isBest: boolean; onApprove: (q: Quotation) => void; pdfLoading: string | null; onSend?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const items: LineItem[] = typeof q.line_items === "string" ? JSON.parse(q.line_items) : (q.line_items as any);
  const isApproved = q.status === "approved" || q.status === "sent" || q.status === "accepted";

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 shadow-sm transition-all",
      isApproved ? "border-green ring-1 ring-green/20" : "border-border",
      q.pdf_status === "generating" && "animate-pulse"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-sm">{q.variant}</Badge>
          <span className="text-sm font-medium text-foreground">{q.variant_label}</span>
        </div>
        <div className="flex items-center gap-2">
          {isBest && q.status === "draft" && <Badge className="bg-green/10 text-green border-green/30 text-xs">Best Value</Badge>}
          {isApproved && <Badge className="bg-green text-white text-xs"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>}
          {q.status === "superseded" && <Badge variant="secondary" className="text-xs">Superseded</Badge>}
        </div>
      </div>

      <p className="font-sora text-3xl font-bold text-navy mb-3">{formatCurrency(q.total_amount)}</p>

      <div className="space-y-1 text-sm text-muted-foreground mb-3">
        <p>Mobilisation: {formatCurrency(q.mobilisation_cost)}</p>
        <p>Drilling: {formatCurrency(q.drilling_cost)}</p>
        <p>Reporting: {formatCurrency(q.reporting_cost)}</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{q.num_bores} bores @ {q.depth_per_bore_m}m depth</p>

      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs font-medium text-blue hover:underline mb-3">
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide Breakdown" : "View Breakdown"}
      </button>

      {expanded && (
        <div className="mb-4 rounded-lg border border-border overflow-hidden text-xs">
          <div className="grid grid-cols-5 gap-0 bg-navy text-white font-semibold">
            <div className="p-2 col-span-2">Description</div>
            <div className="p-2 text-right">Qty</div>
            <div className="p-2 text-right">Rate</div>
            <div className="p-2 text-right">Amount</div>
          </div>
          {items.map((item, i) => (
            <div key={i} className={cn("grid grid-cols-5 gap-0", i % 2 === 1 ? "bg-surface" : "bg-card")}>
              <div className="p-2 col-span-2">{item.description}</div>
              <div className="p-2 text-right font-mono">{item.qty}</div>
              <div className="p-2 text-right font-mono">{formatCurrency(item.rate)}</div>
              <div className="p-2 text-right font-mono">{formatCurrency(item.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {q.pdf_status === "generating" && (
        <div className="flex items-center gap-2 text-sm text-blue mb-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…
        </div>
      )}

      {q.pdf_url && q.pdf_status === "ready" && (
        <div className="flex gap-2 mb-3">
          <a href={q.pdf_url} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Download className="mr-1 h-3 w-3" />Download PDF</Button>
          </a>
          {isApproved && onSend ? (
            <Button variant="outline" size="sm" onClick={onSend} className="text-blue border-blue hover:bg-blue/5">
              <Send className="mr-1 h-3 w-3" />Send to Client
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled><Send className="mr-1 h-3 w-3" />Send to Client</Button>
          )}
        </div>
      )}

      {q.pdf_status === "failed" && (
        <p className="text-xs text-destructive mb-3">PDF generation failed — use Retry below.</p>
      )}

      {q.status === "draft" && (
        <Button onClick={() => onApprove(q)} className="w-full bg-gold text-white hover:bg-gold/90">
          Approve This Variant
        </Button>
      )}
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
      // Supersede previously-approved quotation and all remaining drafts
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
  <div style="background: #0F2A47; padding: 24px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Tiavda Enterprises</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px;">Geotechnical Consultants</p>
  </div>
  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">Dear ${client.name},</p>
    <p>Thank you for your enquiry. Please find below the quotation details for your project.</p>
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin: 24px 0;">
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

      // Update quotation status to sent
      await supabase.from("quotations").update({
        status: "sent" as any,
        sent_at: new Date().toISOString(),
      }).eq("id", approvedQuotation.id);

      // Update enquiry status to sent
      const prevStatus = enquiry.status;
      await supabase.from("enquiries").update({ status: "sent" as any }).eq("id", enquiry.id);

      // Auto-schedule follow-up in 3 days
      const followUpDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await supabase.from("follow_ups").insert({
        enquiry_id: enquiry.id,
        scheduled_date: followUpDate,
        auto_scheduled: true,
        notes: "Auto: post-quote follow-up",
        outcome: "pending" as any,
      });

      // Log event
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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue" /></div>;
  if (!enquiry) return (
    <div className="text-center py-20">
      <p className="text-lg text-muted-foreground mb-4">Enquiry not found</p>
      <Button variant="outline" onClick={() => navigate("/enquiries")}><ArrowLeft className="mr-2 h-4 w-4" />Back to Enquiries</Button>
    </div>
  );

  const drafts = quotations.filter((q) => q.status === "draft");
  const bestId = drafts.length > 0 ? drafts.reduce((a, b) => a.total_amount < b.total_amount ? a : b).id : null;
  const showJobTabs = enquiry.status === "confirmed" || enquiry.status === "completed";

  // Tab definitions for custom tab bar (Task 4)
  const allTabs = [
    { key: "quotations", label: "Quotations" },
    { key: "follow-ups", label: "Follow-ups" },
    { key: "payments", label: "Payments" },
    { key: "communications", label: "Communications" },
    ...(showJobTabs ? [{ key: "job", label: "Job Completion" }] : []),
  ];

  return (
    <div className="flex h-full overflow-hidden flex-col space-y-0">
      {/* Header (Task 5) */}
      <div className="px-1 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/enquiries")} className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-mono text-2xl font-bold text-[#0F2A47]">{enquiry.ref_number}</h1>
              <StatusBadge status={enquiry.status} />
            </div>
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#64748B]" />
              <span className="text-sm text-[#64748B]">{enquiry.site_city}</span>
            </div>
          </div>
        </div>

        {/* Site info grid (Task 5) */}
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Structure", structureTypeLabels[enquiry.structure_type] || enquiry.structure_type],
            ["Bores", enquiry.num_bores.toString()],
            ["Depth", enquiry.expected_depth_m ? `${enquiry.expected_depth_m}m` : "TBD"],
            ["Soil Hint", enquiry.soil_type_hint ? (soilTypeLabels[enquiry.soil_type_hint] || enquiry.soil_type_hint) : "Not specified"],
          ].map(([label, val]) => (
            <div key={label} className="bg-[#F8FAFC] rounded-lg p-3 border border-[#CBD5E1]">
              <p className="text-xs text-[#64748B] uppercase tracking-wide">{label}</p>
              <p className="text-sm font-semibold text-[#0F2A47] mt-1">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mobilisation Section */}
      {showJobTabs && (
        <MobilisationSection
          enquiryId={enquiry.id}
          enquiry={{ id: enquiry.id, ref_number: enquiry.ref_number, site_city: enquiry.site_city, client_id: enquiry.client_id }}
        />
      )}

      {/* Custom Tab Bar (Task 4) */}
      <div className="flex border-b-2 border-gray-200 bg-white overflow-x-auto">
        {allTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-0.5 transition-colors duration-150 ${
              activeTab === tab.key
                ? "text-[#0F2A47] border-[#0F2A47] font-semibold bg-white"
                : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pt-4 overflow-y-auto flex-1">
        {activeTab === "quotations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sora text-lg font-semibold text-foreground">Quotation Variants</h2>
              <Button onClick={generateQuotations} disabled={generating} className="bg-[#1B5EA0] text-white hover:opacity-90 transition-opacity">
                {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</> : quotations.length > 0 ? "Re-generate" : "Generate Quotation"}
              </Button>
            </div>
            {quotations.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber" />
                <p className="text-muted-foreground mb-4">No quotations yet. Click "Generate Quotation" to create 4 variants based on the rate matrix.</p>
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

      {/* Send to Client modal */}
      <Dialog open={sendModalOpen} onOpenChange={(o) => !o && setSendModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Quotation to Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Choose delivery channel(s) for <span className="font-mono font-semibold text-foreground">{enquiry?.ref_number}</span>:</p>
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
                  {client?.email_bounced && <span className="ml-2 text-destructive text-xs">(bounced)</span>}
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
                  {client?.whatsapp_invalid && <span className="ml-2 text-destructive text-xs">(invalid)</span>}
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSendToClient}
              disabled={sending || (!sendChannelEmail && !sendChannelWhatsapp)}
              className="bg-blue text-white hover:bg-blue/90"
            >
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : <><Send className="mr-2 h-4 w-4" />Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve modal */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Variant {approveTarget?.variant} — {approveTarget?.variant_label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Total Amount: <span className="font-semibold text-foreground">{approveTarget ? formatCurrency(approveTarget.total_amount) : ""}</span>
          </p>
          <p className="text-xs text-muted-foreground">Other draft variants will be superseded.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={approving} className="bg-gold text-white hover:bg-gold/90">
              {approving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving…</> : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
