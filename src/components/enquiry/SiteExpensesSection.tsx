import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { uploadToStorage, getSignedUrl } from "@/lib/storage";
import { useRole } from "@/hooks/useRole";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Wallet, Plus, Check, X, Trash2, ExternalLink } from "lucide-react";

type SiteExpense = {
  id: string;
  enquiry_id: string;
  description: string | null;
  amount: number;
  expense_date: string | null;
  receipt_url: string | null;
  status: "pending" | "approved" | "rejected";
  decision_note: string | null;
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#FEF3C7", color: "#92400E", label: "Pending" },
  approved: { bg: "#DCFCE7", color: "#15673A", label: "Approved" },
  rejected: { bg: "#FEE2E2", color: "#B91C1C", label: "Rejected" },
};

/**
 * Site expenses under Mobilisation (#6). The Site Supervisor (a mobilising role)
 * records expenses; a Manager (Admin / Execution Head) approves or rejects.
 */
export function SiteExpensesSection({ enquiryId }: { enquiryId: string }) {
  const { canMobilise, canApproveExpense } = useRole();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: expenses = [] } = useQuery({
    queryKey: ["site-expenses", enquiryId],
    queryFn: () => apiClient.get<SiteExpense[]>("/site-expenses", { enquiry_id: enquiryId }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["site-expenses", enquiryId] });
  const total = expenses.filter((e) => e.status !== "rejected").reduce((s, e) => s + Number(e.amount || 0), 0);
  const approved = expenses.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount || 0), 0);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!(amt > 0)) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      let receipt_url: string | null = null;
      if (file) {
        const path = `${enquiryId}/expenses/${Date.now()}_${file.name}`;
        await uploadToStorage("receipts", path, file, { upsert: true });
        receipt_url = await getSignedUrl("receipts", path, 86400 * 30);
      }
      await apiClient.post("/site-expenses", {
        enquiry_id: enquiryId,
        amount: amt,
        description: description.trim() || null,
        expense_date: expenseDate || null,
        receipt_url,
      });
      toast.success("Expense recorded — awaiting approval");
      setAdding(false); setAmount(""); setDescription(""); setFile(null);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "Could not record expense");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      let note: string | null = null;
      if (action === "reject") note = window.prompt("Reason for rejection (optional):", "") ?? null;
      await apiClient.post(`/site-expenses/${id}/${action}`, { note });
      toast.success(action === "approve" ? "Expense approved" : "Expense rejected");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this pending expense?")) return;
    setBusyId(id);
    try {
      await apiClient.del(`/site-expenses/${id}`);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "Could not delete");
    } finally {
      setBusyId(null);
    }
  };

  if (!canMobilise && !canApproveExpense) return null;

  return (
    <div className="mt-3" style={{ borderTop: "1px solid #E0E7EF", paddingTop: "12px" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: "#546E7A" }}>
          <Wallet className="h-3.5 w-3.5" /> Site Expenses
        </p>
        {canMobilise && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg"
            style={{ background: "#EBF2FF", color: "#1565C0" }}
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 p-2.5 rounded-lg mb-2" style={{ background: "#F8FAFC", border: "1px solid #E0E7EF" }}>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="rounded-lg border px-2.5 py-1.5 text-[13px]" style={{ borderColor: "#E0E7EF" }} />
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)}
              className="rounded-lg border px-2.5 py-1.5 text-[13px]" style={{ borderColor: "#E0E7EF" }} />
          </div>
          <input placeholder="Description (e.g. diesel, labour, transport)" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border px-2.5 py-1.5 text-[13px]" style={{ borderColor: "#E0E7EF" }} />
          <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12px]" />
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: "#1565C0" }}>
              {saving ? "Saving…" : "Submit"}
            </button>
            <button onClick={() => setAdding(false)} className="text-[13px] px-3 py-1.5 rounded-lg" style={{ background: "#F0F4F8", color: "#546E7A" }}>Cancel</button>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <p className="text-[13px]" style={{ color: "#94A3B8" }}>No expenses recorded.</p>
      ) : (
        <div className="space-y-1.5">
          {expenses.map((e) => {
            const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending;
            return (
              <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ border: "1px solid #EEF2F6" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: "#0A1929" }}>
                    {formatCurrency(Number(e.amount))}
                    {e.description ? <span className="font-normal" style={{ color: "#546E7A" }}> — {e.description}</span> : null}
                  </div>
                  <div className="text-[12px]" style={{ color: "#94A3B8" }}>
                    {e.expense_date ?? ""}{e.decision_note ? ` · ${e.decision_note}` : ""}
                  </div>
                </div>
                {e.receipt_url && (
                  <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" title="Receipt" style={{ color: "#1565C0" }}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: st.bg, color: st.color }}>
                  {st.label}
                </span>
                {canApproveExpense && e.status === "pending" && (
                  <div className="flex gap-1">
                    <button onClick={() => decide(e.id, "approve")} disabled={busyId === e.id} title="Approve"
                      className="p-1 rounded-lg" style={{ background: "#DCFCE7", color: "#15673A" }}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => decide(e.id, "reject")} disabled={busyId === e.id} title="Reject"
                      className="p-1 rounded-lg" style={{ background: "#FEE2E2", color: "#B91C1C" }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {canMobilise && !canApproveExpense && e.status === "pending" && (
                  <button onClick={() => remove(e.id)} disabled={busyId === e.id} title="Delete" className="p-1 rounded-lg" style={{ color: "#B91C1C" }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex justify-between text-[12px] pt-1" style={{ color: "#546E7A" }}>
            <span>Total (excl. rejected): <strong>{formatCurrency(total)}</strong></span>
            <span>Approved: <strong style={{ color: "#15673A" }}>{formatCurrency(approved)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
