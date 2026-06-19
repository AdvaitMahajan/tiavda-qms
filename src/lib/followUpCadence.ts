import { supabase } from "@/integrations/supabase/client";

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

  const { error } = await supabase.from("follow_ups").insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function cleanupConditionalFollowUps(enquiryId: string): Promise<void> {
  await supabase
    .from("follow_ups")
    .update({ outcome: "cancelled" as any })
    .eq("enquiry_id", enquiryId)
    .eq("outcome", "pending")
    .eq("auto_scheduled", true)
    .eq("is_conditional", true);
}

const TERMINAL_STATUSES = ["approved", "lost", "inactive", "completed", "payment_received", "mobilization_scheduled", "job_active"];

export async function cancelPendingFollowUps(enquiryId: string): Promise<void> {
  await supabase
    .from("follow_ups")
    .update({ outcome: "cancelled" as any })
    .eq("enquiry_id", enquiryId)
    .eq("outcome", "pending");

  await supabase
    .from("enquiries")
    .update({ next_follow_up: null })
    .eq("id", enquiryId);
}

export function shouldCancelFollowUps(toStatus: string): boolean {
  return TERMINAL_STATUSES.includes(toStatus);
}
