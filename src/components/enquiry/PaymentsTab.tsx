import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { uploadToStorage, getSignedUrl } from "@/lib/storage";
import { sendNotification } from "@/lib/notifications";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/components/InvoicePDF";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, ExternalLink, FileText, Loader2 } from "lucide-react";
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

export function PaymentsTab({ enquiryId, onStatusChange }: { enquiryId: string; onStatusChange?: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canEditPayments } = useRole();
  const [showRequest, setShowRequest] = useState(false);
  const [showReceive, setShowReceive] = useState<Payment | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", enquiryId],
    queryFn: () => apiClient.get<Payment[]>("/payments", { enquiry_id: enquiryId }),
  });

  // The enquiry's contract value: the approved quotation if one exists, otherwise
  // the latest sent/accepted quotation (covers enquiries advanced before a formal
  // approve). Used as the basis for collection progress and final-payment defaults.
  const { data: approvedTotal } = useQuery({
    queryKey: ["quote-total", enquiryId],
    queryFn: async () => {
      const quotes = await apiClient.get<Array<{ total_amount: number; status: string }>>("/quotations", { enquiry_id: enquiryId });
      const approved = quotes.find((q) => q.status === "approved");
      if (approved) return Number(approved.total_amount);
      const latest = quotes.find((q) => ["accepted", "sent"].includes(q.status));
      return latest ? Number(latest.total_amount) : 0;
    },
  });

  const { data: enquiry } = useQuery({
    queryKey: ["enquiry-for-payments", enquiryId],
    queryFn: () => apiClient.get<Tables<"enquiries">>(`/enquiries/${enquiryId}`),
  });

  const { data: client } = useQuery({
    queryKey: ["client-for-payments", enquiry?.client_id],
    queryFn: () => apiClient.get<Tables<"clients">>(`/clients/${enquiry!.client_id}`),
    enabled: !!enquiry?.client_id,
  });

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings-bank"],
    queryFn: async () => {
      const bankKeys = [
        "bank_account_name", "bank_name", "bank_account_number",
        "bank_account_type", "bank_ifsc", "bank_branch", "bank_upi",
      ];
      const data = await apiClient.get<{ key: string; value: string }[]>("/settings", { keys: bankKeys.join(",") });
      if (!data?.length) return null;
      const m = new Map(data.map((r) => [r.key, r.value]));
      const lines = [
        m.get("bank_account_name") && `Account Name: ${m.get("bank_account_name")}`,
        m.get("bank_name") && `Bank: ${m.get("bank_name")}${m.get("bank_branch") ? `, ${m.get("bank_branch")}` : ""}`,
        m.get("bank_account_number") && `Account No: ${m.get("bank_account_number")} (${m.get("bank_account_type") || "Current"})`,
        m.get("bank_ifsc") && `IFSC: ${m.get("bank_ifsc")}`,
        m.get("bank_upi") && `UPI: ${m.get("bank_upi")}`,
      ].filter(Boolean);
      return lines.length > 0 ? lines.join("\n") : null;
    },
  });

  // Request payment form state
  const [reqType, setReqType] = useState<"advance" | "final">("advance");
  const [reqAmount, setReqAmount] = useState("");
  const [reqDueDate, setReqDueDate] = useState("");
  const [reqInstructions, setReqInstructions] = useState("");

  const requestMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(reqAmount);
      const bankDetails = appSettings ?? "Bank details not configured — please update Settings.";
      const formattedAmount = new Intl.NumberFormat("en-IN", {
        style: "currency", currency: "INR", maximumFractionDigits: 0,
      }).format(amount);
      const dueDate = reqDueDate
        ? new Date(reqDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const dueDateIso = reqDueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Reuse an existing un-paid request of the SAME type (e.g. the advance auto-created
      // on "Mark Won") so we don't create a duplicate request/email.
      const allPayments = await apiClient.get<Array<{ id: string; payment_type: string; status: string }>>("/payments", { enquiry_id: enquiryId });
      const existingReq = allPayments.find(
        (p) => p.payment_type === reqType && (p.status === "pending_request" || p.status === "request_sent"),
      );

      let payment: { id: string };
      if (existingReq) {
        await apiClient.patch(`/payments/${existingReq.id}`, { amount_requested: amount, due_date: dueDateIso });
        payment = { id: existingReq.id };
      } else {
        payment = await apiClient.post<{ id: string }>("/payments", {
          enquiry_id: enquiryId,
          payment_type: reqType,
          amount_requested: amount,
          due_date: dueDateIso,
          status: "pending_request",
        });
      }

      const refNumber = enquiry?.ref_number ?? enquiryId;
      const clientName = client?.name ?? "Client";
      const typeLabel = reqType === "final" ? "Final" : "Advance";
      const subject = `${typeLabel} Payment Request — ${refNumber}`;

      let delivered = false;
      const logComm = (channel: "email" | "whatsapp", ok: boolean, label: string) =>
        apiClient.post("/communications", {
          enquiry_id: enquiryId, client_id: client?.id,
          channel, direction: "outbound",
          subject: label, body: ok ? `${label} sent` : `${label} FAILED to send`,
          status: ok ? "sent" : "failed", sent_by: user?.id ?? null,
        });

      // Send email
      if (client?.email && !client?.email_bounced) {
        const { ok } = await sendNotification({
          to: client.email,
          template: "payment_request_detailed",
          params: {
            client_name: clientName,
            ref_number: refNumber,
            type_label: typeLabel,
            amount: formattedAmount,
            due_date: dueDate,
            bank_details: bankDetails,
            instructions: reqInstructions || undefined,
          },
        });
        await logComm("email", ok, subject);
        if (ok) delivered = true;
      }

      // Send WhatsApp
      if (client?.whatsapp_number && !client?.whatsapp_invalid) {
        let waData: { error?: string; whatsapp_invalid?: boolean } = {};
        try {
          waData = await apiClient.post<{ error?: string; whatsapp_invalid?: boolean }>("/integrations/whatsapp", {
            phone_number: client.whatsapp_number,
            template_name: "qms_payment_request",
            parameters: [
              { name: "client_name", value: clientName },
              { name: "amount", value: formattedAmount },
              { name: "bank_details", value: bankDetails.slice(0, 100) },
              { name: "due_date", value: dueDate },
            ],
          });
        } catch (e) {
          waData = { error: (e as Error).message };
        }
        if (waData?.whatsapp_invalid) {
          await apiClient.post(`/clients/${client.id}/flag-channel`, { channel: "whatsapp" });
          await logComm("whatsapp", false, `WhatsApp: Payment request ${refNumber}`);
        } else if (waData?.error) {
          await logComm("whatsapp", false, `WhatsApp: Payment request ${refNumber}`);
        } else {
          await logComm("whatsapp", true, `WhatsApp: Payment request ${refNumber}`);
          delivered = true;
        }
      }

      // Only mark the request as "sent" if a channel actually delivered.
      if (delivered) {
        await apiClient.patch(`/payments/${payment.id}`, {
          status: "request_sent",
          request_sent_at: new Date().toISOString(),
        });
        await apiClient.post(`/enquiries/${enquiryId}/events`, {
          event_type: "payment_requested",
        });
      }
      return { delivered };
    },
    onSuccess: (res) => {
      if (res?.delivered) {
        toast.success("Payment request sent to client!");
      } else {
        toast.error("Could NOT deliver the payment request (no working email/WhatsApp). Saved as pending — check the client's contact details.");
      }
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
        await uploadToStorage("receipts", path, recFile, { upsert: true });
        receipt_url = await getSignedUrl("receipts", path, 86400 * 30);
      }
      await apiClient.patch(`/payments/${showReceive.id}`, {
        status: "received",
        amount_received: parseFloat(recAmount),
        payment_method: recMethod || null,
        transaction_ref: recRef || null,
        received_at: new Date(recDate).toISOString(),
        receipt_url,
      });

      // Auto-transition enquiry to payment_received if currently approved
      if (enquiry && enquiry.status === "approved") {
        await apiClient.patch(`/enquiries/${enquiryId}`, {
          status: "payment_received",
          confirmed_date: new Date().toISOString().slice(0, 10),
        });
        await apiClient.post(`/enquiries/${enquiryId}/events`, {
          event_type: "status_change",
          from_status: "approved",
          to_status: "payment_received",
          metadata: { reason: "payment_received_auto_transition" },
        });
      }

      // Notify Mobilization Team Lead(s) about payment received
      const amt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(parseFloat(recAmount));
      const notifPayload = {
        type: "payment_received",
        title: `Payment Received — ${enquiry?.ref_number ?? ""}`,
        body: `${amt} received for ${enquiry?.ref_number ?? "enquiry"}${recMethod ? ` via ${recMethod}` : ""}. Ready for mobilization.`,
        enquiry_id: enquiryId,
        link: `/enquiries/${enquiryId}`,
      };

      // Find mob_lead users via profiles table
      const mobLeads = await apiClient.get<Array<{ id: string }>>("/profiles", { role: "mobilization_lead" });
      const targetUsers = mobLeads.length > 0
        ? mobLeads.map((p) => p.id)
        : user?.id ? [user.id] : [];

      for (const uid of targetUsers) {
        await apiClient.post("/notifications", { ...notifPayload, user_id: uid });
      }

      // Also notify current user as confirmation
      if (user?.id && !targetUsers.includes(user.id)) {
        await apiClient.post("/notifications", { ...notifPayload, user_id: user.id });
      }
    },
    onSuccess: () => {
      toast.success("Payment marked as received!");
      queryClient.invalidateQueries({ queryKey: ["payments", enquiryId] });
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setShowReceive(null);
      onStatusChange?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openRequest = (type: "advance" | "final" = "advance") => {
    setReqType(type);
    // Advance defaults to 50% of the approved quote; final to the remaining balance.
    const totalReceived = (payments ?? [])
      .filter((p) => p.status === "received" || p.status === "partial")
      .reduce((s, p) => s + Number(p.amount_received ?? 0), 0);
    const def = type === "advance"
      ? (approvedTotal ? approvedTotal * 0.5 : 0)
      : Math.max(0, (approvedTotal ?? 0) - totalReceived);
    setReqAmount(def ? String(Math.round(def)) : "");
    setReqDueDate(""); setReqInstructions("");
    setShowRequest(true);
  };

  const openReceive = (p: Payment) => {
    setRecAmount(p.amount_requested.toString());
    setRecDate(new Date().toISOString().slice(0, 10));
    setRecMethod(""); setRecRef(""); setRecFile(null);
    setShowReceive(p);
  };

  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);

  const handleGenerateInvoice = async (p: Payment) => {
    if (!enquiry || !client) {
      toast.error("Missing enquiry or client details");
      return;
    }
    setGeneratingInvoice(p.id);
    try {
      const bankKeys = [
        "bank_account_name", "bank_name", "bank_account_number",
        "bank_account_type", "bank_ifsc", "bank_branch", "bank_upi",
        "company_gst", "gst_rate", "company_state",
      ];
      const settingsData = await apiClient.get<{ key: string; value: string }[]>("/settings", { keys: bankKeys.join(",") });
      const sm = new Map(settingsData.map((r) => [r.key, r.value]));

      const bankObj = {
        account_name: sm.get("bank_account_name") ?? undefined,
        bank_name: sm.get("bank_name") ?? undefined,
        branch: sm.get("bank_branch") ?? undefined,
        account_number: sm.get("bank_account_number") ?? undefined,
        account_type: sm.get("bank_account_type") ?? undefined,
        ifsc: sm.get("bank_ifsc") ?? undefined,
        upi: sm.get("bank_upi") ?? undefined,
      };
      const hasBankDetails = Object.values(bankObj).some(Boolean);

      const amount = Number(p.amount_received) > 0 ? Number(p.amount_received) : Number(p.amount_requested);
      const gstRate = parseFloat(sm.get("gst_rate") ?? "0") || 0;
      const baseAmount = +(amount / (1 + gstRate / 100)).toFixed(2);
      const gstAmount = +(amount - baseAmount).toFixed(2);

      const companyState = (sm.get("company_state") ?? "").trim().toLowerCase();
      const clientCity = (client.city ?? "").trim().toLowerCase();
      const isSameState = companyState !== "" && companyState === clientCity;
      const gstType = isSameState ? "cgst_sgst" as const : "igst" as const;

      const invDate = p.received_at ? new Date(p.received_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const invNum = `TIV-INV-${invDate.slice(0, 4)}-${p.id.slice(0, 6).toUpperCase()}`;

      const blob = await pdf(
        <InvoicePDF
          invoiceNumber={invNum}
          invoiceDate={invDate}
          refNumber={enquiry.ref_number ?? ""}
          client={{
            name: client.name,
            company: (client as any).company ?? null,
            phone: client.phone ?? "",
            email: client.email ?? null,
            city: client.city ?? "",
            gst_number: (client as any).gst_number ?? null,
          }}
          payments={[{
            description: `${p.payment_type === "advance" ? "Advance" : "Final"} payment for ${enquiry.ref_number}`,
            amount: baseAmount,
          }]}
          subtotal={baseAmount}
          gstRate={gstRate}
          gstType={gstType}
          gstAmount={gstAmount}
          totalAmount={amount}
          bankDetails={hasBankDetails ? bankObj : null}
          companyGst={sm.get("company_gst") ?? undefined}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Invoice PDF downloaded");
    } catch (err: any) {
      console.error("Invoice generation error:", err);
      toast.error("Failed to generate invoice");
    } finally {
      setGeneratingInvoice(null);
    }
  };

  if (isLoading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted/30 animate-pulse rounded-lg" />)}</div>;

  // Per-enquiry collection progress against the approved quotation total.
  const totalReceived = (payments ?? [])
    .filter((p) => p.status === "received" || p.status === "partial")
    .reduce((s, p) => s + Number(p.amount_received ?? 0), 0);
  const expectedTotal = approvedTotal ?? 0;
  const collectedPct = expectedTotal > 0 ? Math.min(100, Math.round((totalReceived / expectedTotal) * 100)) : (totalReceived > 0 ? 100 : 0);
  const outstandingForEnquiry = Math.max(0, expectedTotal - totalReceived);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sora text-lg font-semibold text-foreground">Payments</h2>
        {canEditPayments && (
          <div className="flex gap-2">
            <Button onClick={() => openRequest("advance")} className="bg-gold text-white hover:bg-gold/90">
              Request Advance
            </Button>
            <Button onClick={() => openRequest("final")} variant="outline">
              Request Final
            </Button>
          </div>
        )}
      </div>

      {/* Per-enquiry collection progress */}
      {(expectedTotal > 0 || totalReceived > 0) && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-end justify-between mb-2">
              <div>
                <div className="text-[13px] font-semibold" style={{ color: "#546E7A" }}>Collected for this enquiry</div>
                <div className="font-sora text-xl font-bold" style={{ color: "#0A1929" }}>
                  {formatCurrency(totalReceived)}
                  {expectedTotal > 0 && <span className="text-[13px] font-medium" style={{ color: "#94A3B8" }}> of {formatCurrency(expectedTotal)}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-sora text-lg font-bold" style={{ color: collectedPct >= 100 ? "#15673A" : "#1565C0" }}>{collectedPct}%</div>
                {outstandingForEnquiry > 0 && <div className="text-[12px]" style={{ color: "#92400E" }}>{formatCurrency(outstandingForEnquiry)} outstanding</div>}
              </div>
            </div>
            <div style={{ height: "10px", borderRadius: "999px", background: "#EEF2F7", overflow: "hidden" }}>
              <div style={{ width: `${collectedPct}%`, height: "100%", borderRadius: "999px", transition: "width 300ms",
                background: collectedPct >= 100 ? "linear-gradient(90deg,#15803D,#22C55E)" : "linear-gradient(90deg,#1565C0,#2979FF)" }} />
            </div>
            {expectedTotal === 0 && (
              <p className="text-[12px] mt-2" style={{ color: "#94A3B8" }}>No approved quotation yet — progress is shown against received payments only.</p>
            )}
          </CardContent>
        </Card>
      )}

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
                <div className="flex items-center gap-2">
                  {p.status === "received" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateInvoice(p)}
                      disabled={generatingInvoice === p.id}
                    >
                      {generatingInvoice === p.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                      Invoice
                    </Button>
                  )}
                  {canEditPayments && (p.status === "pending_request" || p.status === "request_sent") && (
                    <Button variant="outline" size="sm" onClick={() => openReceive(p)}>Mark Received</Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Requested:</span> <span className="font-medium">{formatCurrency(Number(p.amount_requested))}</span></div>
                {Number(p.amount_received) > 0 && (
                  <div><span className="text-muted-foreground">Received:</span> <span className="font-medium text-green-700">{formatCurrency(Number(p.amount_received))}</span></div>
                )}
                {p.request_sent_at && <div><span className="text-muted-foreground">Sent:</span> {formatDate(p.request_sent_at)}</div>}
                {p.received_at && <div><span className="text-muted-foreground">Received:</span> {formatDate(p.received_at)}</div>}
                {p.payment_method && <div><span className="text-muted-foreground">Method:</span> {p.payment_method}</div>}
                {p.transaction_ref && <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono text-[13px]">{p.transaction_ref}</span></div>}
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

      {/* Request Payment Dialog */}
      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Request {reqType === "final" ? "Final" : "Advance"} Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Payment Type</Label>
              <div className="flex gap-2 mt-1.5">
                {(["advance", "final"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReqType(t)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
                    style={reqType === t
                      ? { background: "#EBF2FF", color: "#1565C0", border: "1.5px solid #BFDBFE" }
                      : { background: "#F0F4F8", color: "#546E7A", border: "1.5px solid #E0E7EF" }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
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
        </DialogContent>
      </Dialog>

      {/* Mark Received Dialog */}
      <Dialog open={!!showReceive} onOpenChange={(o) => !o && setShowReceive(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mark Payment Received</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
