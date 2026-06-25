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

export interface CompleteFollowUpInput {
  followUp: Tables<"follow_ups">;
  outcome: string;
  outcomeNotes?: string | null;
  completedBy?: string | null;
  scheduleNext?: boolean;
  nextDate?: string | null;
}

/**
 * Complete a follow-up and run all the downstream effects: record the outcome,
 * optionally schedule the next one (manual or auto on no-response), keep the
 * enquiry's next_follow_up in sync, log the event, auto-advance sent→follow_up,
 * and clear conditional cadence steps when the client is reached/closed.
 * Shared by the enquiry Follow-ups tab and the global Follow-ups page.
 */
export async function completeFollowUp({
  followUp,
  outcome,
  outcomeNotes,
  completedBy,
  scheduleNext = false,
  nextDate,
}: CompleteFollowUpInput): Promise<void> {
  const enquiryId = followUp.enquiry_id;

  await apiClient.patch(`/follow-ups/${followUp.id}`, {
    outcome,
    outcome_notes: outcomeNotes || null,
    completed_at: new Date().toISOString(),
    completed_by: completedBy ?? null,
  });

  let newNextDate: string | null = null;

  if (scheduleNext && nextDate) {
    await apiClient.post("/follow-ups", {
      enquiry_id: enquiryId,
      scheduled_date: nextDate,
      auto_scheduled: false,
      outcome: "pending",
    });
    newNextDate = nextDate;
  }

  // Auto-reschedule on no_response if enabled in app_settings
  if (outcome === "no_response" && !scheduleNext) {
    const settingsRows = await apiClient.get<{ key: string; value: string }[]>("/settings", {
      keys: "auto_followup_no_response,auto_followup_no_response_days",
    });
    const settingsMap = new Map(settingsRows.map((r) => [r.key, r.value]));
    const autoReschedule = (settingsMap.get("auto_followup_no_response") ?? "true") !== "false";
    const rescheduleDays = parseInt(settingsMap.get("auto_followup_no_response_days") ?? "4", 10) || 4;
    if (autoReschedule) {
      const next = new Date();
      next.setDate(next.getDate() + rescheduleDays);
      const autoNextDate = next.toISOString().slice(0, 10);
      await apiClient.post("/follow-ups", {
        enquiry_id: enquiryId,
        scheduled_date: autoNextDate,
        auto_scheduled: true,
        outcome: "pending",
        notes: "Auto: rescheduled after no response",
      });
      newNextDate = autoNextDate;
    }
  }

  // Keep enquiry.next_follow_up in sync
  if (outcome === "closed" && !scheduleNext) {
    await apiClient.patch(`/enquiries/${enquiryId}`, { next_follow_up: null });
  } else if (newNextDate) {
    await apiClient.patch(`/enquiries/${enquiryId}`, { next_follow_up: newNextDate });
  } else {
    const all = await apiClient.get<Tables<"follow_ups">[]>("/follow-ups", { enquiry_id: enquiryId });
    const nextPending = all
      .filter((f) => f.outcome === "pending" && f.id !== followUp.id)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
    await apiClient.patch(`/enquiries/${enquiryId}`, {
      next_follow_up: nextPending?.scheduled_date ?? null,
    });
  }

  await apiClient.post(`/enquiries/${enquiryId}/events`, {
    event_type: "follow_up_completed",
    metadata: { outcome, follow_up_id: followUp.id },
  });

  // Auto-advance enquiry from "sent" → "follow_up" when a follow-up is completed
  const enqStatus = await apiClient.get<{ status: string }>(`/enquiries/${enquiryId}`);
  if (enqStatus?.status === "sent") {
    await apiClient.patch(`/enquiries/${enquiryId}`, { status: "follow_up" });
    await apiClient.post(`/enquiries/${enquiryId}/events`, {
      event_type: "status_change",
      from_status: "sent",
      to_status: "follow_up",
      metadata: { trigger: "follow_up_completed" },
    });
  }

  // Cleanup conditional (Day 15/30) follow-ups if client reached and deal progressing
  if (outcome === "reached" || outcome === "closed") {
    await cleanupConditionalFollowUps(enquiryId);
  }
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
