import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Check, Plus, Trash2, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { relativeTime } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

type PendingWork = {
  id: string;
  title: string;
  status: "open" | "done";
  created_at: string;
  done_at: string | null;
};

/**
 * Pending Work — type anything (even just a phone number), press Enter, and it
 * sits here until someone ticks it done.
 */
export function PendingWorkCard({ style }: { style: React.CSSProperties }) {
  const queryClient = useQueryClient();
  const { isViewer } = useRole();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pending-work"],
    queryFn: () => apiClient.get<PendingWork[]>("/pending-work"),
    refetchInterval: 20_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["pending-work"] });

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setAdding(true);
    try {
      await apiClient.post("/pending-work", { title });
      setDraft("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not add the entry");
    } finally {
      setAdding(false);
    }
  };

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not update the entry");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={style}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: "28px", height: "28px", background: "#FEF3C7", flexShrink: 0 }}
        >
          <ClipboardList style={{ width: "14px", height: "14px", color: "#B7791F" }} />
        </div>
        <h2 className="font-semibold text-base" style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}>
          Pending Work
        </h2>
        {items.length > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "#FEF3C7", color: "#92400E" }}>
            {items.length}
          </span>
        )}
      </div>

      {!isViewer && (
        <form
          className="flex gap-2 mb-3"
          onSubmit={(e) => { e.preventDefault(); void add(); }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a number or a note, press Enter…"
            maxLength={500}
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
            style={{ border: "1px solid #E0E7EF", background: "#FAFBFC", color: "#0A1929" }}
          />
          <button
            type="submit"
            disabled={adding || !draft.trim()}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(90deg,#B7791F,#D4930A)" }}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm py-6 text-center" style={{ color: "#546E7A" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "#546E7A" }}>Nothing pending.</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="group flex items-center gap-3 rounded-lg p-2.5 hover:bg-slate-50">
              {!isViewer && (
                <button
                  title="Mark done"
                  aria-label={`Mark "${it.title}" done`}
                  disabled={busyId === it.id}
                  onClick={() => void act(it.id, () => apiClient.patch(`/pending-work/${it.id}`, { status: "done" }), "Marked done")}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-green-100"
                  style={{ border: "2px solid #15673A", color: "#15673A" }}
                >
                  {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 sm:opacity-0 sm:group-hover:opacity-100" />}
                </button>
              )}
              <span className="min-w-0 flex-1 break-words text-sm" style={{ color: "#0A1929" }}>{it.title}</span>
              <span className="text-[12px] flex-shrink-0" style={{ color: "#546E7A" }}>{relativeTime(it.created_at)}</span>
              {!isViewer && (
                <button
                  title="Delete"
                  aria-label={`Delete "${it.title}"`}
                  disabled={busyId === it.id}
                  onClick={() => void act(it.id, () => apiClient.del(`/pending-work/${it.id}`), "Deleted")}
                  className="flex-shrink-0 rounded p-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-50"
                  style={{ color: "#B91C1C" }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
