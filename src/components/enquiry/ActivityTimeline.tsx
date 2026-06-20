import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { relativeTime } from "@/lib/utils";
import {
  FileText, Send, CalendarClock, CheckCircle, XCircle,
  CreditCard, Hammer, ArrowRight, Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

type EnquiryEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  triggered_by: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

const EVENT_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  quotation_approved: { icon: CheckCircle, color: "#FF8F00", bg: "#FFF3E0", label: "Quotation approved" },
  quotation_sent: { icon: Send, color: "#1565C0", bg: "#EBF2FF", label: "Quotation sent to client" },
  follow_up_completed: { icon: CalendarClock, color: "#E65100", bg: "#FFF3E0", label: "Follow-up completed" },
  marked_lost: { icon: XCircle, color: "#C62828", bg: "#FEF2F2", label: "Marked as lost" },
  payment_requested: { icon: CreditCard, color: "#6A1B9A", bg: "#F3E8FF", label: "Payment requested" },
  payment_received_confirmed: { icon: CreditCard, color: "#00897B", bg: "#E8F5E9", label: "Payment received — confirmed" },
  job_stage_completed: { icon: Hammer, color: "#00897B", bg: "#E8F5E9", label: "Job stage completed" },
  status_change: { icon: ArrowRight, color: "#546E7A", bg: "#F0F4F8", label: "Status changed" },
};

const DEFAULT_CONFIG = { icon: Activity, color: "#546E7A", bg: "#F0F4F8", label: "Event" };

function formatStatusLabel(s: string | null): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityTimeline({ enquiryId }: { enquiryId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["enquiry-events", enquiryId],
    queryFn: () => apiClient.get<EnquiryEvent[]>(`/enquiries/${enquiryId}/events`),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-muted/30 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <EmptyState icon={Activity} title="No activity yet." subtitle="Events will appear here as the enquiry progresses." />;
  }

  return (
    <div className="space-y-1">
      <h2
        className="text-lg font-semibold mb-4"
        style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
      >
        Activity
      </h2>
      <div className="relative">
        {/* Vertical line */}
        <div
          className="absolute left-[19px] top-0 bottom-0 w-px"
          style={{ background: "#E0E7EF" }}
        />

        {events.map((ev) => {
          const cfg = EVENT_CONFIG[ev.event_type] ?? DEFAULT_CONFIG;
          const Icon = cfg.icon;
          const meta = ev.metadata as Record<string, any> | null;

          let description = cfg.label;
          if (ev.from_status && ev.to_status) {
            description += ` (${formatStatusLabel(ev.from_status)} → ${formatStatusLabel(ev.to_status)})`;
          }
          if (ev.event_type === "follow_up_completed" && meta?.outcome) {
            description += ` — ${formatStatusLabel(meta.outcome)}`;
          }
          if (ev.event_type === "marked_lost" && meta?.reason) {
            description += `: ${meta.reason}`;
          }
          if (ev.event_type === "job_stage_completed" && meta?.stage) {
            description += ` — ${formatStatusLabel(meta.stage)}`;
          }

          return (
            <div key={ev.id} className="relative flex items-start gap-3 pb-4 pl-1">
              <div
                className="relative z-10 flex items-center justify-center flex-shrink-0"
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  background: cfg.bg,
                }}
              >
                <Icon style={{ width: "16px", height: "16px", color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0 pt-1.5">
                <p className="text-sm" style={{ color: "#0A1929" }}>
                  {description}
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: "#94A3B8" }}>
                  {relativeTime(ev.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
