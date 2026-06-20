import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { uploadToStorage, downloadFromStorage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { AssigneeDropdown } from "@/components/AssigneeDropdown";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { sendNotification } from "@/lib/notifications";
import { pdf } from "@react-pdf/renderer";
import QuotationPDF from "@/components/QuotationPDF";
import ConsultancyPDF from "@/components/ConsultancyPDF";
import BOQTemplatePDF from "@/components/BOQTemplatePDF";
import { SECTION_LABELS } from "@/lib/quotationEngine";
import { TEMPLATE_LABELS, TEMPLATE_IDS, isBoqTemplate, getCompanyInfoFromSettings } from "@/lib/templateRegistry";
import { getTemplateById } from "@/lib/templateDefaults";
import { PaymentsTab } from "@/components/enquiry/PaymentsTab";
import { CommunicationTab } from "@/components/enquiry/CommunicationTab";
import { JobCompletionTab } from "@/components/enquiry/JobCompletionTab";
import { MobilisationSection } from "@/components/enquiry/MobilisationSection";
import { FollowUpsTab } from "@/components/enquiry/FollowUpsTab";
import { ActivityTimeline } from "@/components/enquiry/ActivityTimeline";
import { SiteVisitSection } from "@/components/enquiry/SiteVisitSection";
import { IntakeLinkCard } from "@/components/enquiry/IntakeLinkCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Loader2, ChevronDown, ChevronUp, Download, Send, AlertTriangle, RefreshCw,
  ArrowLeft, CheckCircle2, MapPin, Phone, Mail, MessageCircle, XCircle,
  UserCircle, Pencil, Save, Trophy,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { createFollowUpCadence, cancelPendingFollowUps } from "@/lib/followUpCadence";

type Enquiry = Tables<"enquiries">;
type Client = Tables<"clients">;
type Quotation = Tables<"quotations">;

type LineItem = { section?: string; description: string; unit: string; qty: number; rate: number; amount: number };

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
  q, isBest, onApprove, pdfLoading, onSend, onSaveItems, readOnly, canApprove = true, onRegeneratePdf, canRevise = true,
}: { q: Quotation; isBest: boolean; onApprove: (q: Quotation) => void; pdfLoading: string | null; onSend?: () => void; onSaveItems?: (qId: string, items: LineItem[]) => Promise<void>; readOnly?: boolean; canApprove?: boolean; onRegeneratePdf?: (q: Quotation) => void; canRevise?: boolean }) {
  const variantNavigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const items: LineItem[] = typeof q.line_items === "string" ? JSON.parse(q.line_items) : (q.line_items as any);
  const [editItems, setEditItems] = useState<LineItem[]>(items);
  const [savingItems, setSavingItems] = useState(false);
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
            <span className="text-[12px] font-mono" style={{ color: "#546E7A" }}>V{q.version}</span>
            {(q as any).template_type && (q as any).template_type !== TEMPLATE_IDS.ORIGINAL_SI && (
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                {TEMPLATE_LABELS[(q as any).template_type] ?? (q as any).template_type}
              </span>
            )}
            {(q as any).quotation_number && (
              <span className="text-[12px] font-mono px-2 py-0.5 rounded" style={{ background: "#F0F4F8", color: "#546E7A" }}>
                {(q as any).quotation_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isBest && q.status === "draft" && (
              <span
                className="text-[12px] font-semibold px-2.5 py-[3px] rounded-full"
                style={{ background: "linear-gradient(135deg,#FF8F00,#FFB300)", color: "white" }}
              >
                Best Value
              </span>
            )}
            {(q.status === "approved" || q.status === "accepted") && (
              <span
                className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-[3px] rounded-full"
                style={{ background: "linear-gradient(135deg,#00897B,#26A69A)", color: "white" }}
              >
                <CheckCircle2 style={{ width: "11px", height: "11px" }} />
                Approved
              </span>
            )}
            {q.status === "sent" && (
              <span
                className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-[3px] rounded-full"
                style={{ background: "#EBF2FF", color: "#1565C0", border: "1px solid #BFDBFE" }}
              >
                Sent
              </span>
            )}
            {q.status === "superseded" && (
              <span
                className="text-[12px] font-semibold px-2.5 py-[3px] rounded-full"
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

        {(q as any).service_type === "consultancy" || (!q.num_bores && !q.drilling_cost) ? (
          <div className="text-sm mb-4" style={{ color: "#546E7A" }}>
            <p>{items.length} line items</p>
          </div>
        ) : (
          <>
            <div className="space-y-1 text-sm mb-3" style={{ color: "#546E7A" }}>
              <p>Mobilisation: {formatCurrency(q.mobilisation_cost ?? 0)}</p>
              <p>Drilling: {formatCurrency(q.drilling_cost ?? 0)}</p>
              <p>Reporting: {formatCurrency(q.reporting_cost ?? 0)}</p>
            </div>
            <p className="text-[13px] mb-4" style={{ color: "#546E7A" }}>
              {q.num_bores ?? 0} bores @ {q.depth_per_bore_m ?? 0}m depth
            </p>
          </>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[13px] font-medium mb-3"
          style={{ color: "#1565C0" }}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide Breakdown" : "View Breakdown"}
        </button>

        {expanded && !editing && (() => {
          const hasSections = items.some((it) => it.section);
          const sections = hasSections
            ? [...new Set(items.filter((it) => it.section).map((it) => it.section!))]
            : [];
          const tmpl = q.template_type ? getTemplateById(q.template_type) : null;
          const sectionLabelMap: Record<string, string> = { ...SECTION_LABELS };
          if (tmpl) {
            for (const s of tmpl.sections) sectionLabelMap[s.key] = s.label;
          }
          return (
            <div className="mb-4">
              <div className="rounded-lg overflow-hidden text-[13px]" style={{ border: "1px solid #E0E7EF" }}>
                <div className="grid grid-cols-5 gap-0 font-semibold" style={{ background: "#0A1929", color: "white" }}>
                  <div className="p-2 col-span-2">Description</div>
                  <div className="p-2 text-right">Qty</div>
                  <div className="p-2 text-right">Rate</div>
                  <div className="p-2 text-right">Amount</div>
                </div>
                {hasSections ? (
                  sections.map((sec) => {
                    const sectionItems = items.filter((it) => it.section === sec);
                    const sectionTotal = sectionItems.reduce((s, it) => s + it.amount, 0);
                    return (
                      <div key={sec}>
                        <div className="grid grid-cols-5 gap-0" style={{ background: "#F0F4F8" }}>
                          <div className="p-2 col-span-5 font-semibold" style={{ color: "#0A1929" }}>
                            {sec}. {sectionLabelMap[sec] ?? sec}
                          </div>
                        </div>
                        {sectionItems.map((item, i) => (
                          <div key={`${sec}-${i}`} className="grid grid-cols-5 gap-0" style={{ background: i % 2 === 1 ? "#F8FAFC" : "#FFFFFF" }}>
                            <div className="p-2 col-span-2 pl-4">{item.description}</div>
                            <div className="p-2 text-right font-mono">{item.qty}</div>
                            <div className="p-2 text-right font-mono">{formatCurrency(item.rate)}</div>
                            <div className="p-2 text-right font-mono">{formatCurrency(item.amount)}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-5 gap-0" style={{ background: "#F0F4F8", borderTop: "1px solid #E0E7EF" }}>
                          <div className="p-2 col-span-4 text-right font-semibold" style={{ color: "#546E7A" }}>Section {sec} Total:</div>
                          <div className="p-2 text-right font-mono font-semibold" style={{ color: "#0A1929" }}>{formatCurrency(sectionTotal)}</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  items.map((item, i) => (
                    <div key={i} className="grid grid-cols-5 gap-0" style={{ background: i % 2 === 1 ? "#F8FAFC" : "#FFFFFF" }}>
                      <div className="p-2 col-span-2">{item.description}</div>
                      <div className="p-2 text-right font-mono">{item.qty}</div>
                      <div className="p-2 text-right font-mono">{formatCurrency(item.rate)}</div>
                      <div className="p-2 text-right font-mono">{formatCurrency(item.amount)}</div>
                    </div>
                  ))
                )}
              </div>
              {q.status === "draft" && onSaveItems && (
                <button
                  onClick={() => { setEditItems([...items]); setEditing(true); }}
                  className="mt-2 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: "#1565C0", background: "#EBF2FF" }}
                >
                  Edit Line Items
                </button>
              )}
            </div>
          );
        })()}

        {expanded && editing && (
          <div className="mb-4">
            <div className="rounded-lg overflow-hidden text-[13px]" style={{ border: "1px solid #1565C0" }}>
              <div className="grid grid-cols-12 gap-0 font-semibold" style={{ background: "#0A1929", color: "white" }}>
                <div className="p-2 col-span-4">Description</div>
                <div className="p-2 text-right col-span-1">Unit</div>
                <div className="p-2 text-right col-span-2">Qty</div>
                <div className="p-2 text-right col-span-2">Rate</div>
                <div className="p-2 text-right col-span-2">Amount</div>
                <div className="p-2 col-span-1"></div>
              </div>
              {editItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-0 items-center" style={{ background: i % 2 === 1 ? "#F8FAFC" : "#FFFFFF" }}>
                  <div className="p-1.5 col-span-4">
                    <input className="w-full px-1.5 py-1 text-[13px] rounded border" style={{ borderColor: "#E0E7EF" }}
                      value={item.description} onChange={(e) => { const u = [...editItems]; u[i] = { ...u[i], description: e.target.value }; setEditItems(u); }} />
                  </div>
                  <div className="p-1.5 col-span-1">
                    <input className="w-full px-1 py-1 text-[13px] rounded border text-right" style={{ borderColor: "#E0E7EF" }}
                      value={item.unit} onChange={(e) => { const u = [...editItems]; u[i] = { ...u[i], unit: e.target.value }; setEditItems(u); }} />
                  </div>
                  <div className="p-1.5 col-span-2">
                    <input type="number" className="w-full px-1 py-1 text-[13px] rounded border text-right font-mono" style={{ borderColor: "#E0E7EF" }}
                      value={item.qty} onChange={(e) => { const u = [...editItems]; const qty = parseFloat(e.target.value) || 0; u[i] = { ...u[i], qty, amount: +(qty * u[i].rate).toFixed(2) }; setEditItems(u); }} />
                  </div>
                  <div className="p-1.5 col-span-2">
                    <input type="number" className="w-full px-1 py-1 text-[13px] rounded border text-right font-mono" style={{ borderColor: "#E0E7EF" }}
                      value={item.rate} onChange={(e) => { const u = [...editItems]; const rate = parseFloat(e.target.value) || 0; u[i] = { ...u[i], rate, amount: +(u[i].qty * rate).toFixed(2) }; setEditItems(u); }} />
                  </div>
                  <div className="p-1.5 col-span-2 text-right font-mono">{formatCurrency(item.amount)}</div>
                  <div className="p-1.5 col-span-1 text-center">
                    <button onClick={() => setEditItems(editItems.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-[13px]">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setEditItems([...editItems, { description: "", unit: "", qty: 1, rate: 0, amount: 0 }])}
                className="text-[13px] font-semibold px-3 py-1.5 rounded-lg" style={{ color: "#1565C0", background: "#EBF2FF" }}
              >
                + Add Row
              </button>
              <button
                onClick={async () => {
                  if (!onSaveItems) return;
                  setSavingItems(true);
                  await onSaveItems(q.id, editItems);
                  setSavingItems(false);
                  setEditing(false);
                }}
                disabled={savingItems}
                className="text-[13px] font-semibold px-4 py-1.5 rounded-lg text-white" style={{ background: "#1565C0" }}
              >
                {savingItems ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditing(false)} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg" style={{ color: "#546E7A" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {q.pdf_status === "generating" && (
          <div className="flex items-center gap-2 text-sm mb-3" style={{ color: "#1565C0" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…
          </div>
        )}

        {q.pdf_url && q.pdf_status === "ready" && (
          <div className="flex gap-2 mb-3">
              <button
                onClick={async () => {
                  const storedUrl = q.pdf_url!;
                  // Old records may have a full signed URL — extract the storage path
                  let path = storedUrl;
                  if (storedUrl.startsWith("http")) {
                    const match = storedUrl.match(/quotation-pdfs\/(.+?)(?:\?|$)/);
                    if (match) {
                      path = decodeURIComponent(match[1]);
                    } else {
                      toast.error("Invalid PDF path — please regenerate the PDF");
                      return;
                    }
                  }
                  try {
                    const blob = await downloadFromStorage("quotation-pdfs", path);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = path.split("/").pop() || "quotation.pdf";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error("Download error:", error);
                    toast.error("Failed to download PDF — please regenerate it");
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all"
                style={{
                  background: "linear-gradient(135deg,#1565C0,#2979FF)",
                  color: "white",
                  boxShadow: "0 2px 8px rgba(21,101,192,0.3)",
                }}
              >
                <Download className="h-3 w-3" />Download PDF
              </button>
            {isApproved && onSend && !readOnly ? (
              <button
                onClick={onSend}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all"
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
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold opacity-40"
                style={{ background: "#F0F4F8", color: "#546E7A" }}
              >
                <Send className="h-3 w-3" />Send to Client
              </button>
            )}
          </div>
        )}

        {q.pdf_status === "failed" && (
          <div className="mb-3">
            <p className="text-[13px] mb-2" style={{ color: "#C62828" }}>PDF generation failed.</p>
            {onRegeneratePdf && (
              <button
                onClick={() => onRegeneratePdf(q)}
                disabled={pdfLoading === q.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
                style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}
              >
                {pdfLoading === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Retry PDF
              </button>
            )}
          </div>
        )}

        {onRegeneratePdf && q.pdf_url && q.pdf_status === "ready" && (
          <button
            onClick={() => onRegeneratePdf(q)}
            disabled={pdfLoading === q.id}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium mb-3"
            style={{ color: "#546E7A", background: "#F0F4F8" }}
          >
            {pdfLoading === q.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
            Regenerate PDF
          </button>
        )}

        {q.status === "draft" && !readOnly && canRevise && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {canApprove && (
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
            <button
              onClick={() => variantNavigate(`/enquiries/${q.enquiry_id}/quotation/${q.id}`)}
              className="w-full py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "#EBF2FF", color: "#1565C0" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#DBEAFE"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#EBF2FF"; }}
            >
              Revise
            </button>
          </div>
        )}
        {q.status === "sent" && !readOnly && canRevise && (
          <button
            onClick={() => variantNavigate(`/enquiries/${q.enquiry_id}/quotation?fromVersion=${q.id}`)}
            className="w-full py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#FDE68A"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FEF3C7"; }}
          >
            Create Revision
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
  const { canAssignEnquiry, canEditEnquiry, canEditQuotation } = useRole();
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState<Quotation | null>(null);
  const [approving, setApproving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "quotations");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendChannelEmail, setSendChannelEmail] = useState(true);
  const [sendChannelWhatsapp, setSendChannelWhatsapp] = useState(true);
  const [sending, setSending] = useState(false);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [markingLost, setMarkingLost] = useState(false);
  const [wonModalOpen, setWonModalOpen] = useState(false);
  const [markingWon, setMarkingWon] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const enq = await apiClient.get<Enquiry>(`/enquiries/${id}`);
      setEnquiry(enq);
      const [clientData, quots] = await Promise.all([
        apiClient.get<Client>(`/clients/${enq.client_id}`),
        apiClient.get<Quotation[]>("/quotations", { enquiry_id: id }),
      ]);
      setClient(clientData);
      setQuotations(quots ?? []);
    } catch {
      setEnquiry(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (enquiry) {
      setContactName((enquiry as any).contact_person_name ?? "");
      setContactPhone((enquiry as any).contact_person_phone ?? "");
    }
  }, [enquiry]);

  const handleSaveContact = async () => {
    if (!enquiry) return;
    setSavingContact(true);
    try {
      await apiClient.patch(`/enquiries/${enquiry.id}`, {
        contact_person_name: contactName.trim() || null,
        contact_person_phone: contactPhone.trim() || null,
      });
      setEditingContact(false);
      toast.success("Contact person updated");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to update contact");
    } finally {
      setSavingContact(false);
    }
  };

  const handleAssign = async (userId: string | null) => {
    if (!enquiry || !user) return;
    try {
      await apiClient.patch(`/enquiries/${enquiry.id}`, { assigned_to: userId });
      setEnquiry({ ...enquiry, assigned_to: userId });

      await apiClient.post(`/enquiries/${enquiry.id}/events`, {
        event_type: "assigned",
        metadata: { description: userId ? "Enquiry assigned to a team member" : "Enquiry unassigned" },
      });

      if (userId) {
        await apiClient.post("/notifications", {
          user_id: userId,
          type: "assignment",
          title: `Assigned to ${enquiry.ref_number}`,
          body: `You have been assigned to enquiry ${enquiry.ref_number}`,
          enquiry_id: enquiry.id,
          link: `/enquiries/${enquiry.id}`,
        });
      }
      toast.success(userId ? "Enquiry assigned" : "Enquiry unassigned");
    } catch {
      toast.error("Failed to assign");
    }
  };

  const isConsultancy = enquiry?.service_type === "consultancy";

  const handleSaveLineItems = async (quotationId: string, newItems: LineItem[]) => {
    const qRow = await apiClient.get<Quotation>(`/quotations/${quotationId}`);
    const gstPct = Number(qRow?.gst_rate) || 0;
    const subtotal = newItems.reduce((sum, it) => sum + it.amount, 0);
    const gstAmount = +(subtotal * (gstPct / 100)).toFixed(2);
    const total = +(subtotal + gstAmount).toFixed(2);
    const mobilisationCost = newItems.find((it) => it.description.toLowerCase().includes("mobilis"))?.amount ?? 0;
    const drillingCost = newItems.filter((it) => it.description.toLowerCase().includes("drill") || it.description.toLowerCase().includes("core")).reduce((s, it) => s + it.amount, 0);
    const reportingCost = newItems.filter((it) => it.section === "D" || it.description.toLowerCase().includes("report") || it.description.toLowerCase().includes("boring log")).reduce((s, it) => s + it.amount, 0);
    try {
      await apiClient.patch(`/quotations/${quotationId}`, {
        line_items: JSON.stringify(newItems),
        subtotal: +subtotal.toFixed(2),
        gst_amount: gstAmount,
        total_amount: total,
        mobilisation_cost: +mobilisationCost.toFixed(2),
        drilling_cost: +drillingCost.toFixed(2),
        reporting_cost: +reportingCost.toFixed(2),
        pdf_status: null,
        pdf_url: null,
      });
    } catch (e) { toast.error("Failed to save: " + (e as Error).message); return; }
    toast.success("Line items updated — please regenerate the PDF.");
    fetchAll();
  };

  const generatePdf = async (q: Quotation) => {
    if (!client || !enquiry) return;
    setPdfLoading(q.id);
    await apiClient.patch(`/quotations/${q.id}`, { pdf_status: "generating" });
    try {
      const isConsultancyQuote = (q as any).service_type === "consultancy" || isConsultancy;
      const qTemplateType = q.template_type ?? TEMPLATE_IDS.ORIGINAL_SI;
      const isBoq = isBoqTemplate(qTemplateType);

      let allNoteKeys: string[];
      let paymentTermsKey: string;
      if (isBoq) {
        const boqNum = qTemplateType === TEMPLATE_IDS.BOQ_TYPE_1 ? "1" : qTemplateType === TEMPLATE_IDS.BOQ_TYPE_2 ? "2" : "3";
        const noteCount = boqNum === "1" ? 8 : boqNum === "2" ? 5 : 10;
        allNoteKeys = Array.from({ length: noteCount }, (_, i) => `boq${boqNum}_note_${i + 1}`);
        paymentTermsKey = `boq${boqNum}_payment_terms`;
      } else if (isConsultancyQuote) {
        allNoteKeys = Array.from({ length: 5 }, (_, i) => `consultancy_note_${i + 1}`);
        paymentTermsKey = "consultancy_payment_terms";
      } else {
        allNoteKeys = Array.from({ length: 10 }, (_, i) => `quotation_note_${i + 1}`);
        paymentTermsKey = "quotation_payment_terms";
      }

      const COMPANY_KEYS = [
        "company_name", "company_state", "gst_number", "company_pan",
        "company_address", "bank_account_name", "bank_name",
        "bank_account_number", "bank_account_type", "bank_branch", "bank_ifsc",
      ];
      const pdfSettings = await apiClient.get<{ key: string; value: string }[]>("/settings", {
        keys: ["quotation_validity_days", ...allNoteKeys, paymentTermsKey, "quotation_footer_text", ...COMPANY_KEYS].join(","),
      });
      const pdfSettingsMap: Record<string, string> = {};
      pdfSettings?.forEach((r) => { pdfSettingsMap[r.key] = r.value; });
      const validityDays = parseInt(pdfSettingsMap.quotation_validity_days ?? "30", 10) || 30;
      const notes = allNoteKeys.map((k) => pdfSettingsMap[k]).filter(Boolean);
      const paymentTerms = pdfSettingsMap[paymentTermsKey] || undefined;
      const footerText = pdfSettingsMap.quotation_footer_text || undefined;

      const consultancyData = (enquiry as any).consultancy_data;
      const projectScope = consultancyData?.scope || undefined;

      const boqTemplate = isBoq ? getTemplateById(qTemplateType) : null;

      let pdfElement: React.ReactElement;
      if (boqTemplate) {
        let projectHeader;
        try {
          const vn = (q as any).variant_notes ? JSON.parse((q as any).variant_notes) : {};
          projectHeader = vn.projectHeader;
        } catch {}
        pdfElement = (
          <BOQTemplatePDF
            quotation={q}
            client={client}
            enquiry={enquiry}
            template={boqTemplate}
            companyInfo={getCompanyInfoFromSettings(pdfSettingsMap)}
            projectHeader={projectHeader}
            validityDays={validityDays}
            terms={notes.length > 0 ? notes : undefined}
            paymentTerms={paymentTerms}
            footerText={footerText}
          />
        );
      } else if (isConsultancyQuote) {
        pdfElement = (
          <ConsultancyPDF
            quotation={q}
            client={client}
            enquiry={enquiry}
            projectScope={projectScope}
            validityDays={validityDays}
            terms={notes.length > 0 ? notes : undefined}
            paymentTerms={paymentTerms}
            footerText={footerText}
          />
        );
      } else {
        pdfElement = (
          <QuotationPDF
            quotation={q}
            client={client}
            enquiry={enquiry}
            validityDays={validityDays}
            terms={notes.length > 0 ? notes : undefined}
            paymentTerms={paymentTerms}
            footerText={footerText}
          />
        );
      }
      const blob = await pdf(pdfElement).toBlob();
      const year = new Date().getFullYear();
      const filename = `${enquiry.ref_number}-v${q.version}-${q.variant}.pdf`;
      const path = `${year}/${enquiry.ref_number}/${filename}`;
      await uploadToStorage("quotation-pdfs", path, blob, { upsert: true, contentType: "application/pdf" });
      await apiClient.patch(`/quotations/${q.id}`, { pdf_url: path, pdf_status: "ready" });
      toast.success("PDF generated successfully");
    } catch (err: any) {
      await apiClient.patch(`/quotations/${q.id}`, { pdf_status: "failed" });
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
      // Transactional approve: marks approved, supersedes other variants, moves
      // the enquiry to 'pending', and logs the event — all server-side.
      try {
        await apiClient.post(`/quotations/${approveTarget.id}/approve`);
      } catch (e) {
        if ((e as { status?: number }).status === 409) {
          toast.error("Another variant was just approved — please refresh the page.");
          setApproving(false); setApproveTarget(null); return;
        }
        throw e;
      }
      toast.success(`Variant ${approveTarget.variant} approved successfully!`);
      const approvedId = approveTarget.id;
      setApproveTarget(null);
      await fetchAll();
      const updatedQ = await apiClient.get<Quotation>(`/quotations/${approvedId}`);
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

      const subject = `Quotation — ${enquiry.ref_number}`;
      const validitySettings = await apiClient.get<{ key: string; value: string }[]>("/settings", { keys: "quotation_validity_days" });
      const validityDays = parseInt(validitySettings[0]?.value ?? "30", 10) || 30;
      const validityDate = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

      let emailSent = false;
      let whatsappSent = false;

      if (sendChannelEmail && client.email && !client.email_bounced) {
        const { ok, error: emailErr } = await sendNotification({
          to: client.email,
          template: "quotation_sent",
          params: {
            client_name: client.name,
            ref_number: enquiry.ref_number,
            total_amount: formatCurrency(approvedQuotation.total_amount),
            validity_date: validityDate,
          },
          attachmentPath: approvedQuotation.pdf_url ?? undefined,
        });
        if (!ok) {
          console.error("Email send error:", emailErr);
          toast.error("Email delivery failed — continuing.");
        } else {
          emailSent = true;
          await apiClient.post("/communications", {
            enquiry_id: enquiry.id,
            client_id: client.id,
            channel: "email",
            direction: "outbound",
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
        let waData: { error?: string; whatsapp_invalid?: boolean } = {};
        try {
          waData = await apiClient.post<{ error?: string; whatsapp_invalid?: boolean }>("/integrations/whatsapp", {
            phone_number: client.whatsapp_number,
            template_name: "qms_quotation_sent",
            parameters: [
              { name: "client_name", value: client.name },
              { name: "ref_number", value: enquiry.ref_number },
              { name: "amount", value: formattedAmount },
              { name: "validity_days", value: String(validityDays) },
            ],
          });
        } catch (e) {
          waData = { error: (e as Error).message };
        }
        if (waData?.error) {
          console.error("WhatsApp send error:", waData.error);
          if (waData?.whatsapp_invalid) {
            await apiClient.patch(`/clients/${client.id}`, { whatsapp_invalid: true });
          }
          toast.error("WhatsApp delivery failed — continuing.");
        } else {
          whatsappSent = true;
          await apiClient.post("/communications", {
            enquiry_id: enquiry.id,
            client_id: client.id,
            channel: "whatsapp",
            direction: "outbound",
            subject: `WhatsApp: Quotation ${enquiry.ref_number}`,
            body: "Quotation WhatsApp sent",
            status: "sent",
            sent_by: user?.id ?? null,
          });
        }
      }

      await apiClient.patch(`/quotations/${approvedQuotation.id}`, {
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      const prevStatus = enquiry.status;
      await apiClient.patch(`/enquiries/${enquiry.id}`, { status: "sent" });

      // Create follow-up cadence (Day 1, 3, 5, 15, 30)
      const settingsRows = await apiClient.get<{ key: string; value: string }[]>("/settings", {
        keys: "auto_followup_after_quote",
      });
      const settingsMap = new Map(settingsRows.map((r) => [r.key, r.value]));
      const autoFollowupEnabled = (settingsMap.get("auto_followup_after_quote") ?? "true") !== "false";

      if (autoFollowupEnabled) {
        try {
          await createFollowUpCadence(enquiry.id);
        } catch {
          // Non-blocking
        }
      }

      await apiClient.post(`/enquiries/${enquiry.id}/events`, {
        event_type: "quotation_sent",
        from_status: prevStatus,
        to_status: "sent",
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

  const handleMarkLost = async () => {
    if (!enquiry) return;
    setMarkingLost(true);
    try {
      const prevStatus = enquiry.status;
      await apiClient.patch(`/enquiries/${enquiry.id}`, {
        status: "lost",
        lost_date: new Date().toISOString().slice(0, 10),
        lost_reason: lostReason || null,
      });
      await apiClient.post(`/enquiries/${enquiry.id}/events`, {
        event_type: "marked_lost",
        from_status: prevStatus,
        to_status: "lost",
        metadata: lostReason ? { reason: lostReason } : null,
      });
      toast.success("Enquiry marked as lost.");
      setLostModalOpen(false);
      setLostReason("");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as lost");
    } finally {
      setMarkingLost(false);
    }
  };

  const handleMarkWon = async () => {
    if (!enquiry) return;
    // A deal can only be Won if a real quotation was finalized (approved/sent/accepted).
    // This keeps the pipeline consistent — no advancing to payment/mobilisation off a draft.
    const finalizedQuote = quotations.find((q) => ["approved", "sent", "accepted"].includes(q.status));
    if (!finalizedQuote) {
      toast.error("Approve and send a quotation to the client before marking this enquiry as Won.");
      setWonModalOpen(false);
      return;
    }
    setMarkingWon(true);
    try {
      const prevStatus = enquiry.status;
      // Mark the winning quotation as accepted so the quote status mirrors the deal.
      await apiClient.patch(`/quotations/${finalizedQuote.id}`, { status: "accepted" });
      await apiClient.patch(`/enquiries/${enquiry.id}`, {
        status: "approved",
        confirmed_date: new Date().toISOString().slice(0, 10),
      });

      await apiClient.post(`/enquiries/${enquiry.id}/events`, {
        event_type: "status_change",
        from_status: prevStatus,
        to_status: "approved",
        metadata: { trigger: "marked_won" },
      });

      // Create payment record (50% advance) from the winning quotation.
      if (Number(finalizedQuote.total_amount) > 0) {
        const advanceAmount = Math.round(Number(finalizedQuote.total_amount) * 0.5);
        await apiClient.post("/payments", {
          enquiry_id: enquiry.id,
          quotation_id: finalizedQuote.id,
          payment_type: "advance",
          amount_requested: advanceAmount,
          status: "pending_request",
        });
      }

      // Create job completion tracker (idempotent get-or-create)
      await apiClient.post("/job-completion", { enquiry_id: enquiry.id });

      // Cancel pending follow-ups
      await cancelPendingFollowUps(enquiry.id);

      toast.success("Deal marked as Won! Payment record and job tracker created.");
      setWonModalOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as won");
    } finally {
      setMarkingWon(false);
    }
  };

  const handleReactivate = async () => {
    if (!enquiry) return;
    setReactivating(true);
    try {
      const prevStatus = enquiry.status;
      await apiClient.patch(`/enquiries/${enquiry.id}`, {
        status: "follow_up",
        lost_date: null,
        lost_reason: null,
      });
      await apiClient.post(`/enquiries/${enquiry.id}/events`, {
        event_type: "reactivated",
        from_status: prevStatus,
        to_status: "follow_up",
      });
      toast.success("Enquiry reactivated — moved to Follow Up.");
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate");
    } finally {
      setReactivating(false);
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
  const showJobTabs = ["payment_received", "mobilization_scheduled", "job_active", "confirmed", "completed"].includes(enquiry.status);
  const showMobilisation = ["approved", "payment_received", "mobilization_scheduled", "job_active", "confirmed", "completed"].includes(enquiry.status);

  const showSiteVisitTab = !["job_active", "completed"].includes(enquiry.status);

  // Pre-sale, still-open statuses where quoting / revising / marking-lost makes sense.
  // Once Won (approved) or beyond — payment/mobilisation/job/completed — the deal is
  // closed: no new/revised quotations and no "Mark as Lost".
  const PRE_SALE_STATUSES = ["new", "intake_pending", "pending", "sent", "follow_up", "negotiation"];
  const canQuote = PRE_SALE_STATUSES.includes(enquiry.status);
  const isTerminal = ["lost", "inactive", "completed"].includes(enquiry.status);

  const allTabs = [
    { key: "quotations", label: "Quotations" },
    ...(showSiteVisitTab ? [{ key: "site-visits", label: "Site Visits" }] : []),
    { key: "follow-ups", label: "Follow-ups" },
    { key: "payments", label: "Payments" },
    { key: "communications", label: "Communications" },
    ...(showMobilisation ? [{ key: "mobilisation", label: "Mobilisation" }] : []),
    ...(showJobTabs ? [{ key: "job", label: "Job Completion" }] : []),
    { key: "activity", label: "Activity" },
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
                fontSize: "13px",
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
          <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#546E7A" }}>
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

        {/* Contact Person */}
        <div style={{ padding: "20px", borderBottom: "1px solid #E0E7EF" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#546E7A" }}>
              Contact Person
            </p>
            {canEditEnquiry && !editingContact && (
              <button
                onClick={() => setEditingContact(true)}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                title="Edit contact"
              >
                <Pencil style={{ width: "12px", height: "12px", color: "#546E7A" }} />
              </button>
            )}
          </div>
          {editingContact ? (
            <div className="space-y-2">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "8px",
                  border: "1px solid #CBD5E1", fontSize: "13px", outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#1565C0"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#CBD5E1"; }}
              />
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "8px",
                  border: "1px solid #CBD5E1", fontSize: "13px", fontFamily: "JetBrains Mono, monospace", outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#1565C0"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#CBD5E1"; }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveContact}
                  disabled={savingContact}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
                  style={{ background: "#1565C0", color: "white" }}
                >
                  {savingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save style={{ width: "12px", height: "12px" }} />}
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingContact(false);
                    setContactName((enquiry as any).contact_person_name ?? "");
                    setContactPhone((enquiry as any).contact_person_phone ?? "");
                  }}
                  className="flex-1 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
                  style={{ background: "#F0F4F8", color: "#546E7A" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            (() => {
              const name = (enquiry as any).contact_person_name;
              const phone = (enquiry as any).contact_person_phone;
              const hasContact = name || phone;
              return hasContact ? (
                <div className="space-y-2">
                  {name && (
                    <div className="flex items-center gap-2">
                      <UserCircle style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0 }} />
                      <span className="text-sm font-semibold" style={{ color: "#0A1929" }}>{name}</span>
                    </div>
                  )}
                  {phone && (
                    <div className="flex items-center gap-2">
                      <Phone style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0 }} />
                      <span className="text-sm font-mono" style={{ color: "#546E7A" }}>{phone}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: "#90A4AE" }}>
                  {client ? `Falls back to ${client.name}` : "Not set"}
                </p>
              );
            })()
          )}
        </div>

        {/* Assigned To */}
        <div style={{ padding: "20px", borderBottom: "1px solid #E0E7EF" }}>
          <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#546E7A" }}>
            Assigned To
          </p>
          <AssigneeDropdown
            value={enquiry.assigned_to}
            onChange={handleAssign}
            disabled={!canAssignEnquiry}
          />
        </div>

        {/* Site / project info */}
        <div style={{ padding: "20px", borderBottom: "1px solid #E0E7EF" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#546E7A" }}>
              {isConsultancy ? "Project Details" : "Site Details"}
            </p>
            <span
              className="text-[12px] font-semibold px-2 py-0.5 rounded"
              style={{
                background: isConsultancy ? "#EDE7F6" : "#E3F2FD",
                color: isConsultancy ? "#6A1B9A" : "#1565C0",
              }}
            >
              {isConsultancy ? "CONSULTANCY" : "SOIL INVESTIGATION"}
            </span>
          </div>
          {isConsultancy ? (
            <div className="space-y-2">
              {enquiry.site_address && (
                <div style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                  <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Site Address</p>
                  <div className="flex items-start gap-2">
                    <MapPin style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0, marginTop: "2px" }} />
                    <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>
                      {enquiry.site_address}{enquiry.site_city ? `, ${enquiry.site_city}` : ""}
                    </p>
                  </div>
                </div>
              )}
              {(enquiry as any).consultancy_data?.scope && (
                <div style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                  <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Project Scope</p>
                  <p className="text-sm" style={{ color: "#0A1929" }}>{(enquiry as any).consultancy_data.scope}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                  <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>City</p>
                  <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>{enquiry.site_city}</p>
                </div>
                <div style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                  <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Type</p>
                  <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>Consultancy</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {enquiry.site_address && (
                <div style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                  <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Site Address</p>
                  <div className="flex items-start gap-2">
                    <MapPin style={{ width: "13px", height: "13px", color: "#546E7A", flexShrink: 0, marginTop: "2px" }} />
                    <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>
                      {enquiry.site_address}{enquiry.site_city ? `, ${enquiry.site_city}` : ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Structure", enquiry.structure_type ? (structureTypeLabels[enquiry.structure_type] || enquiry.structure_type) : "—"],
                  ["Bores", enquiry.num_bores != null ? enquiry.num_bores.toString() : "—"],
                  ["Depth", enquiry.expected_depth_m ? `${enquiry.expected_depth_m}m` : "TBD"],
                  ["Soil Hint", enquiry.soil_type_hint ? (soilTypeLabels[enquiry.soil_type_hint] || enquiry.soil_type_hint) : "Not specified"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "#F0F4F8", borderRadius: "12px", padding: "12px" }}>
                    <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>{label}</p>
                    <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {enquiry.remarks && !enquiry.remarks.startsWith("---EXTENDED_DATA---") && (
            <div className="mt-2" style={{ background: "#FFFBEB", borderRadius: "12px", padding: "12px" }}>
              <p className="text-[12px] uppercase tracking-wide mb-1" style={{ color: "#92400E" }}>Remarks</p>
              <p className="text-sm" style={{ color: "#78350F" }}>{enquiry.remarks}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {canEditEnquiry && (
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {canQuote && (
              <button
                onClick={() => navigate(`/enquiries/${enquiry!.id}/quotation`)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg,#1565C0,#2979FF)",
                  color: "white",
                  boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
              >
                {quotations.length > 0 ? "Create New Quotation" : isConsultancy ? "Create Consultancy Quote" : "Create Quotation"}
              </button>
            )}
            {!isTerminal && (
              <button
                onClick={() => setActiveTab("follow-ups")}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#F0F4F8", color: "#0A1929" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#E8EEF5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#F0F4F8"; }}
              >
                Add Follow-up
              </button>
            )}
            {["sent", "follow_up", "negotiation"].includes(enquiry.status) && (
              <button
                onClick={() => setWonModalOpen(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
                style={{
                  background: "linear-gradient(135deg, #15803D, #22C55E)",
                  color: "white",
                  boxShadow: "0 4px 12px rgba(21,128,61,0.3)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
              >
                <Trophy className="h-3.5 w-3.5" /> Mark as Won
              </button>
            )}
            {(enquiry.status === "lost" || enquiry.status === "inactive") && (
              <button
                onClick={handleReactivate}
                disabled={reactivating}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: "#EBF2FF", color: "#1565C0", border: "1px solid #BFDBFE" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#DBEAFE"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#EBF2FF"; }}
              >
                {reactivating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reactivating…</> : "Reactivate Enquiry"}
              </button>
            )}
            {canQuote && (
              <button
                onClick={() => setLostModalOpen(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
                style={{ background: "#FEF2F2", color: "#C62828", border: "1px solid #FECACA" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#FEE2E2"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#FEF2F2"; }}
              >
                <XCircle className="h-3.5 w-3.5" /> Mark as Lost
              </button>
            )}
          </div>
        )}
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
          {/* Mobilisation tab */}
          {showMobilisation && activeTab === "mobilisation" && (
            <MobilisationSection
              enquiryId={enquiry.id}
              enquiry={{ id: enquiry.id, ref_number: enquiry.ref_number, site_city: enquiry.site_city, client_id: enquiry.client_id }}
              onStatusChange={fetchAll}
            />
          )}

          {activeTab === "site-visits" && (
            <div className="space-y-4">
              {enquiry.service_type === "soil_investigation" && (
                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: "#FFFFFF", border: "1px solid #E0E7EF" }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#0A1929" }}>Is site visit required?</p>
                    <p className="text-[13px]" style={{ color: "#546E7A" }}>
                      {canQuote
                        ? "Set this to guide the workflow for this enquiry"
                        : "Locked — this enquiry has moved past the site-visit stage"}
                    </p>
                  </div>
                  {canQuote ? (
                    <div className="flex gap-1.5">
                      {([
                        { value: true, label: "Required", bg: "#DCFCE7", color: "#15673A", border: "#86EFAC" },
                        { value: false, label: "Not Required", bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
                      ] as const).map((opt) => (
                        <button
                          key={String(opt.value)}
                          onClick={async () => {
                            await apiClient.patch(`/enquiries/${enquiry.id}`, { site_visit_required: opt.value });
                            setEnquiry((prev) => prev ? { ...prev, site_visit_required: opt.value } : prev);
                          }}
                          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
                          style={{
                            background: enquiry.site_visit_required === opt.value ? opt.bg : "#F0F4F8",
                            color: enquiry.site_visit_required === opt.value ? opt.color : "#546E7A",
                            border: enquiry.site_visit_required === opt.value ? `1.5px solid ${opt.border}` : "1.5px solid #E0E7EF",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span
                      className="px-3 py-1.5 rounded-lg text-[13px] font-semibold"
                      style={enquiry.site_visit_required === false
                        ? { background: "#FEF2F2", color: "#B91C1C", border: "1.5px solid #FECACA" }
                        : { background: "#DCFCE7", color: "#15673A", border: "1.5px solid #86EFAC" }}
                    >
                      {enquiry.site_visit_required === false ? "Not Required" : "Required"}
                    </span>
                  )}
                </div>
              )}

              {enquiry.site_visit_required === false ? (
                <div
                  className="rounded-xl p-10 text-center"
                  style={{ background: "#FFFFFF", border: "1px solid #E0E7EF" }}
                >
                  <MapPin className="mx-auto mb-3 h-10 w-10" style={{ color: "#94A3B8" }} />
                  <p className="text-sm font-medium" style={{ color: "#546E7A" }}>
                    Site visit marked as not required for this enquiry.
                  </p>
                  <p className="text-[13px] mt-1" style={{ color: "#94A3B8" }}>
                    Proceed directly to quotation based on available information.
                  </p>
                </div>
              ) : (
                <SiteVisitSection enquiryId={enquiry.id} readOnly={!canQuote} />
              )}
            </div>
          )}

          {activeTab === "quotations" && (
            <div className="space-y-4">
              {/* Per-enquiry intake link — only while intake is relevant for a soil-investigation job */}
              {!isConsultancy && ["new", "intake_pending", "pending"].includes(enquiry.status) && (
                <IntakeLinkCard enquiryId={enquiry.id} clientId={enquiry.client_id} refNumber={enquiry.ref_number} />
              )}
              {quotations.length === 0 ? (
                <div
                  className="rounded-xl p-12 text-center"
                  style={{ background: "#FFFFFF", border: "1px solid #E0E7EF" }}
                >
                  <AlertTriangle className="mx-auto mb-3 h-10 w-10" style={{ color: "#E65100" }} />
                  <p className="mb-4" style={{ color: "#546E7A" }}>
                    No quotations yet. Create your first quotation to get started.
                  </p>
                  <Button
                    onClick={() => navigate(`/enquiries/${enquiry!.id}/quotation`)}
                    style={{
                      background: "linear-gradient(135deg,#1565C0,#2979FF)",
                      color: "white",
                      boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
                      border: "none",
                    }}
                  >
                    Create Quotation
                  </Button>
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
                      onSaveItems={handleSaveLineItems}
                      readOnly={!canEditEnquiry}
                      canApprove={canEditQuotation}
                      onRegeneratePdf={generatePdf}
                      canRevise={canQuote}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "follow-ups" && <FollowUpsTab enquiryId={enquiry.id} />}
          {activeTab === "payments" && <PaymentsTab enquiryId={enquiry.id} onStatusChange={fetchAll} />}
          {activeTab === "communications" && <CommunicationTab enquiryId={enquiry.id} />}
          {activeTab === "job" && showJobTabs && <JobCompletionTab enquiryId={enquiry.id} />}
          {activeTab === "activity" && <ActivityTimeline enquiryId={enquiry.id} />}
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
                  {client?.email_bounced && <span className="ml-2 text-[13px]" style={{ color: "#C62828" }}>(bounced)</span>}
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
                  {client?.whatsapp_invalid && <span className="ml-2 text-[13px]" style={{ color: "#C62828" }}>(invalid)</span>}
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
          <p className="text-[13px]" style={{ color: "#546E7A" }}>Other draft variants will be superseded.</p>
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

      {/* Mark as Lost modal */}
      <Dialog open={lostModalOpen} onOpenChange={(o) => { if (!o) { setLostModalOpen(false); setLostReason(""); } }}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#C62828", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
              Mark Enquiry as Lost
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm mb-3" style={{ color: "#546E7A" }}>
            This will mark <span className="font-mono font-semibold" style={{ color: "#0A1929" }}>{enquiry?.ref_number}</span> as lost. This action can be reversed by changing the status later.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: "#0A1929" }}>Reason (optional)</label>
            <textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="e.g. Client chose competitor, budget constraints, project cancelled..."
              rows={3}
              className="w-full rounded-lg text-sm"
              style={{ border: "1.5px solid #E0E7EF", padding: "10px 14px", resize: "none", outline: "none" }}
            />
          </div>
          <DialogFooter className="mt-4">
            <button
              onClick={() => { setLostModalOpen(false); setLostReason(""); }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              onClick={handleMarkLost}
              disabled={markingLost}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "#C62828", color: "white" }}
            >
              {markingLost ? <><Loader2 className="h-4 w-4 animate-spin" />Marking…</> : <><XCircle className="h-4 w-4" />Mark as Lost</>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Won modal */}
      <Dialog open={wonModalOpen} onOpenChange={(o) => { if (!o) setWonModalOpen(false); }}>
        <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#15803D", fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
              Mark Deal as Won
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm mb-3" style={{ color: "#546E7A" }}>
            This will mark <span className="font-mono font-semibold" style={{ color: "#0A1929" }}>{enquiry?.ref_number}</span> as Won. This will:
          </p>
          <ul className="text-sm space-y-1.5 mb-4" style={{ color: "#546E7A" }}>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> Create an advance payment request (50%)</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> Create a job completion tracker</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> Cancel all pending follow-ups</li>
          </ul>
          <DialogFooter>
            <button
              onClick={() => setWonModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
            >
              Cancel
            </button>
            <button
              onClick={handleMarkWon}
              disabled={markingWon}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #15803D, #22C55E)",
                color: "white",
                boxShadow: "0 4px 12px rgba(21,128,61,0.3)",
              }}
            >
              {markingWon ? <><Loader2 className="h-4 w-4 animate-spin" />Marking…</> : <><Trophy className="h-4 w-4" />Mark as Won</>}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
