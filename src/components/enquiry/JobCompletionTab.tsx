import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Check, Hammer, FileText, Receipt, Upload } from "lucide-react";
import { motion } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

type JobCompletion = Tables<"job_completion">;
type JobReminder = Tables<"job_reminders">;

interface StageConfig {
  key: string;
  title: string;
  icon: typeof Hammer;
  dateField: "site_completion_date" | "report_delivery_date" | "final_bill_date";
  doneField: "site_done" | "report_done" | "final_bill_done";
  actualField: "site_completed_actual" | "report_delivered_actual" | "final_bill_raised_actual";
  notesField: "site_completion_notes" | "report_delivery_notes" | "final_bill_notes";
  reminderType: string;
}

const STAGES: StageConfig[] = [
  { key: "site", title: "Site Completion", icon: Hammer, dateField: "site_completion_date", doneField: "site_done", actualField: "site_completed_actual", notesField: "site_completion_notes", reminderType: "site" },
  { key: "report", title: "Report Delivery", icon: FileText, dateField: "report_delivery_date", doneField: "report_done", actualField: "report_delivered_actual", notesField: "report_delivery_notes", reminderType: "report" },
  { key: "bill", title: "Final Bill", icon: Receipt, dateField: "final_bill_date", doneField: "final_bill_done", actualField: "final_bill_raised_actual", notesField: "final_bill_notes", reminderType: "billing" },
];

export function JobCompletionTab({ enquiryId }: { enquiryId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [job, setJob] = useState<JobCompletion | null>(null);
  const [reminders, setReminders] = useState<JobReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let { data: jc } = await supabase.from("job_completion").select("*").eq("enquiry_id", enquiryId).maybeSingle();
    if (!jc) {
      const { data: newJc } = await supabase.from("job_completion").insert({ enquiry_id: enquiryId }).select().single();
      jc = newJc;
    }
    setJob(jc);
    const { data: rem } = await supabase.from("job_reminders").select("*").eq("enquiry_id", enquiryId).order("reminder_type").order("days_before", { ascending: false });
    setReminders(rem ?? []);
    setLoading(false);
  }, [enquiryId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateField = async (field: string, value: any) => {
    if (!job) return;
    await supabase.from("job_completion").update({ [field]: value } as any).eq("id", job.id);
    setJob((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleDateChange = async (stage: StageConfig, newDate: string) => {
    if (!job) return;
    await updateField(stage.dateField, newDate || null);

    // Delete unsent reminders for this type
    await supabase.from("job_reminders").delete().eq("job_id", job.id).eq("reminder_type", stage.reminderType).eq("sent", false);

    if (newDate) {
      const today = new Date().toISOString().slice(0, 10);
      for (const daysBefore of [3, 2, 1]) {
        const target = new Date(newDate);
        target.setDate(target.getDate() - daysBefore);
        const scheduledFor = target.toISOString().slice(0, 10);
        if (scheduledFor >= today) {
          await supabase.from("job_reminders").insert({
            job_id: job.id,
            enquiry_id: enquiryId,
            reminder_type: stage.reminderType,
            days_before: daysBefore,
            scheduled_for: scheduledFor,
            target_date: newDate,
          });
        }
      }
    }
    fetchData();
  };

  const handleMarkDone = async (stage: StageConfig) => {
    if (!job) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("job_completion").update({
      [stage.doneField]: true,
      [stage.actualField]: today,
    } as any).eq("id", job.id);

    await supabase.from("enquiry_events").insert({
      enquiry_id: enquiryId,
      event_type: "job_stage_completed",
      metadata: { stage: stage.key } as any,
      triggered_by: user?.id ?? null,
    });

    // Check if all 3 done
    const updatedJob = { ...job, [stage.doneField]: true, [stage.actualField]: today };
    if (updatedJob.site_done && updatedJob.report_done && updatedJob.final_bill_done) {
      await supabase.from("enquiries").update({ status: "completed" as any }).eq("id", enquiryId);
      toast.success("All stages complete! Enquiry marked as completed. 🎉");
    } else {
      toast.success(`${stage.title} marked as done!`);
    }
    fetchData();
  };

  const handleReportUpload = async (file: File) => {
    if (!job) return;
    const path = `${enquiryId}/${file.name}`;
    const { error } = await supabase.storage.from("reports").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data: urlData } = await supabase.storage.from("reports").createSignedUrl(path, 86400 * 30);
    await updateField("report_file_url", urlData?.signedUrl ?? null);
    toast.success("Report uploaded!");
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!job) return null;

  const completedCount = [job.site_done, job.report_done, job.final_bill_done].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="flex items-center justify-center gap-0">
        {STAGES.map((stage, i) => {
          const done = job[stage.doneField];
          return (
            <div key={stage.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done ? "bg-green-600 text-white" : "border-2 border-border text-muted-foreground"
                }`}>
                  {done ? <Check className="h-5 w-5" /> : i + 1}
                </div>
                <span className="text-xs mt-1 text-muted-foreground">{stage.title}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`w-16 h-0.5 mx-2 ${completedCount > i + 1 || (done && job[STAGES[i + 1].doneField]) ? "bg-green-600" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Stage cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STAGES.map((stage) => {
          const done = job[stage.doneField];
          const Icon = stage.icon;
          const stageReminders = reminders.filter((r) => r.reminder_type === stage.reminderType);

          return (
            <motion.div key={stage.key} animate={{ backgroundColor: done ? "#D6F0E3" : "hsl(var(--card))" }} transition={{ duration: 0.4 }}>
              <Card className={done ? "border-green-300" : ""} style={{ backgroundColor: "inherit" }}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4" /> {stage.title}
                    </CardTitle>
                    <Badge className={done ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                      {done ? "Done" : "Pending"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Target Date</Label>
                    <Input
                      type="date"
                      value={(job[stage.dateField] as string) ?? ""}
                      onChange={(e) => handleDateChange(stage, e.target.value)}
                      disabled={!!done}
                    />
                  </div>

                  {done && job[stage.actualField] && (
                    <div>
                      <Label className="text-xs">Actual Date</Label>
                      <p className="text-sm font-medium text-green-700">{job[stage.actualField] as string}</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Input
                      defaultValue={(job[stage.notesField] as string) ?? ""}
                      onBlur={(e) => updateField(stage.notesField, e.target.value || null)}
                      placeholder="Add notes..."
                      disabled={!!done}
                    />
                  </div>

                  {/* Reminder badges */}
                  <div className="flex gap-1.5">
                    {[3, 2, 1].map((d) => {
                      const rem = stageReminders.find((r) => r.days_before === d);
                      const color = !rem ? "bg-slate-200 text-slate-500" : rem.sent ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
                      return <Badge key={d} className={`text-[10px] ${color}`}>{d} day{d > 1 ? "s" : ""}</Badge>;
                    })}
                  </div>

                  {/* Report upload */}
                  {stage.key === "report" && !done && (
                    <div>
                      <Label className="text-xs">Upload Report</Label>
                      <Input type="file" onChange={(e) => e.target.files?.[0] && handleReportUpload(e.target.files[0])} />
                      {job.report_file_url && (
                        <a href={job.report_file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">View uploaded report</a>
                      )}
                    </div>
                  )}

                  {/* Final bill amount */}
                  {stage.key === "bill" && (
                    <div>
                      <Label className="text-xs">Final Bill Amount ₹</Label>
                      <Input
                        type="number"
                        defaultValue={job.final_bill_amount ? Number(job.final_bill_amount) : ""}
                        onBlur={(e) => updateField("final_bill_amount", e.target.value ? parseFloat(e.target.value) : null)}
                        disabled={!!done}
                      />
                    </div>
                  )}

                  {!done && (
                    <Button variant="outline" className="w-full border-green-500 text-green-700 hover:bg-green-50" onClick={() => handleMarkDone(stage)}>
                      <Check className="mr-1 h-4 w-4" /> Mark as Done
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
