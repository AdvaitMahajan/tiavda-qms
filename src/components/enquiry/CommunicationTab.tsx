import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      // First get enquiry to get client_id
      const { data: enq } = await supabase.from("enquiries").select("client_id").eq("id", enquiryId).single();
      if (!enq) return [];
      const { data } = await supabase.from("communication_log").select("*").eq("enquiry_id", enquiryId).order("created_at", { ascending: false });
      return (data ?? []).map((d) => ({ ...d, _client_id: enq.client_id }));
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data: enq } = await supabase.from("enquiries").select("client_id").eq("id", enquiryId).single();
      if (!enq) throw new Error("Enquiry not found");
      const { error } = await supabase.from("communication_log").insert({
        enquiry_id: enquiryId,
        client_id: enq.client_id,
        channel,
        direction: "outbound",
        subject: channel === "email" ? subject : null,
        body,
        status: "sent",
        sent_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info("Message logged. Email/WhatsApp sending will be wired up separately.");
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
        <h2 className="font-heading text-lg font-semibold text-foreground">Communications</h2>
        <Button onClick={() => setShowCompose(true)} variant="outline">
          <Pencil className="mr-1 h-4 w-4" /> Compose
        </Button>
      </div>

      {!logs?.length ? (
        <Card><CardContent className="py-12 text-center">
          <Mail className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No communications yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Communications will appear here when emails or WhatsApp messages are sent.</p>
        </CardContent></Card>
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
                <span className="text-xs text-muted-foreground flex-shrink-0">{relativeTime(log.created_at)}</span>
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
