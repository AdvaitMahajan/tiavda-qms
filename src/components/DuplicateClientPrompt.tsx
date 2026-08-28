// ─────────────────────────────────────────────────────────────────────────────
// Shown whenever a phone number being saved already belongs to a client. Two
// readings are both legitimate — the same client getting in touch again, or a
// different client on a shared line (family, office landline, broker) — so the
// system asks instead of guessing.
//
// Used by AddLeadDialog (adding a lead) and Clients (adding a client). Any new
// screen that creates a client should route through here too.
// ─────────────────────────────────────────────────────────────────────────────
import type { Tables } from "@/integrations/supabase/types";
import { clientDisplayName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface DuplicateClientPromptProps {
  /** Clients already on file with this number. Non-empty ⇒ the prompt is open. */
  matches: Tables<"clients">[];
  /** The number as typed, shown back to the user. */
  phone: string;
  /** Label for the record being created, e.g. the typed company or name. */
  newLabel: string;
  /** Wording differs slightly between adding a lead and adding a client. */
  mode: "lead" | "client";
  busy?: boolean;
  onCancel: () => void;
  /** Use this existing client (add the lead under them / open their record). */
  onUseExisting: (client: Tables<"clients">) => void;
  /** Create a separate client that happens to share the number. */
  onCreateSeparate: () => void;
}

export function DuplicateClientPrompt({
  matches,
  phone,
  newLabel,
  mode,
  busy = false,
  onCancel,
  onUseExisting,
  onCreateSeparate,
}: DuplicateClientPromptProps) {
  const multiple = matches.length > 1;
  const useLabel = mode === "lead" ? "Add to this client" : "Open this client";
  const question =
    mode === "lead"
      ? "Add this lead under them, or record it as a separate client?"
      : "Is this the same client, or a different one sharing the number?";

  return (
    <Dialog open={matches.length > 0} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent
        className="sm:max-w-[560px] p-0 gap-0"
        style={{ borderRadius: "16px", border: "none", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.15)" }}
      >
        <DialogHeader className="px-8 pt-8 pb-5" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <DialogTitle style={{ fontFamily: "Sora, sans-serif", fontSize: "20px", fontWeight: 700, color: "#0F172A" }}>
            This number is already on file
          </DialogTitle>
          <p style={{ fontSize: "14px", color: "#64748B", marginTop: "6px" }}>
            {phone} {multiple ? "belongs to these clients" : "belongs to an existing client"}. {question}
          </p>
        </DialogHeader>

        <div className="px-8 py-5 space-y-3 max-h-[45vh] overflow-y-auto">
          {matches.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-lg px-4 py-3"
              style={{ border: "1px solid #E2E8F0", background: "#FAFBFC" }}
            >
              <div className="min-w-0">
                <div className="font-medium truncate" style={{ fontSize: "14px", color: "#0F172A" }}>
                  {clientDisplayName(c)}
                </div>
                <div className="truncate" style={{ fontSize: "13px", color: "#94A3B8" }}>
                  {[c.city, c.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Button
                className="h-9 shrink-0 text-sm font-semibold rounded-lg px-4"
                style={{ background: "#0F172A", color: "#FFFFFF" }}
                disabled={busy}
                onClick={() => onUseExisting(c)}
              >
                {useLabel}
              </Button>
            </div>
          ))}

          <div
            className="flex items-center justify-between gap-4 rounded-lg px-4 py-3"
            style={{ border: "1px dashed #CBD5E1" }}
          >
            <div className="min-w-0">
              <div className="font-medium truncate" style={{ fontSize: "14px", color: "#0F172A" }}>
                {newLabel || "New client"}
              </div>
              <div className="truncate" style={{ fontSize: "13px", color: "#94A3B8" }}>
                Different client, same number
              </div>
            </div>
            <Button
              variant="outline"
              className="h-9 shrink-0 text-sm font-medium rounded-lg px-4"
              disabled={busy}
              onClick={onCreateSeparate}
            >
              Create separately
            </Button>
          </div>
        </div>

        <div className="px-8 py-4" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
          <Button variant="ghost" className="h-9 text-sm" disabled={busy} onClick={onCancel}>
            Back to editing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
