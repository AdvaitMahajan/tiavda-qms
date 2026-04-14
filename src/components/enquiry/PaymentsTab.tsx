import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
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

  // Request advance form state
  const [reqAmount, setReqAmount] = useState("");
  const [reqDueDate, setReqDueDate] = useState("");
  const [reqInstructions, setReqInstructions] = useState("");

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payments").insert({
        enquiry_id: enquiryId,
        payment_type: "advance",
        amount_requested: parseFloat(reqAmount),
        status: "pending_request",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment request saved. Send via email/WhatsApp from Communications tab.");
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
