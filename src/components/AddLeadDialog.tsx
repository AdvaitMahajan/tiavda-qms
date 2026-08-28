import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { clientDisplayName } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { createIntakeToken, getIntakeUrl } from "@/lib/intakeTokenUtils";
import { sendNotification } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover as ComboPopover, PopoverContent as ComboPopoverContent, PopoverTrigger as ComboPopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DuplicateClientPrompt } from "@/components/DuplicateClientPrompt";
import { normalizePhone, validateIndianMobile, phoneKey } from "@/lib/phone";

type LeadForm = {
  clientMode: "new" | "existing";
  clientId: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  serviceType: "soil_investigation" | "consultancy";
  source: string;
  city: string;
  requirement: string;
};

const EMPTY_LEAD: LeadForm = {
  clientMode: "new",
  clientId: "",
  name: "",
  phone: "",
  email: "",
  company: "",
  serviceType: "soil_investigation",
  source: "phone_call",
  city: "",
  requirement: "",
};

/** How the user chose to resolve a duplicate phone number. */
type DupResolution =
  | { kind: "attach"; client: Tables<"clients"> }
  | { kind: "separate" };

function ClientCombobox({
  clients,
  value,
  onChange,
}: {
  clients: { id: string; name: string; company?: string | null; city: string; phone: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);
  return (
    <ComboPopover open={open} onOpenChange={setOpen}>
      <ComboPopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          className="w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm"
          style={{
            border: "1px solid #E0E7EF",
            background: "#FAFBFC",
            color: selected ? "#0A1929" : "#94A3B8",
            minHeight: "42px",
          }}
        >
          {selected ? `${clientDisplayName(selected)} — ${selected.city}` : "Search or select a client..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </ComboPopoverTrigger>
      <ComboPopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type client name..." />
          <CommandList>
            <CommandEmpty>No client found.</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.company ?? ""} ${c.name} ${c.city} ${c.phone}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")}
                  />
                  <div>
                    <div className="font-medium">{clientDisplayName(c)}</div>
                    <div className="text-[13px] text-muted-foreground">{c.city} &middot; {c.phone}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </ComboPopoverContent>
    </ComboPopover>
  );
}

export function AddLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leadForm, setLeadForm] = useState<LeadForm>({ ...EMPTY_LEAD });
  const [leadSaving, setLeadSaving] = useState(false);
  // Clients already on file with this phone number. Non-empty ⇒ the duplicate
  // prompt is showing and the lead is parked until the user picks a resolution.
  const [dupMatches, setDupMatches] = useState<Tables<"clients">[]>([]);

  const { data: clientsList = [] } = useQuery({
    queryKey: ["clients-for-new-enquiry"],
    queryFn: () => apiClient.get<Tables<"clients">[]>("/clients", { order: "name" }),
    enabled: open,
  });

  /**
   * Find clients on file with this phone. The API matches the string exactly, so
   * we also compare the last 10 digits locally — otherwise "+91 98765 43210" and
   * "9876543210" read as two different people and the duplicate never surfaces.
   */
  const findDuplicateClients = async (phone: string): Promise<Tables<"clients">[]> => {
    const exact = await apiClient.get<Tables<"clients">[]>("/clients", { phone });
    const digits = phoneKey(phone);
    const local = digits ? clientsList.filter((c) => phoneKey(c.phone ?? "") === digits) : [];
    const byId = new Map<string, Tables<"clients">>();
    for (const c of [...exact, ...local]) byId.set(c.id, c);
    return [...byId.values()];
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setLeadForm({ ...EMPTY_LEAD });
      setDupMatches([]);
    }
    onOpenChange(isOpen);
  };

  /**
   * Save the lead. `resolution` is null on the first attempt — if the phone is
   * already on file we stop and let the user choose. Re-entered with "attach"
   * (second enquiry for that client) or "separate" (a genuinely different client
   * who happens to share the number).
   */
  const submitLead = async (resolution: DupResolution | null) => {
    setLeadSaving(true);
    try {
      const { clientMode, clientId, name, phone, email, company, serviceType, source, city, requirement } = leadForm;

      if (clientMode === "new" && (!name.trim() || !phone.trim() || !company.trim())) {
        throw new Error("Client name, company name and phone are required.");
      }
      if (clientMode === "new" && !validateIndianMobile(phone)) {
        throw new Error("Enter a valid Indian mobile number.");
      }
      if (clientMode === "existing" && !clientId) {
        throw new Error("Please select a client.");
      }
      if (!city.trim()) {
        throw new Error("City is required.");
      }

      const leadMeta = {
        lead_source: source,
        service_type_interest: serviceType,
        requirement_notes: requirement.trim() || null,
      };

      // On an existing client these fields are first-touch history — fill blanks
      // only. Overwriting them wipes the earlier lead's source and notes, and the
      // client's city is their own, not this enquiry's site city.
      const fillBlanks = async (client: Tables<"clients">) => {
        const patch: Record<string, string> = {};
        if (!client.email && email.trim()) patch.email = email.trim();
        if (!client.company && company.trim()) patch.company = company.trim();
        if (!client.lead_source) patch.lead_source = source;
        if (!client.service_type_interest) patch.service_type_interest = serviceType;
        if (!client.requirement_notes && requirement.trim()) patch.requirement_notes = requirement.trim();
        if (Object.keys(patch).length) await apiClient.patch(`/clients/${client.id}`, patch);
      };

      let resolvedClient: Tables<"clients"> | null = null;

      if (clientMode === "existing") {
        resolvedClient = clientsList.find((c) => c.id === clientId) ?? null;
        if (!resolvedClient) throw new Error("Please select a client.");
        await fillBlanks(resolvedClient);
      } else if (resolution?.kind === "attach") {
        resolvedClient = resolution.client;
        await fillBlanks(resolvedClient);
      } else {
        const normalisedPhone = normalizePhone(phone);
        if (resolution === null) {
          const dups = await findDuplicateClients(normalisedPhone);
          if (dups.length) {
            setDupMatches(dups); // park the lead until the user decides
            return;
          }
        }
        resolvedClient = await apiClient.post<Tables<"clients">>("/clients", {
          name: name.trim(),
          phone: normalisedPhone,
          email: email.trim() || null,
          company: company.trim() || null,
          city: city.trim(),
          source: "manual",
          ...leadMeta,
        });
      }

      if (!resolvedClient) throw new Error("Could not resolve the client for this lead.");

      // Create enquiry record so it appears in Kanban immediately
      const initialStatus = serviceType === "soil_investigation" ? "intake_pending" : "new";
      const newEnquiry = await apiClient.post<{ id: string; ref_number: string }>("/enquiries", {
        client_id: resolvedClient.id,
        site_city: city.trim(),
        service_type: serviceType,
        lead_source: source,
        status: initialStatus,
        remarks: requirement.trim() || null,
      });

      // Auto-send intake link for SI leads. Addressed from the resolved client
      // record, not the form — when attaching (or picking an existing client)
      // the form's name/email/phone are blank or belong to the new contact.
      if (serviceType === "soil_investigation") {
        try {
          const token = await createIntakeToken(resolvedClient.id, "", newEnquiry.id);
          const intakeUrl = getIntakeUrl(token);
          const clientName = resolvedClient.name?.trim() || "Client";
          const clientEmail = resolvedClient.email?.trim() || null;
          const clientPhone = resolvedClient.phone?.trim() || null;

          let linkDelivered = false;
          if (clientEmail) {
            const { ok } = await sendNotification({
              to: clientEmail,
              template: "intake_link",
              // Initial communication: site address isn't known yet, so company only.
              subjectPrefix: resolvedClient.company?.trim() || undefined,
              params: { client_name: clientName, ref_number: newEnquiry.ref_number, intake_url: intakeUrl },
            });
            if (ok) linkDelivered = true;
          }

          if (clientPhone) {
            const waNumber = clientPhone.startsWith("+") ? clientPhone : `+91${clientPhone.replace(/\D/g, "")}`;
            try {
              const r = await apiClient.post<{ error?: string }>("/integrations/whatsapp", {
                phone_number: waNumber,
                template_name: "qms_intake_form",
                parameters: [
                  { name: "client_name", value: clientName },
                  { name: "ref_number", value: newEnquiry.ref_number },
                  { name: "link", value: intakeUrl },
                ],
              });
              if (!r.error) linkDelivered = true;
            } catch {
              /* non-blocking */
            }
          }

          if (linkDelivered) {
            toast.success("Intake link sent to the client.");
          } else {
            toast.warning("Lead saved, but the intake link could NOT be sent — share it manually from the client page.");
          }
        } catch (intakeErr) {
          console.warn("Auto intake link failed:", intakeErr);
        }
      }

      toast.success(`Lead ${newEnquiry.ref_number} captured!`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-for-new-enquiry"] });
      queryClient.invalidateQueries({ queryKey: ["enquiries-list"] });
      handleClose(false);
      navigate(`/enquiries/${newEnquiry.id}`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to add lead");
    } finally {
      setLeadSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto p-0 gap-0"
        style={{ borderRadius: "16px", border: "none", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.15)" }}
      >
        <DialogHeader className="px-8 pt-8 pb-6" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <DialogTitle style={{ fontFamily: "Sora, sans-serif", fontSize: "22px", fontWeight: 700, color: "#0F172A" }}>
            Add Lead
          </DialogTitle>
          <p style={{ fontSize: "14px", color: "#94A3B8", marginTop: "4px" }}>
            Capture a new business lead — send intake form later
          </p>
        </DialogHeader>

        <div className="space-y-6 px-8 py-6">
          {/* Client toggle */}
          <div>
            <label className="block text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "#64748B" }}>Client</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
              {(["new", "existing"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLeadForm((p) => ({ ...p, clientMode: mode, clientId: "", name: "", phone: "", email: "", company: "" }))}
                  className="flex-1 text-sm font-medium py-2.5 transition-colors"
                  style={{
                    background: leadForm.clientMode === mode ? "#0F172A" : "#FFFFFF",
                    color: leadForm.clientMode === mode ? "#FFFFFF" : "#64748B",
                  }}
                >
                  {mode === "new" ? "New Client" : "Existing Client"}
                </button>
              ))}
            </div>
          </div>

          {leadForm.clientMode === "existing" ? (
            <ClientCombobox
              clients={clientsList}
              value={leadForm.clientId}
              onChange={(v) => setLeadForm((p) => ({ ...p, clientId: v }))}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <div>
                <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>Name <span style={{ color: "#DC2626" }}>*</span></label>
                <Input
                  value={leadForm.name}
                  onChange={(e) => setLeadForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Client or company name"
                  className="h-11"
                  style={{ fontSize: "14px" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>Phone <span style={{ color: "#DC2626" }}>*</span></label>
                <Input
                  value={leadForm.phone}
                  onChange={(e) => setLeadForm((p) => ({ ...p, phone: e.target.value }))}
                  onBlur={() => setLeadForm((p) => (p.phone ? { ...p, phone: normalizePhone(p.phone) } : p))}
                  placeholder="+91XXXXXXXXXX"
                  className="h-11"
                  style={{ fontSize: "14px" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>Email</label>
                <Input
                  type="email"
                  value={leadForm.email}
                  onChange={(e) => setLeadForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Company name"
                  className="h-11"
                  style={{ fontSize: "14px" }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>Company <span style={{ color: "#C62828" }}>*</span></label>
                <Input
                  value={leadForm.company}
                  onChange={(e) => setLeadForm((p) => ({ ...p, company: e.target.value }))}
                  placeholder="Optional"
                  className="h-11"
                  style={{ fontSize: "14px" }}
                />
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ height: "1px", background: "#F1F5F9" }} />

          {/* Service Type */}
          <div>
            <label className="block text-[13px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: "#64748B" }}>Service Type</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
              {(["soil_investigation", "consultancy"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setLeadForm((p) => ({ ...p, serviceType: st }))}
                  className="flex-1 text-sm font-medium py-2.5 transition-colors"
                  style={{
                    background: leadForm.serviceType === st ? "#0F172A" : "#FFFFFF",
                    color: leadForm.serviceType === st ? "#FFFFFF" : "#64748B",
                  }}
                >
                  {st === "soil_investigation" ? "Soil Investigation" : "Consultancy"}
                </button>
              ))}
            </div>
          </div>

          {/* Lead Source + City */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>Lead Source <span style={{ color: "#DC2626" }}>*</span></label>
              <Select value={leadForm.source} onValueChange={(v) => setLeadForm((p) => ({ ...p, source: v }))}>
                <SelectTrigger className="h-11" style={{ fontSize: "14px" }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="missed_call">Missed Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="just_dial">Just Dial</SelectItem>
                  <SelectItem value="indiamart">IndiaMart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>City <span style={{ color: "#DC2626" }}>*</span></label>
              <Input
                value={leadForm.city}
                onChange={(e) => setLeadForm((p) => ({ ...p, city: e.target.value }))}
                placeholder="e.g. Pune"
                className="h-11"
                style={{ fontSize: "14px" }}
              />
            </div>
          </div>

          {/* Requirement */}
          <div>
            <label className="block text-[13px] font-medium mb-2" style={{ color: "#64748B" }}>Requirement / Notes</label>
            <Textarea
              value={leadForm.requirement}
              onChange={(e) => setLeadForm((p) => ({ ...p, requirement: e.target.value }))}
              placeholder="Brief description of what the client needs…"
              rows={4}
              style={{ fontSize: "14px", resize: "none" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 flex gap-3" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
          <Button
            variant="outline"
            className="flex-1 h-11 text-sm font-medium rounded-lg"
            onClick={() => handleClose(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-11 text-sm font-semibold rounded-lg"
            style={{ background: "#0F172A", color: "#FFFFFF" }}
            disabled={leadSaving}
            onClick={() => void submitLead(null)}
          >
            {leadSaving ? "Saving…" : "Add Lead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <DuplicateClientPrompt
      matches={dupMatches}
      phone={normalizePhone(leadForm.phone)}
      newLabel={leadForm.company.trim() || leadForm.name.trim()}
      mode="lead"
      busy={leadSaving}
      onCancel={() => setDupMatches([])}
      onUseExisting={(client) => void submitLead({ kind: "attach", client })}
      onCreateSeparate={() => void submitLead({ kind: "separate" })}
    />
    </>
  );
}
