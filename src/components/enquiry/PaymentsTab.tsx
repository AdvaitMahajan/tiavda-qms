import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CreditCard, ExternalLink } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";

type Payment = Tables<"payments">;

const PAY_STATUS_COLORS: Record<string, string> = {
  pending_request: "bg-slate-200 text-slate-700",
  request_sent: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  refunded: "bg-red-100 text-red-700",
};

export function PaymentsTab({ enquiryId }: { enquiryId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showRequest, setShowRequest] = useState(false);
  const [showReceive, setShowReceive] = useState<Payment | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", enquiryId],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("enquiry_id", enquiryId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: approvedTotal } = useQuery({
    queryKey: ["approved-quote-total", enquiryId],
    queryFn: async () => {
      const { data } = await supabase.from("quotations").select("total_amount").eq("enquiry_id", enquiryId).eq("status", "approved").limit(1).maybeSingle();
      return data ? Number(data.total_amount) : 0;
    },
  });

  const { data: enquiry } = useQuery({
    queryKey: ["enquiry-for-payments", enquiryId],
    queryFn: async () => {
      const { data } = await supabase.from("enquiries").select("ref_number, client_id, status").eq("id", enquiryId).single();
      return data;
    },
  });

  const { data: client } = useQuery({
    queryKey: ["client-for-payments", enquiry?.client_id],
    queryFn: async () => {
      if (!enquiry?.client_id) return null;
      const { data } = await supabase.from("clients").select("*").eq("id", enquiry.client_id).single();
      return data;
    },
    enabled: !!enquiry?.client_id,
  });

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings-bank"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "company_bank_details").maybeSingle();
      return data?.value ?? null;
    },
  });

  // Request advance form state
  const [reqAmount, setReqAmount] = useState("");
  const [reqDueDate, setReqDueDate] = useState("");
  const [reqInstructions, setReqInstructions] = useState("");

  const requestMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(reqAmount);
      const bankDetails = appSettings ?? "Contact Tiavda Enterprises for bank details";
      const formattedAmount = new Intl.NumberFormat("en-IN", {
        style: "currency", currency: "INR", maximumFractionDigits: 0,
      }).format(amount);
      const dueDate = reqDueDate
        ? new Date(reqDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const dueDateIso = reqDueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Insert payment record
      const { data: payment, error: insertErr } = await supabase.from("payments").insert({
        enquiry_id: enquiryId,
        payment_type: "advance",
        amount_requested: amount,
        status: "pending_request" as any,
      }).select().single();
      if (insertErr) throw insertErr;

      const refNumber = enquiry?.ref_number ?? enquiryId;
      const clientName = client?.name ?? "Client";
      const subject = `Advance Payment Request — ${refNumber}`;
      const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0F2A47; padding: 24px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Tiavda Enterprises</h1>
    <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px;">Payment Request</p>
  </div>
  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">Dear ${clientName},</p>
    <p>We request an advance payment for your project <span style="font-family: monospace; font-weight: bold;">${refNumber}</span>.</p>
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px;"><strong>Amount Due:</strong> ${formattedAmount}</p>
      <p style="margin: 0 0 16px;"><strong>Due Date:</strong> ${dueDate}</p>
      <p style="margin: 0 0 4px; font-weight: bold;">Bank Details:</p>
      <p style="margin: 0; white-space: pre-line; font-size: 14px;">${bankDetails}</p>
    </div>
    ${reqInstructions ? `<p style="font-size: 14px; color: #64748b;">${reqInstructions}</p>` : ""}
    <p style="margin-top: 32px;">Best regards,<br/><strong>Tiavda Enterprises</strong><br/>+91 8605811117</p>
  </div>
</body>
</html>`;

      // Send email
      if (client?.email && !client?.email_bounced) {
        const { error: emailErr } = await supabase.functions.invoke("send-email", {
          body: { to: client.email, subject, html_body: htmlBody },
        });
        if (!emailErr) {
          await supabase.from("communication_log").insert({
            enquiry_id: enquiryId,
            client_id: client.id,
            channel: "email" as any,
            direction: "outbound" as any,
            subject,
            body: "Payment request email sent",
            status: "sent",
            sent_by: user?.id ?? null,
          });
        }
      }

      // Send WhatsApp
      if (client?.whatsapp_number && !client?.whatsapp_invalid) {
        const { data: waData } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone_number: client.whatsapp_number,
            template_name: "qms_payment_request",
            parameters: [
              { name: "client_name", value: clientName },
              { name: "amount", value: formattedAmount },
              { name: "bank_details", value: bankDetails.slice(0, 100) },
              { name: "due_date", value: dueDate },
            ],
          },
        });
        if (waData?.whatsapp_invalid) {
          await supabase.from("clients").update({ whatsapp_invalid: true }).eq("id", client.id);
        } else {
          await supabase.from("communication_log").insert({
            enquiry_id: enquiryId,
            client_id: client.id,
            channel: "whatsapp" as any,
            direction: "outbound" as any,
            subject: `WhatsApp: Payment request ${refNumber}`,
            body: "Payment request WhatsApp sent",
            status: "sent",
            sent_by: user?.id ?? null,
          });
        }
      }

      // Update payment status to request_sent
      await supabase.from("payments").update({
        status: "request_sent" as any,
        request_sent_at: new Date().toISOString(),
      }).eq("id", payment.id);

      // Log event
      await supabase.from("enquiry_events").insert({
        enquiry_id: enquiryId,
        event_type: "payment_requested",
        triggered_by: user?.id ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Payment request sent to client!");
      queryClient.invalidateQueries({ queryKey: ["payments", enquiryId] });
      setShowRequest(false);
      setReqAmount(""); setReqDueDate(""); setReqInstructions("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Receive payment form state
  const [recAmount, setRecAmount] = useState("");
  const [recMethod, setRecMethod] = useState("");
  const [recRef, setRecRef] = useState("");
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10));
  const [recFile, setRecFile] = useState<File | null>(null);

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!showReceive) return;
      let receipt_url: string | null = null;
      if (recFile) {
        const path = `${enquiryId}/${recFile.name}`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, recFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = await supabase.storage.from("receipts").createSignedUrl(path, 86400 * 30);
        receipt_url = urlData?.signedUrl ?? null;
      }
      const { error } = await supabase.from("payments").update({
        status: "received" as any,
        amount_received: parseFloat(recAmount),
        payment_method: recMethod || null,
        transaction_ref: recRef || null,
        received_at: new Date(recDate).toISOString(),
        receipt_url,
      }).eq("id", showReceive.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment marked as received!");
      queryClient.invalidateQueries({ queryKey: ["payments", enquiryId] });
      setShowReceive(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openRequest = () => {
    setReqAmount(approvedTotal ? (approvedTotal * 0.5).toString() : "");
    setShowRequest(true);
  };

  const openReceive = (p: Payment) => {
    setRecAmount(p.amount_requested.toString());
    setRecDate(new Date().toISOString().slice(0, 10));
    setRecMethod(""); setRecRef(""); setRecFile(null);
    setShowReceive(p);
  };

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted/30 animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sora text-lg font-semibold text-foreground">Payments</h2>
        <Button onClick={openRequest} className="bg-gold text-white hover:bg-gold/90">
          Request Advance Payment
        </Button>
      </div>

      {!payments?.length ? (
        <EmptyState icon={CreditCard} title="No payment requested yet." />
      ) : (
        payments.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge className="capitalize">{p.payment_type}</Badge>
                  <Badge className={PAY_STATUS_COLORS[p.status] ?? ""}>{p.status.replace("_", " ")}</Badge>
                </div>
                {(p.status === "pending_request" || p.status === "request_sent") && (
                  <Button variant="outline" size="sm" onClick={() => openReceive(p)}>Mark Received</Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Requested:</span> <span className="font-medium">{formatCurrency(Number(p.amount_requested))}</span></div>
                {Number(p.amount_received) > 0 && (
                  <div><span className="text-muted-foreground">Received:</span> <span className="font-medium text-green-700">{formatCurrency(Number(p.amount_received))}</span></div>
                )}
                {p.request_sent_at && <div><span className="text-muted-foreground">Sent:</span> {formatDate(p.request_sent_at)}</div>}
                {p.received_at && <div><span className="text-muted-foreground">Received:</span> {formatDate(p.received_at)}</div>}
                {p.payment_method && <div><span className="text-muted-foreground">Method:</span> {p.payment_method}</div>}
                {p.transaction_ref && <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono text-xs">{p.transaction_ref}</span></div>}
              </div>
              {p.receipt_url && (
                <a href={p.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:underline">
                  <ExternalLink className="h-3 w-3" /> View Receipt
                </a>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Request Advance Sheet */}
      <Sheet open={showRequest} onOpenChange={setShowRequest}>
        <SheetContent>
          <SheetHeader><SheetTitle>Request Advance Payment</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Amount ₹</Label>
              <Input type="number" value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} min={1} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={reqDueDate} onChange={(e) => setReqDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Payment Instructions</Label>
              <Textarea placeholder="NEFT to HDFC A/C XXXXXXXXXX, IFSC: HDFCXXXXXXX" value={reqInstructions} onChange={(e) => setReqInstructions(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => requestMutation.mutate()} disabled={!reqAmount || requestMutation.isPending}>
              Send Request
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mark Received Sheet */}
      <Sheet open={!!showReceive} onOpenChange={(o) => !o && setShowReceive(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Mark Payment Received</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Amount Received ₹</Label>
              <Input type="number" value={recAmount} onChange={(e) => setRecAmount(e.target.value)} min={1} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={recMethod} onValueChange={setRecMethod}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  {["NEFT", "UPI", "Cheque", "Cash", "Online Transfer"].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction Reference</Label>
              <Input value={recRef} onChange={(e) => setRecRef(e.target.value)} />
            </div>
            <div>
              <Label>Date Received</Label>
              <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
            </div>
            <div>
              <Label>Receipt Upload</Label>
              <Input type="file" onChange={(e) => setRecFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button className="w-full" onClick={() => receiveMutation.mutate()} disabled={!recAmount || receiveMutation.isPending}>
              Confirm Received
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
