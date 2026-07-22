import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { uploadToStorage, getSignedUrl } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { sendClientTouchpoint } from "@/lib/clientTouchpoints";
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
    let jc = await apiClient.get<JobCompletion | null>("/job-completion", { enquiry_id: enquiryId });
    if (!jc) jc = await apiClient.post<JobCompletion>("/job-completion", { enquiry_id: enquiryId });
    setJob(jc);
    const rem = await apiClient.get<JobReminder[]>("/job-completion/reminders", { enquiry_id: enquiryId });
    setReminders(rem ?? []);
    setLoading(false);
  }, [enquiryId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateField = async (field: string, value: any) => {
    if (!job) return;
    await apiClient.patch(`/job-completion/${job.id}`, { [field]: value });
    setJob((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleDateChange = async (stage: StageConfig, newDate: string) => {
    if (!job) return;
    await updateField(stage.dateField, newDate || null);

    // Delete unsent reminders for this type
    await apiClient.del("/job-completion/reminders", { job_id: job.id, reminder_type: stage.reminderType });

    if (newDate) {
      const today = new Date().toISOString().slice(0, 10);
      for (const daysBefore of [3, 2, 1]) {
        const target = new Date(newDate);
        target.setDate(target.getDate() - daysBefore);
        const scheduledFor = target.toISOString().slice(0, 10);
        if (scheduledFor >= today) {
          await apiClient.post("/job-completion/reminders", {
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

    // Don't let a stage be completed without its required data.
    const missing: string[] = [];
    if (!job[stage.dateField]) missing.push("Target Date");
    if (stage.key === "report" && !job.report_file_url) missing.push("Report upload");
    if (stage.key === "bill" && !(Number(job.final_bill_amount) > 0)) missing.push("Final Bill Amount");
    if (missing.length > 0) {
      toast.error(`Add ${missing.join(" & ")} before marking "${stage.title}" as done.`);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    await apiClient.patch(`/job-completion/${job.id}`, {
      [stage.doneField]: true,
      [stage.actualField]: today,
    });

    await apiClient.post(`/enquiries/${enquiryId}/events`, {
      event_type: "job_stage_completed",
      metadata: { stage: stage.key },
    });

    // Check if all 3 done
    const updatedJob = { ...job, [stage.doneField]: true, [stage.actualField]: today };
    if (updatedJob.site_done && updatedJob.report_done && updatedJob.final_bill_done) {
      try {
        await apiClient.patch(`/enquiries/${enquiryId}`, { status: "completed" });
        await apiClient.post(`/enquiries/${enquiryId}/events`, {
          event_type: "status_change",
          to_status: "completed",
          metadata: { trigger: "job_completed" },
        });
        toast.success("All stages complete! Enquiry marked as completed. 🎉");

        // Client touchpoint: thank-you / report-delivered. Best-effort; inert
        // until Brevo/WATI credentials are provisioned.
        try {
          const enq = await apiClient.get<{ ref_number: string; client_id: string }>(`/enquiries/${enquiryId}`);
          const client = await apiClient.get<{
            id: string; name: string; email: string | null; email_bounced: boolean | null;
            whatsapp_number: string | null; whatsapp_invalid: boolean | null;
          }>(`/clients/${enq.client_id}`);
          const clientName = client?.name ?? "Client";
          await sendClientTouchpoint({
            enquiryId,
            client,
            subject: `Project Completed — ${enq.ref_number}`,
            emailTemplate: "job_completed",
            emailParams: { client_name: clientName, ref_number: enq.ref_number },
            waTemplate: "qms_job_completed",
            waParams: [
              { name: "client_name", value: clientName },
              { name: "ref_number", value: enq.ref_number },
            ],
            sentBy: user?.id,
          });
        } catch { /* touchpoint is best-effort */ }
      } catch (e) {
        toast.error("All stages done, but the enquiry could not be marked completed: " + (e as Error).message);
      }
    } else {
      toast.success(`${stage.title} marked as done!`);
    }
    fetchData();
  };

  const handleReportUpload = async (file: File) => {
    if (!job) return;
    const path = `${enquiryId}/${file.name}`;
    try {
      await uploadToStorage("reports", path, file, { upsert: true });
      const signedUrl = await getSignedUrl("reports", path, 86400 * 30);
      await updateField("report_file_url", signedUrl);
      toast.success("Report uploaded!");
    } catch {
      toast.error("Upload failed");
    }
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
                <span className="text-[13px] mt-1 text-muted-foreground">{stage.title}</span>
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
                    <Label className="text-[13px]">Target Date</Label>
                    <Input
                      type="date"
                      value={(job[stage.dateField] as string) ?? ""}
                      onChange={(e) => handleDateChange(stage, e.target.value)}
                      disabled={!!done}
                    />
                  </div>

                  {done && job[stage.actualField] && (
                    <div>
                      <Label className="text-[13px]">Actual Date</Label>
                      <p className="text-sm font-medium text-green-700">{job[stage.actualField] as string}</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-[13px]">Notes</Label>
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
                      const tooltip = !rem
                        ? `${d}-day reminder — set a target date to activate`
                        : rem.sent
                          ? `Reminder sent on ${rem.scheduled_for}`
                          : `Reminder scheduled for ${rem.scheduled_for}`;
                      return <Badge key={d} className={`text-[12px] ${color} cursor-default`} title={tooltip}>{d} day{d > 1 ? "s" : ""}</Badge>;
                    })}
                  </div>

                  {/* Report upload */}
                  {stage.key === "report" && !done && (
                    <div>
                      <Label className="text-[13px]">Upload Report</Label>
                      <Input type="file" onChange={(e) => e.target.files?.[0] && handleReportUpload(e.target.files[0])} />
                      {job.report_file_url && (
                        <a href={job.report_file_url} target="_blank" rel="noreferrer" className="text-[13px] text-blue-600 hover:underline mt-1 inline-block">View uploaded report</a>
                      )}
                    </div>
                  )}

                  {/* Final bill amount */}
                  {stage.key === "bill" && (
                    <div>
                      <Label className="text-[13px]">Final Bill Amount ₹</Label>
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
