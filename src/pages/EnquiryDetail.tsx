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
import { Loader2, ChevronDown, ChevronUp, Download, Send, AlertTriangle, ArrowLeft, CheckCircle2, MapPin } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Enquiry = Tables<"enquiries">;
type Client = Tables<"clients">;
type Quotation = Tables<"quotations">;

type LineItem = { description: string; unit: string; qty: number; rate: number; amount: number };

function VariantCard({
  q, isBest, onApprove, pdfLoading,
}: { q: Quotation; isBest: boolean; onApprove: (q: Quotation) => void; pdfLoading: string | null }) {
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
          <Button variant="outline" size="sm" disabled><Send className="mr-1 h-3 w-3" />Send to Client</Button>
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
      .eq("city", enquiry.site_city).eq("structure_type", enquiry.structure_type)
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
      await supabase.from("quotations").update({ status: "superseded" as any }).eq("enquiry_id", enquiry.id).neq("id", approveTarget.id).eq("status", "draft" as any);
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
            ["Structure", enquiry.structure_type],
            ["Bores", enquiry.num_bores.toString()],
            ["Depth", enquiry.expected_depth_m ? `${enquiry.expected_depth_m}m` : "TBD"],
            ["Soil Hint", enquiry.soil_type_hint ?? "Unknown"],
          ].map(([label, val]) => (
            <div key={label} className="bg-[#F8FAFC] rounded-lg p-3 border border-[#CBD5E1]">
              <p className="text-xs text-[#64748B] uppercase tracking-wide">{label}</p>
              <p className="text-sm font-semibold text-[#0F2A47] mt-1 capitalize">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mobilisation Section */}
      {showJobTabs && <MobilisationSection enquiryId={enquiry.id} />}

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
                  <VariantCard key={q.id} q={q} isBest={q.id === bestId} onApprove={setApproveTarget} pdfLoading={pdfLoading} />
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
