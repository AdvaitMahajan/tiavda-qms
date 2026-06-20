import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { uploadToStorage, getPublicStorageUrl } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { AssigneeDropdown } from "@/components/AssigneeDropdown";
import { toast } from "sonner";
import {
  MapPin, Calendar, User, AlertTriangle, CheckCircle2,
  Plus, ChevronDown, ChevronUp, Loader2, ClipboardCheck,
  Droplets, ShieldCheck, Lock, Fence, Camera, X, Image as ImageIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

type SiteVisit = Tables<"site_visits">;

const FEASIBILITY_OPTIONS = [
  { value: "feasible", label: "Feasible", color: "#15673A", bg: "#DCFCE7" },
  { value: "conditional", label: "Conditional", color: "#92400E", bg: "#FEF3C7" },
  { value: "not_feasible", label: "Not Feasible", color: "#B91C1C", bg: "#FEE2E2" },
] as const;

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: "#DBEAFE", color: "#1565C0", label: "Scheduled" },
  in_progress: { bg: "#FEF3C7", color: "#92400E", label: "In Progress" },
  completed: { bg: "#DCFCE7", color: "#15673A", label: "Completed" },
  cancelled: { bg: "#F1F5F9", color: "#546E7A", label: "Cancelled" },
};

const COST_FACTOR_PRESETS = [
  "Difficult terrain access",
  "Water tanker required",
  "Rock coring expected",
  "Extended depth drilling",
  "Security arrangement needed",
  "Generator required",
  "Basement level access",
  "High water table",
];

interface Props {
  enquiryId: string;
  /** When true, the site-visit stage is over (enquiry won/mobilised): view-only,
   * no scheduling or completing. */
  readOnly?: boolean;
}

export function SiteVisitSection({ enquiryId, readOnly = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SiteVisit | null>(null);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["site-visits", enquiryId],
    queryFn: () => apiClient.get<SiteVisit[]>("/site-visits", { enquiry_id: enquiryId }),
  });

  const hasNotFeasible = visits.some((v) => v.feasibility === "not_feasible" && v.status === "completed");

  return (
    <div className="space-y-4">
      {hasNotFeasible && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
        >
          <AlertTriangle style={{ width: "20px", height: "20px", color: "#B91C1C", flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#B91C1C" }}>Site Feasibility Warning</p>
            <p className="text-[13px]" style={{ color: "#991B1B" }}>
              A completed site visit marked this location as <strong>Not Feasible</strong>. Review observations before proceeding with quotation.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3
          className="font-semibold text-base"
          style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
        >
          Site Visits ({visits.length})
        </h3>
        {!readOnly && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg,#1565C0,#2979FF)",
              color: "white",
              boxShadow: "0 2px 8px rgba(21,101,192,0.3)",
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Schedule Visit
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#E0E7EF" }} />
          ))}
        </div>
      ) : visits.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: "#FFFFFF", border: "1px solid #E0E7EF" }}
        >
          <MapPin className="mx-auto mb-3 h-10 w-10" style={{ color: "#546E7A" }} />
          <p className="text-sm" style={{ color: "#546E7A" }}>
            {readOnly
              ? "No site visits were recorded for this enquiry."
              : "No site visits scheduled. Schedule one to capture field observations."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              expanded={expandedId === visit.id}
              onToggle={() => setExpandedId(expandedId === visit.id ? null : visit.id)}
              onComplete={() => setCompleteTarget(visit)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      <ScheduleDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        enquiryId={enquiryId}
        userId={user?.id ?? null}
        queryClient={queryClient}
      />

      {completeTarget && (
        <CompleteDialog
          visit={completeTarget}
          onClose={() => setCompleteTarget(null)}
          userId={user?.id ?? null}
          queryClient={queryClient}
          enquiryId={enquiryId}
        />
      )}
    </div>
  );
}

function VisitCard({
  visit, expanded, onToggle, onComplete, readOnly = false,
}: {
  visit: SiteVisit; expanded: boolean; onToggle: () => void; onComplete: () => void; readOnly?: boolean;
}) {
  const style = STATUS_STYLES[visit.status] ?? STATUS_STYLES.scheduled;
  const feasStyle = FEASIBILITY_OPTIONS.find((f) => f.value === visit.feasibility);
  const observations = visit.observations as Record<string, string> | null;
  const costFactors = (visit.cost_factors ?? []) as string[];

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "16px",
        border: "1px solid #E0E7EF",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Calendar style={{ width: "13px", height: "13px", color: "#546E7A" }} />
            <span className="text-sm font-semibold" style={{ color: "#0A1929" }}>
              {new Date(visit.visit_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span
              className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: style.bg, color: style.color }}
            >
              {style.label}
            </span>
            {feasStyle && (
              <span
                className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: feasStyle.bg, color: feasStyle.color }}
              >
                {feasStyle.label}
              </span>
            )}
          </div>
          {visit.recommendations && (
            <p className="text-[13px] truncate" style={{ color: "#546E7A" }}>{visit.recommendations}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {visit.status === "scheduled" && !readOnly && (
            <button
              onClick={(e) => { e.stopPropagation(); onComplete(); }}
              className="text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: "#DCFCE7", color: "#15673A" }}
            >
              Complete Visit
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: "#546E7A" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "#546E7A" }} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #E0E7EF", padding: "16px" }}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <CheckItem icon={Droplets} label="Water Confirmed" checked={visit.water_confirmed} />
            <CheckItem icon={MapPin} label="Access Confirmed" checked={visit.access_confirmed} />
            <CheckItem icon={ShieldCheck} label="Security Confirmed" checked={visit.security_confirmed} />
            <CheckItem icon={Fence} label="Fencing Confirmed" checked={visit.fencing_confirmed} />
          </div>

          {observations?.notes && (
            <div className="mb-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Observations</p>
              <p className="text-sm" style={{ color: "#0A1929" }}>{observations.notes}</p>
            </div>
          )}

          {costFactors.length > 0 && (
            <div className="mb-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Cost Factors</p>
              <div className="flex flex-wrap gap-1.5">
                {costFactors.map((cf, i) => (
                  <span
                    key={i}
                    className="text-[13px] px-2.5 py-1 rounded-full font-medium"
                    style={{ background: "#FEF3C7", color: "#92400E" }}
                  >
                    {cf}
                  </span>
                ))}
              </div>
            </div>
          )}

          {visit.recommendations && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#546E7A" }}>Recommendations</p>
              <p className="text-sm" style={{ color: "#0A1929" }}>{visit.recommendations}</p>
            </div>
          )}

          {((visit as any).photos as string[] | undefined)?.length ? (
            <div className="mt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#546E7A" }}>
                <ImageIcon style={{ width: "12px", height: "12px", display: "inline", marginRight: "4px" }} />
                Site Photos ({((visit as any).photos as string[]).length})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {((visit as any).photos as string[]).map((path, i) => {
                  const publicUrl = getPublicStorageUrl("site-visit-photos", path);
                  return (
                    <a key={i} href={publicUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden" style={{ aspectRatio: "1", border: "1.5px solid #E0E7EF" }}>
                      <img src={publicUrl} alt={`Site photo ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CheckItem({ icon: Icon, label, checked }: { icon: any; label: string; checked: boolean | null }) {
  return (
    <div className="flex items-center gap-2">
      <Icon style={{ width: "14px", height: "14px", color: checked ? "#15673A" : "#CBD5E1" }} />
      <span className="text-[13px]" style={{ color: checked ? "#0A1929" : "#94A3B8" }}>{label}</span>
      {checked ? (
        <CheckCircle2 style={{ width: "13px", height: "13px", color: "#15673A" }} />
      ) : (
        <span className="text-[12px]" style={{ color: "#94A3B8" }}>—</span>
      )}
    </div>
  );
}

function ScheduleDialog({
  open, onClose, enquiryId, userId, queryClient,
}: {
  open: boolean; onClose: () => void; enquiryId: string; userId: string | null; queryClient: any;
}) {
  const [date, setDate] = useState("");
  const [geologist, setGeologist] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!date) { toast.error("Visit date is required"); return; }
    setSaving(true);
    try {
      await apiClient.post("/site-visits", {
        enquiry_id: enquiryId,
        visit_date: date,
        geologist_id: geologist,
        status: "scheduled",
        observations: notes ? { notes } : null,
      });

      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "site_visit_scheduled",
        metadata: { visit_date: date },
      });

      toast.success("Site visit scheduled");
      queryClient.invalidateQueries({ queryKey: ["site-visits", enquiryId] });
      setDate(""); setGeologist(null); setNotes("");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule visit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ borderRadius: "20px", padding: "32px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)", maxWidth: "480px" }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700 }}>
            Schedule Site Visit
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-[13px] font-semibold mb-1.5 block" style={{ color: "#0A1929" }}>Visit Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg text-sm"
              style={{ border: "1.5px solid #E0E7EF", padding: "10px 14px" }}
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold mb-1.5 block" style={{ color: "#0A1929" }}>Assign Geologist</label>
            <AssigneeDropdown value={geologist} onChange={setGeologist} />
          </div>
          <div>
            <label className="text-[13px] font-semibold mb-1.5 block" style={{ color: "#0A1929" }}>Initial Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any pre-visit notes or instructions..."
              rows={3}
              className="w-full rounded-lg text-sm"
              style={{ border: "1.5px solid #E0E7EF", padding: "10px 14px", resize: "none" }}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg,#1565C0,#2979FF)",
              color: "white",
              boxShadow: "0 4px 12px rgba(21,101,192,0.3)",
            }}
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</> : <><Calendar className="h-4 w-4" /> Schedule</>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  visit, onClose, userId, queryClient, enquiryId,
}: {
  visit: SiteVisit; onClose: () => void; userId: string | null; queryClient: any; enquiryId: string;
}) {
  const [feasibility, setFeasibility] = useState<string>("feasible");
  const [waterConfirmed, setWaterConfirmed] = useState(false);
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [securityConfirmed, setSecurityConfirmed] = useState(false);
  const [fencingConfirmed, setFencingConfirmed] = useState(false);
  const [observationNotes, setObservationNotes] = useState(
    (visit.observations as any)?.notes ?? ""
  );
  const [recommendations, setRecommendations] = useState(visit.recommendations ?? "");
  const [selectedCostFactors, setSelectedCostFactors] = useState<string[]>(
    (visit.cost_factors ?? []) as string[]
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const maxSize = 5 * 1024 * 1024;
    const maxPhotos = 10;

    const validFiles = files.filter((f) => {
      if (f.size > maxSize) {
        toast.error(`${f.name} exceeds 5MB limit`);
        return false;
      }
      if (!f.type.match(/^image\/(jpeg|png|heic|heif|webp)$/)) {
        toast.error(`${f.name} is not a supported image format`);
        return false;
      }
      return true;
    });

    const remaining = maxPhotos - photos.length;
    const toAdd = validFiles.slice(0, remaining);
    if (validFiles.length > remaining) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
    }

    setPhotos((prev) => [...prev, ...toAdd]);
    const previews = toAdd.map((f) => URL.createObjectURL(f));
    setPhotoPreviews((prev) => [...prev, ...previews]);
    if (e.target) e.target.value = "";
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0) return [];
    setUploadingPhotos(true);
    const paths: string[] = [];
    for (const file of photos) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${enquiryId}/${visit.id}/${crypto.randomUUID()}.${ext}`;
      try {
        const stored = await uploadToStorage("site-visit-photos", path, file, { contentType: file.type });
        paths.push(stored);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploadingPhotos(false);
    return paths;
  };

  const toggleCostFactor = (factor: string) => {
    setSelectedCostFactors((prev) =>
      prev.includes(factor) ? prev.filter((f) => f !== factor) : [...prev, factor]
    );
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const uploadedPaths = await uploadPhotos();
      const existingPhotos = ((visit as any).photos ?? []) as string[];
      const allPhotos = [...existingPhotos, ...uploadedPaths];

      await apiClient.patch(`/site-visits/${visit.id}`, {
        status: "completed",
        feasibility,
        water_confirmed: waterConfirmed,
        access_confirmed: accessConfirmed,
        security_confirmed: securityConfirmed,
        fencing_confirmed: fencingConfirmed,
        observations: { notes: observationNotes },
        recommendations,
        cost_factors: selectedCostFactors,
        photos: allPhotos,
      });

      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "site_visit_completed",
        metadata: { feasibility, visit_id: visit.id },
      });

      toast.success("Site visit completed");
      queryClient.invalidateQueries({ queryKey: ["site-visits", enquiryId] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete visit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        style={{
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          maxWidth: "560px",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Sora, sans-serif", color: "#0A1929", fontSize: "18px", fontWeight: 700 }}>
            Complete Site Visit — {new Date(visit.visit_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Feasibility */}
          <div>
            <label className="text-[13px] font-semibold mb-2 block" style={{ color: "#0A1929" }}>Feasibility Assessment *</label>
            <div className="flex gap-2">
              {FEASIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFeasibility(opt.value)}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
                  style={{
                    background: feasibility === opt.value ? opt.bg : "#F0F4F8",
                    color: feasibility === opt.value ? opt.color : "#546E7A",
                    border: feasibility === opt.value ? `2px solid ${opt.color}` : "2px solid transparent",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Site Confirmations */}
          <div>
            <label className="text-[13px] font-semibold mb-2 block" style={{ color: "#0A1929" }}>Site Confirmations</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Water Available", icon: Droplets, checked: waterConfirmed, set: setWaterConfirmed },
                { label: "Access Clear", icon: MapPin, checked: accessConfirmed, set: setAccessConfirmed },
                { label: "Security OK", icon: ShieldCheck, checked: securityConfirmed, set: setSecurityConfirmed },
                { label: "Fencing OK", icon: Fence, checked: fencingConfirmed, set: setFencingConfirmed },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => item.set(!item.checked)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all"
                    style={{
                      background: item.checked ? "#DCFCE7" : "#F0F4F8",
                      color: item.checked ? "#15673A" : "#546E7A",
                      border: item.checked ? "1.5px solid #86EFAC" : "1.5px solid #E0E7EF",
                    }}
                  >
                    <Icon style={{ width: "14px", height: "14px" }} />
                    {item.label}
                    {item.checked && <CheckCircle2 style={{ width: "13px", height: "13px", marginLeft: "auto" }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cost Factors */}
          <div>
            <label className="text-[13px] font-semibold mb-2 block" style={{ color: "#0A1929" }}>Cost Factors</label>
            <div className="flex flex-wrap gap-1.5">
              {COST_FACTOR_PRESETS.map((factor) => (
                <button
                  key={factor}
                  onClick={() => toggleCostFactor(factor)}
                  className="text-[13px] px-3 py-1.5 rounded-full font-medium transition-all"
                  style={{
                    background: selectedCostFactors.includes(factor) ? "#FEF3C7" : "#F0F4F8",
                    color: selectedCostFactors.includes(factor) ? "#92400E" : "#546E7A",
                    border: selectedCostFactors.includes(factor) ? "1.5px solid #FCD34D" : "1.5px solid #E0E7EF",
                  }}
                >
                  {factor}
                </button>
              ))}
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="text-[13px] font-semibold mb-1.5 block" style={{ color: "#0A1929" }}>Observations</label>
            <textarea
              value={observationNotes}
              onChange={(e) => setObservationNotes(e.target.value)}
              placeholder="Water table level, soil conditions, access road status, nearby structures..."
              rows={3}
              className="w-full rounded-lg text-sm"
              style={{ border: "1.5px solid #E0E7EF", padding: "10px 14px", resize: "none" }}
            />
          </div>

          {/* Recommendations */}
          <div>
            <label className="text-[13px] font-semibold mb-1.5 block" style={{ color: "#0A1929" }}>Recommendations</label>
            <textarea
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="Suggested bore depth, equipment type, access arrangements..."
              rows={2}
              className="w-full rounded-lg text-sm"
              style={{ border: "1.5px solid #E0E7EF", padding: "10px 14px", resize: "none" }}
            />
          </div>

          {/* Site Photos */}
          <div>
            <label className="text-[13px] font-semibold mb-2 block" style={{ color: "#0A1929" }}>
              Site Photos ({photos.length}/10)
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
            {photoPreviews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {photoPreviews.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden" style={{ aspectRatio: "1", border: "1.5px solid #E0E7EF" }}>
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "rgba(185,28,28,0.9)" }}
                    >
                      <X style={{ width: "12px", height: "12px", color: "white" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 10 && (
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium w-full justify-center transition-all"
                style={{ background: "#F0F4F8", border: "1.5px dashed #CBD5E1", color: "#546E7A" }}
              >
                <Camera style={{ width: "14px", height: "14px" }} />
                Add Photos (JPG, PNG, HEIC — max 5MB each)
              </button>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#F0F4F8", color: "#546E7A", border: "1px solid #E0E7EF" }}
          >
            Cancel
          </button>
          <button
            onClick={handleComplete}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg,#15673A,#22C55E)",
              color: "white",
              boxShadow: "0 4px 12px rgba(21,103,58,0.3)",
            }}
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><ClipboardCheck className="h-4 w-4" /> Complete Visit</>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
