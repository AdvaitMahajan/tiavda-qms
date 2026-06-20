import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Mail, MessageSquare, Bell, ArrowRight, ArrowLeft, Pencil } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";

type CommLog = Tables<"communication_log">;

const CHANNEL_ICONS = { email: Mail, whatsapp: MessageSquare, in_app: Bell };
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-200 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  read: "bg-teal-100 text-teal-700",
  failed: "bg-red-100 text-red-700",
};

export function CommunicationTab({ enquiryId }: { enquiryId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showCompose, setShowCompose] = useState(false);
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["comm-log", enquiryId],
    queryFn: async () => {
      const enq = await apiClient.get<{ client_id: string }>(`/enquiries/${enquiryId}`).catch(() => null);
      if (!enq) return [];
      const data = await apiClient.get<CommLog[]>("/communications", { enquiry_id: enquiryId });
      return data.map((d) => ({ ...d, _client_id: enq.client_id }));
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const enq = await apiClient.get<Tables<"enquiries">>(`/enquiries/${enquiryId}`).catch(() => null);
      if (!enq) throw new Error("Enquiry not found");
      const client = await apiClient.get<Tables<"clients">>(`/clients/${enq.client_id}`).catch(() => null);
      if (!client) throw new Error("Client not found");

      let status = "sent";
      if (channel === "email") {
        if (!client.email) throw new Error("Client has no email address");
        if (client.email_bounced) throw new Error("Client email is marked as bounced");
        try {
          await apiClient.post("/integrations/email", {
            to: client.email,
            subject: subject || `Message regarding ${enq.ref_number}`,
            html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0F2A47;padding:24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:20px;">Geotechnical Consultants</h1>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:32px;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Dear ${client.name},</p>
    <div style="white-space:pre-line;font-size:15px;line-height:1.6;">${body}</div>
    <p style="margin-top:32px;">Best regards,<br/><strong>The Team</strong><br/>+91 8605811117</p>
  </div>
</div>`,
          });
        } catch {
          status = "failed";
        }
      } else {
        if (!client.whatsapp_number) throw new Error("Client has no WhatsApp number");
        if (client.whatsapp_invalid) throw new Error("Client WhatsApp is marked as invalid");
        let waData: { error?: string; whatsapp_invalid?: boolean } = {};
        try {
          waData = await apiClient.post<{ error?: string; whatsapp_invalid?: boolean }>("/integrations/whatsapp", {
            phone_number: client.whatsapp_number,
            template_name: "qms_custom_message",
            parameters: [
              { name: "client_name", value: client.name },
              { name: "message", value: body },
              { name: "ref_number", value: enq.ref_number },
            ],
          });
        } catch (e) {
          waData = { error: (e as Error).message };
        }
        if (waData?.error) { status = "failed"; }
        if (waData?.whatsapp_invalid) {
          await apiClient.patch(`/clients/${client.id}`, { whatsapp_invalid: true });
          throw new Error("WhatsApp number is not valid");
        }
      }

      await apiClient.post("/communications", {
        enquiry_id: enquiryId,
        client_id: enq.client_id,
        channel,
        direction: "outbound",
        subject: channel === "email" ? subject : null,
        body,
        status,
        sent_by: user?.id ?? null,
      });
      if (status === "failed") throw new Error(`${channel === "email" ? "Email" : "WhatsApp"} sending failed, but message was logged.`);
    },
    onSuccess: () => {
      toast.success(channel === "email" ? "Email sent!" : "WhatsApp message sent!");
      queryClient.invalidateQueries({ queryKey: ["comm-log", enquiryId] });
      setShowCompose(false);
      setSubject(""); setBody("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/30 animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sora text-lg font-semibold text-foreground">Communications</h2>
        <Button onClick={() => setShowCompose(true)} variant="outline">
          <Pencil className="mr-1 h-4 w-4" /> Compose
        </Button>
      </div>

      {!logs?.length ? (
        <EmptyState
          icon={Mail}
          title="No communications yet."
          subtitle="Communications will appear here when emails or WhatsApp messages are sent."
        />
      ) : (
        logs.map((log) => {
          const Icon = CHANNEL_ICONS[log.channel] ?? Mail;
          const DirIcon = log.direction === "outbound" ? ArrowRight : ArrowLeft;
          return (
            <Card key={log.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <DirIcon className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{log.subject || log.template_id || log.channel}</span>
                    <Badge className={STATUS_COLORS[log.status ?? "pending"] ?? ""}>{log.status ?? "pending"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{log.body.slice(0, 100)}{log.body.length > 100 ? "…" : ""}</p>
                </div>
                <span className="text-[13px] text-muted-foreground flex-shrink-0">{relativeTime(log.created_at)}</span>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Compose Modal */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compose Message</DialogTitle>
            <DialogDescription>Log a new outbound communication.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={channel === "email" ? "default" : "outline"} size="sm" onClick={() => setChannel("email")}>
                <Mail className="mr-1 h-4 w-4" /> Email
              </Button>
              <Button variant={channel === "whatsapp" ? "default" : "outline"} size="sm" onClick={() => setChannel("whatsapp")}>
                <MessageSquare className="mr-1 h-4 w-4" /> WhatsApp
              </Button>
            </div>
            {channel === "email" && (
              <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            )}
            <div><Label>Message</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button onClick={() => sendMutation.mutate()} disabled={!body.trim() || sendMutation.isPending}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
