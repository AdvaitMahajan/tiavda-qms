import { apiClient } from "@/lib/apiClient";
import type { Tables } from "@/integrations/supabase/types";

interface CadenceStep {
  dayOffset: number;
  notes: string;
  conditional: boolean;
}

const DEFAULT_CADENCE: CadenceStep[] = [
  { dayOffset: 1, notes: "Day 1: Initial follow-up after quotation sent", conditional: false },
  { dayOffset: 3, notes: "Day 3: Check if client reviewed quotation", conditional: false },
  { dayOffset: 5, notes: "Day 5: Address any questions or concerns", conditional: false },
  { dayOffset: 15, notes: "Day 15: Re-engage — offer revision or discuss alternatives", conditional: true },
  { dayOffset: 30, notes: "Day 30: Final follow-up before marking inactive", conditional: true },
];

export async function createFollowUpCadence(enquiryId: string): Promise<number> {
  // Idempotency guard: a quotation can be sent more than once, and each send used
  // to create a full cadence — piling up duplicate follow-ups. Skip if an active
  // (pending, auto-scheduled) cadence already exists for this enquiry.
  const existing = await apiClient.get<Tables<"follow_ups">[]>("/follow-ups", { enquiry_id: enquiryId });
  if (existing.some((f) => f.auto_scheduled && f.outcome === "pending")) return 0;

  const baseDate = new Date();
  const rows = DEFAULT_CADENCE.map((step) => {
    const scheduled = new Date(baseDate);
    scheduled.setDate(scheduled.getDate() + step.dayOffset);
    return {
      enquiry_id: enquiryId,
      scheduled_date: scheduled.toISOString().slice(0, 10),
      notes: step.notes,
      auto_scheduled: true,
      is_conditional: step.conditional,
      outcome: "pending" as const,
    };
  });

  for (const row of rows) {
    await apiClient.post("/follow-ups", row);
  }
  return rows.length;
}

export async function cleanupConditionalFollowUps(enquiryId: string): Promise<void> {
  const all = await apiClient.get<Tables<"follow_ups">[]>("/follow-ups", { enquiry_id: enquiryId });
  const targets = all.filter((f) => f.outcome === "pending" && f.auto_scheduled && f.is_conditional);
  for (const f of targets) {
    await apiClient.patch(`/follow-ups/${f.id}`, { outcome: "closed" });
  }
}

const TERMINAL_STATUSES = ["approved", "lost", "inactive", "completed", "payment_received", "mobilization_scheduled", "job_active"];

export async function cancelPendingFollowUps(enquiryId: string): Promise<void> {
  const all = await apiClient.get<Tables<"follow_ups">[]>("/follow-ups", { enquiry_id: enquiryId });
  const pending = all.filter((f) => f.outcome === "pending");
  for (const f of pending) {
    await apiClient.patch(`/follow-ups/${f.id}`, { outcome: "closed" });
  }
  await apiClient.patch(`/enquiries/${enquiryId}`, { next_follow_up: null });
}

export function shouldCancelFollowUps(toStatus: string): boolean {
  return TERMINAL_STATUSES.includes(toStatus);
}
