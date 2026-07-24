import { useState, useCallback, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";
import { sendNotification } from "@/lib/notifications";
import { useAuth } from "@/hooks/useAuth";
import { AssigneeDropdown } from "@/components/AssigneeDropdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FolderOpen, FolderX, CalendarDays, ExternalLink, CheckCircle2, Clock, AlertTriangle, ShieldCheck, FileWarning } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Mobilisation = Tables<"mobilisation">;
type ConfirmToken = Tables<"mob_confirmation_tokens">;

export function MobilisationSection({ enquiryId, enquiry, onStatusChange }: { enquiryId: string; enquiry?: { id: string; ref_number: string; site_city: string; client_id: string } | null; onStatusChange?: () => void }) {
  const { user } = useAuth();
  const [mob, setMob] = useState<Mobilisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [mobDate, setMobDate] = useState("");
  const [mobTime, setMobTime] = useState("");
  const [teamLeadId, setTeamLeadId] = useState<string | null>(null);
  const [team, setTeam] = useState("");
  const [equipment, setEquipment] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [teamLeadName, setTeamLeadName] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState<ConfirmToken | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [demobConsent, setDemobConsent] = useState<boolean | null>(null);
  const [acceptingAlt, setAcceptingAlt] = useState(false);
  const [showRepropose, setShowRepropose] = useState(false);
  const [reproposeDate, setReproposeDate] = useState("");
  const [reproposing, setReproposing] = useState(false);

  // Internal acknowledgement by the assigned team member (separate from the
  // client's confirmation): accept the date, or request a reschedule.
  const [showTlReschedule, setShowTlReschedule] = useState(false);
  const [tlProposedDate, setTlProposedDate] = useState("");
  const [tlNote, setTlNote] = useState("");
  const [tlSaving, setTlSaving] = useState(false);

  const fetchMob = useCallback(async (opts?: { silent?: boolean }) => {
    // Only the first load shows the skeleton. Background polls/refreshes must stay
    // silent: flipping `loading` unmounts this subtree (see the early return below),
    // which would close any dialog the user has open mid-edit.
    if (!opts?.silent) setLoading(true);

    // Surface the client's pre-consent to demobilization/re-mobilization charges
    // captured at intake (BRD legal/liability field) so the team can act on it.
    const enqRow = await apiClient.get<{ remarks: string | null }>(`/enquiries/${enquiryId}`).catch(() => null);
    const remarks = enqRow?.remarks ?? "";
    const marker = "---EXTENDED_DATA---";
    const idx = remarks.indexOf(marker);
    if (idx !== -1) {
      try {
        const json = JSON.parse(remarks.slice(idx + marker.length).trim());
        setDemobConsent(json.demobilization_consent === true);
      } catch {
        setDemobConsent(null);
      }
    } else {
      setDemobConsent(null);
    }

    const data = await apiClient.get<Mobilisation | null>("/mobilisation", { enquiry_id: enquiryId });
    setMob(data);
    if (data?.team_lead_id) {
      const profile = await apiClient.get<{ full_name: string | null; email: string | null }>(`/profiles/${data.team_lead_id}`).catch(() => null);
      setTeamLeadName(profile?.full_name || profile?.email?.split("@")[0] || null);
    }
    if (data) {
      const token = await apiClient.get<ConfirmToken | null>(`/mobilisation/${data.id}/confirmation-token`);
      setConfirmToken(token);
    }
    if (!opts?.silent) setLoading(false);
  }, [enquiryId]);

  useEffect(() => { fetchMob(); }, [fetchMob]);

  // Poll for drive-folder status / confirmation updates (replaces realtime).
  // Paused while a dialog is open so a refresh can never disturb an in-progress edit.
  useEffect(() => {
    if (!enquiryId || showForm || showRepropose) return;
    const interval = setInterval(() => { fetchMob({ silent: true }); }, 10_000);
    return () => clearInterval(interval);
  }, [enquiryId, fetchMob, showForm, showRepropose]);

  /** Notify every admin/super-admin in the org so the scheduler can review. */
  const notifyAdmins = useCallback(
    async (payload: { type: string; title: string; body: string }) => {
      try {
        const [admins, supers] = await Promise.all([
          apiClient.get<Array<{ id: string }>>("/profiles", { role: "admin" }).catch(() => []),
          apiClient.get<Array<{ id: string }>>("/profiles", { role: "super_admin" }).catch(() => []),
        ]);
        const ids = [...new Set([...admins, ...supers].map((p) => p.id))];
        await Promise.all(
          ids.map((uid) =>
            apiClient
              .post("/notifications", { ...payload, user_id: uid, enquiry_id: enquiryId, link: `/enquiries/${enquiryId}` })
              .catch(() => {}),
          ),
        );
      } catch {
        /* notifying admins is best-effort */
      }
    },
    [enquiryId],
  );

  /** Assigned member accepts the scheduled date. */
  const handleTeamLeadAccept = async () => {
    if (!mob) return;
    setTlSaving(true);
    try {
      await apiClient.patch(`/mobilisation/${mob.id}`, {
        team_lead_status: "accepted",
        team_lead_responded_at: new Date().toISOString(),
        team_lead_proposed_date: null,
        team_lead_note: null,
      });
      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "mobilisation_team_accepted",
        metadata: { date: mob.mobilisation_date, by: "team_lead" },
      });
      await notifyAdmins({
        type: "mobilisation_team_accepted",
        title: `Mobilisation accepted — ${enquiry?.ref_number ?? ""}`,
        body: `${teamLeadName ?? "The assigned team member"} accepted the mobilisation on ${mob.mobilisation_date}.`,
      });
      toast.success("Schedule accepted. The admin has been notified.");
      fetchMob({ silent: true });
    } catch (e) {
      toast.error((e as Error).message || "Could not accept the schedule");
    } finally {
      setTlSaving(false);
    }
  };

  /** Assigned member requests a reschedule, proposing a new date. */
  const handleTeamLeadRequestReschedule = async () => {
    if (!mob || !tlProposedDate) { toast.error("Please propose a new date"); return; }
    setTlSaving(true);
    try {
      await apiClient.patch(`/mobilisation/${mob.id}`, {
        team_lead_status: "reschedule_requested",
        team_lead_responded_at: new Date().toISOString(),
        team_lead_proposed_date: tlProposedDate,
        team_lead_note: tlNote || null,
      });
      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "mobilisation_reschedule_requested",
        metadata: { new_date: tlProposedDate, by: "team_lead", reason: tlNote || null },
      });
      await notifyAdmins({
        type: "mobilisation_reschedule_requested",
        title: `Reschedule requested — ${enquiry?.ref_number ?? ""}`,
        body: `${teamLeadName ?? "The assigned team member"} requested ${tlProposedDate} instead of ${mob.mobilisation_date}${tlNote ? ` — ${tlNote}` : ""}.`,
      });
      toast.success("Reschedule requested. The admin has been notified.");
      setShowTlReschedule(false);
      setTlProposedDate("");
      setTlNote("");
      fetchMob({ silent: true });
    } catch (e) {
      toast.error((e as Error).message || "Could not request a reschedule");
    } finally {
      setTlSaving(false);
    }
  };

  /** Admin applies the member's proposed date (re-issues the client confirmation). */
  const handleApplyProposedDate = async () => {
    if (!mob?.team_lead_proposed_date) return;
    const newDate = mob.team_lead_proposed_date;
    setTlSaving(true);
    try {
      await apiClient.patch(`/mobilisation/${mob.id}`, {
        mobilisation_date: newDate,
        team_lead_status: "accepted",
        team_lead_responded_at: new Date().toISOString(),
        client_confirmed: false,
        client_confirmed_at: null,
      });
      await issueAndSendConfirmation(newDate);
      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "mobilisation_rescheduled",
        metadata: { new_date: newDate, by: "admin_applied_team_request" },
      });
      toast.success(`Mobilisation moved to ${newDate}. Client re-notified.`);
      fetchMob({ silent: true });
    } catch (e) {
      toast.error((e as Error).message || "Could not apply the proposed date");
    } finally {
      setTlSaving(false);
    }
  };

  const handleSave = async () => {
    if (!mobDate) { toast.error("Mobilisation date is required"); return; }
    setSaving(true);
    let mobRow: Mobilisation;
    try {
      mobRow = await apiClient.post<Mobilisation>("/mobilisation", {
        enquiry_id: enquiryId,
        mobilisation_date: mobDate,
        mobilisation_time: mobTime || null,
        team_lead_id: teamLeadId,
        team_description: team || null,
        equipment_notes: equipment || null,
        site_contact_name: contactName || null,
        site_contact_phone: contactPhone || null,
        drive_folder_status: "pending",
      });
    } catch (e) {
      toast.error((e as Error).message); setSaving(false); return;
    }

    if (teamLeadId && enquiry) {
      const dateStr = new Date(mobDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      await apiClient.post("/notifications", {
        user_id: teamLeadId,
        type: "assignment",
        title: `Mobilisation scheduled — ${enquiry.ref_number}`,
        body: `You are the team lead for mobilisation on ${dateStr} at ${enquiry.site_city}. Please open the enquiry to accept the date or request a reschedule.`,
        enquiry_id: enquiry.id,
        link: `/enquiries/${enquiry.id}`,
      });
    }

    // Generate confirmation token (server supersedes any prior pending tokens).
    if (enquiry) {
      await apiClient.post(`/mobilisation/${mobRow.id}/confirmation-token`, {
        enquiry_id: enquiryId,
        client_id: enquiry.client_id,
      }).catch(() => {});
    }

    // Auto-advance enquiry status to mobilization_scheduled (surface failures —
    // the DB trigger allows approved/payment_received → mobilization_scheduled).
    try {
      await apiClient.patch(`/enquiries/${enquiryId}`, { status: "mobilization_scheduled" });
      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "status_change",
        to_status: "mobilization_scheduled",
        metadata: { trigger: "mobilisation_scheduled" },
      });
    } catch (e) {
      toast.error("Mobilisation saved, but the enquiry status could not be advanced: " + (e as Error).message);
    }

    toast.success("Mobilisation scheduled. Google Drive folder will be created automatically.");
    setShowForm(false);
    setSaving(false);
    fetchMob({ silent: true });
    onStatusChange?.();

    // Fire-and-forget: create Google Drive folder + notify client
    if (enquiry) {
      apiClient.get<Tables<"clients">>(`/clients/${enquiry.client_id}`).then((clientData) => {
        const clientName = clientData?.name ?? "Client";

        // Create Drive folder (API updates mobilisation.drive_folder_status server-side)
        apiClient.post("/integrations/drive-folder", {
          enquiry_id: enquiry.id,
          ref_number: enquiry.ref_number,
          client_name: clientName,
          city: enquiry.site_city,
        }).catch((err) => console.error("Drive folder creation failed:", err));

        // Send mobilisation confirmation email
        if (clientData?.email && !clientData?.email_bounced) {
          const dateStr = new Date(mobDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
          sendNotification({
            to: clientData.email,
            template: "mobilisation_confirmed",
            params: {
              client_name: clientName,
              ref_number: enquiry.ref_number,
              date: dateStr,
              time: mobTime || undefined,
              city: enquiry.site_city,
              contact_name: contactName || undefined,
              contact_phone: contactPhone || undefined,
            },
          }).then(() => {
            apiClient.post("/communications", {
              enquiry_id: enquiry.id,
              client_id: enquiry.client_id,
              channel: "email",
              direction: "outbound",
              subject: `Mobilisation confirmation — ${enquiry.ref_number}`,
              body: "Mobilisation confirmation email sent",
              status: "sent",
            });
          }).catch(() => {});
        }

        // Send mobilisation WhatsApp
        if (clientData?.whatsapp_number && !clientData?.whatsapp_invalid) {
          const dateStr = new Date(mobDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
          apiClient.post<{ whatsapp_invalid?: boolean }>("/integrations/whatsapp", {
            phone_number: clientData.whatsapp_number,
            template_name: "qms_mobilisation_confirmation",
            parameters: [
              { name: "client_name", value: clientName },
              { name: "ref_number", value: enquiry.ref_number },
              { name: "date", value: dateStr },
              { name: "city", value: enquiry.site_city },
            ],
          }).then((waData) => {
            if (waData?.whatsapp_invalid) {
              // Scoped flag-channel so mobilization leads (who cannot write clients) can still flag a bad number.
              apiClient.post(`/clients/${enquiry.client_id}/flag-channel`, { channel: "whatsapp" });
            } else {
              apiClient.post("/communications", {
                enquiry_id: enquiry.id,
                client_id: enquiry.client_id,
                channel: "whatsapp",
                direction: "outbound",
                subject: `WhatsApp: Mobilisation confirmation ${enquiry.ref_number}`,
                body: "Mobilisation confirmation WhatsApp sent",
                status: "sent",
              });
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  };

  // Issue a fresh confirmation token for a (new) date and notify the client.
  const issueAndSendConfirmation = async (date: string) => {
    if (!enquiry || !mob) return;
    // Issue a fresh token (server supersedes prior pending/alternate tokens).
    const newToken = await apiClient.post<ConfirmToken>(`/mobilisation/${mob.id}/confirmation-token`, {
      enquiry_id: enquiry.id,
      client_id: enquiry.client_id,
    });
    const tokenStr = newToken.token;

    const clientData = await apiClient.get<Tables<"clients">>(`/clients/${enquiry.client_id}`).catch(() => null);
    const dateStr = new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const confirmUrl = `${window.location.origin}/confirm-mobilization?t=${tokenStr}`;

    if (clientData?.email && !clientData?.email_bounced) {
      sendNotification({
        to: clientData.email,
        template: "mobilisation_revised",
        params: {
          client_name: clientData.name ?? "Client",
          ref_number: enquiry.ref_number,
          date: dateStr,
          city: enquiry.site_city,
          confirm_url: confirmUrl,
        },
      }).then(() => {
        apiClient.post("/communications", {
          enquiry_id: enquiry.id, client_id: enquiry.client_id,
          channel: "email", direction: "outbound",
          subject: `Revised mobilisation date — ${enquiry.ref_number}`,
          body: "Revised mobilisation confirmation email sent", status: "sent",
        });
      }).catch(() => {});
    }

    if (clientData?.whatsapp_number && !clientData?.whatsapp_invalid) {
      apiClient.post("/integrations/whatsapp", {
        phone_number: clientData.whatsapp_number,
        template_name: "qms_mobilisation_confirmation",
        parameters: [
          { name: "client_name", value: clientData.name ?? "Client" },
          { name: "ref_number", value: enquiry.ref_number },
          { name: "date", value: dateStr },
          { name: "city", value: enquiry.site_city },
        ],
      }).catch(() => {});
    }
  };

  // Team Lead accepts the client's proposed alternate date → reschedule + confirm.
  const handleAcceptAlternate = async () => {
    if (!mob || !confirmToken?.alternate_date) return;
    setAcceptingAlt(true);
    try {
      await apiClient.patch(`/mobilisation/${mob.id}`, {
        mobilisation_date: confirmToken.alternate_date,
        client_confirmed: true,
        client_confirmed_at: new Date().toISOString(),
      });
      await apiClient.patch(`/mobilisation/confirmation-token/${confirmToken.id}`, {
        status: "confirmed", confirmed_at: new Date().toISOString(),
      });
      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "mobilisation_confirmed",
        metadata: { confirmed_by: "team_lead_accepted_alternate", date: confirmToken.alternate_date },
      });
      toast.success("Accepted the client's proposed date — mobilisation confirmed.");
      fetchMob({ silent: true });
    } catch {
      toast.error("Failed to accept proposed date");
    } finally {
      setAcceptingAlt(false);
    }
  };

  // Team Lead proposes a different date → reschedule + re-issue confirmation link.
  const handleRepropose = async () => {
    if (!mob || !reproposeDate) return;
    setReproposing(true);
    try {
      await apiClient.patch(`/mobilisation/${mob.id}`, {
        mobilisation_date: reproposeDate,
        client_confirmed: false,
        client_confirmed_at: null,
      });
      await issueAndSendConfirmation(reproposeDate);
      await apiClient.post(`/enquiries/${enquiryId}/events`, {
        event_type: "mobilisation_rescheduled",
        metadata: { new_date: reproposeDate, by: "team_lead" },
      });
      toast.success("New date sent to client for confirmation.");
      setShowRepropose(false);
      setReproposeDate("");
      fetchMob({ silent: true });
    } catch {
      toast.error("Failed to send new date");
    } finally {
      setReproposing(false);
    }
  };

  if (loading) return <div className="h-16 bg-muted/30 animate-pulse rounded-lg" />;

  if (!mob) {
    return (
      <>
        <Button onClick={() => setShowForm(true)} className="w-full bg-steel text-white hover:bg-steel/90">
          <CalendarDays className="mr-2 h-4 w-4" /> Schedule Mobilisation
        </Button>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Schedule Mobilisation</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label>Mobilisation Date *</Label><Input type="date" value={mobDate} onChange={(e) => setMobDate(e.target.value)} /></div>
              <div><Label>Time</Label><Input type="time" value={mobTime} onChange={(e) => setMobTime(e.target.value)} /></div>
              <div><Label>Team Lead</Label><AssigneeDropdown value={teamLeadId} onChange={setTeamLeadId} filterRole="mobilization_lead" /></div>
              <div><Label>Team Description</Label><Textarea value={team} onChange={(e) => setTeam(e.target.value)} /></div>
              <div><Label>Equipment Notes</Label><Textarea value={equipment} onChange={(e) => setEquipment(e.target.value)} /></div>
              <div><Label>Site Contact Name</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
              <div><Label>Site Contact Phone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-sora text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Mobilisation
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{mob.mobilisation_date}</span></div>
          {mob.mobilisation_time && <div><span className="text-muted-foreground">Time:</span> {mob.mobilisation_time}</div>}
          {teamLeadName && <div className="col-span-2"><span className="text-muted-foreground">Team Lead:</span> <span className="font-medium">{teamLeadName}</span></div>}
          {mob.team_description && <div className="col-span-2"><span className="text-muted-foreground">Team:</span> {mob.team_description}</div>}
          {mob.site_contact_name && <div><span className="text-muted-foreground">Contact:</span> {mob.site_contact_name}</div>}
          {mob.site_contact_phone && <div><span className="text-muted-foreground">Phone:</span> {mob.site_contact_phone}</div>}
        </div>

        {/* Demobilization charges consent (captured at intake) */}
        {demobConsent === true && (
          <div className="mt-3 flex items-start gap-2 text-[13px] rounded-lg p-2" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46" }}>
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "#15673A" }} />
            <span>Client <strong>pre-consented to demobilization / re-mobilization charges</strong> at intake. If the site is not ready or info was incorrect, demob costs are billable to the client.</span>
          </div>
        )}
        {demobConsent === false && (
          <div className="mt-3 flex items-start gap-2 text-[13px] rounded-lg p-2" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
            <FileWarning className="h-4 w-4 shrink-0" style={{ color: "#B91C1C" }} />
            <span>No demobilization-charges consent on record for this enquiry. Confirm liability terms before mobilizing.</span>
          </div>
        )}
        {/* Assigned team member's acknowledgement (internal, separate from the client) */}
        <div className="mt-3 space-y-2">
          <div style={{ borderTop: "1px solid #E0E7EF", paddingTop: "10px" }}>
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#546E7A" }}>
              Team Confirmation{teamLeadName ? ` — ${teamLeadName}` : ""}
            </p>

            {mob.team_lead_status === "accepted" ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" style={{ color: "#15673A" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#15673A" }}>
                  Accepted by the assigned team member
                </span>
              </div>
            ) : mob.team_lead_status === "reschedule_requested" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" style={{ color: "#92400E" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "#92400E" }}>
                    Reschedule requested
                  </span>
                </div>
                <div className="text-[13px] p-2 rounded-lg" style={{ background: "#FEF3C7" }}>
                  <p>
                    <strong>Proposed:</strong>{" "}
                    {mob.team_lead_proposed_date
                      ? new Date(mob.team_lead_proposed_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </p>
                  {mob.team_lead_note && <p className="mt-1">{mob.team_lead_note}</p>}
                </div>
                {/* Only the scheduler acts on the request. */}
                {user?.id !== mob.team_lead_id && (
                  <button
                    onClick={handleApplyProposedDate}
                    disabled={tlSaving || !mob.team_lead_proposed_date}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#15673A,#22C55E)", color: "white" }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {tlSaving ? "Applying…" : "Apply Proposed Date"}
                  </button>
                )}
              </div>
            ) : user?.id && user.id === mob.team_lead_id ? (
              // The assigned member is viewing: let them respond.
              <div className="space-y-2">
                <p className="text-[13px]" style={{ color: "#546E7A" }}>
                  You are assigned to this mobilisation. Please accept the date or request a reschedule.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleTeamLeadAccept}
                    disabled={tlSaving}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#15673A,#22C55E)", color: "white" }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {tlSaving ? "Saving…" : "Accept Schedule"}
                  </button>
                  <button
                    onClick={() => { setShowTlReschedule((v) => !v); setTlProposedDate(""); setTlNote(""); }}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{ border: "1.5px solid #92400E", color: "#92400E", background: "transparent" }}
                  >
                    <CalendarDays className="h-3 w-3" />
                    Request Reschedule
                  </button>
                </div>
                {showTlReschedule && (
                  <div className="space-y-2 p-2 rounded-lg" style={{ background: "#F8FAFC", border: "1px solid #E0E7EF" }}>
                    <Label className="text-[12px]">Proposed date</Label>
                    <Input type="date" value={tlProposedDate} onChange={(e) => setTlProposedDate(e.target.value)} />
                    <Label className="text-[12px]">Reason (optional)</Label>
                    <Textarea rows={2} value={tlNote} onChange={(e) => setTlNote(e.target.value)} placeholder="Why the date needs to change" />
                    <Button size="sm" onClick={handleTeamLeadRequestReschedule} disabled={tlSaving || !tlProposedDate}>
                      {tlSaving ? "Sending…" : "Send Request"}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: "#92400E" }} />
                <span className="text-[13px]" style={{ color: "#92400E" }}>
                  Awaiting response from {teamLeadName ?? "the assigned team member"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Client Confirmation Status */}
        <div className="mt-3 space-y-2">
          <div style={{ borderTop: "1px solid #E0E7EF", paddingTop: "10px" }}>
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#546E7A" }}>
              Client Confirmation
            </p>
            {(mob as any).client_confirmed ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" style={{ color: "#15673A" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#15673A" }}>
                  Confirmed
                  {(mob as any).admin_override && " (Admin Override)"}
                </span>
              </div>
            ) : confirmToken?.status === "alternate_proposed" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" style={{ color: "#92400E" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "#92400E" }}>
                    Alternate Date Proposed
                  </span>
                </div>
                <div className="text-[13px] p-2 rounded-lg" style={{ background: "#FEF3C7" }}>
                  <p><strong>Proposed:</strong> {confirmToken.alternate_date ? new Date(confirmToken.alternate_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
                  {confirmToken.alternate_notes && <p className="mt-1">{confirmToken.alternate_notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleAcceptAlternate}
                    disabled={acceptingAlt || !confirmToken.alternate_date}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#15673A,#22C55E)", color: "white" }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {acceptingAlt ? "Accepting…" : "Accept Proposed Date"}
                  </button>
                  <button
                    onClick={() => { setShowRepropose((v) => !v); setReproposeDate(""); }}
                    className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}
                  >
                    <CalendarDays className="h-3 w-3" /> Propose Different Date
                  </button>
                </div>
                {showRepropose && (
                  <div className="flex items-end gap-2 mt-1">
                    <input
                      type="date"
                      value={reproposeDate}
                      onChange={(e) => setReproposeDate(e.target.value)}
                      className="text-[13px] px-2 py-1.5 rounded-lg"
                      style={{ border: "1.5px solid #E0E7EF" }}
                    />
                    <button
                      onClick={handleRepropose}
                      disabled={reproposing || !reproposeDate}
                      className="text-[13px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                      style={{ background: "#1565C0" }}
                    >
                      {reproposing ? "Sending…" : "Send to Client"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: "#546E7A" }} />
                <span className="text-[13px]" style={{ color: "#546E7A" }}>Awaiting client confirmation</span>
              </div>
            )}

            {!(mob as any).client_confirmed && (
              <button
                onClick={async () => {
                  setOverriding(true);
                  try {
                    await apiClient.patch(`/mobilisation/${mob.id}`, {
                      client_confirmed: true,
                      client_confirmed_at: new Date().toISOString(),
                      admin_override: true,
                      admin_override_by: user?.id,
                      admin_override_at: new Date().toISOString(),
                    });
                    if (confirmToken) {
                      await apiClient.patch(`/mobilisation/confirmation-token/${confirmToken.id}`, {
                        status: "confirmed",
                        confirmed_at: new Date().toISOString(),
                      });
                    }
                    toast.success("Confirmed on behalf of client");
                    fetchMob({ silent: true });
                  } catch {
                    toast.error("Failed to override");
                  } finally {
                    setOverriding(false);
                  }
                }}
                disabled={overriding}
                className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                style={{ background: "#EBF2FF", color: "#1565C0" }}
              >
                <ShieldCheck className="h-3 w-3" />
                {overriding ? "Confirming…" : "Admin Override: Confirm"}
              </button>
            )}
          </div>

          {/* Drive Folder */}
          {mob.drive_folder_status === "pending" && (
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Creating Drive folder...
            </span>
          )}
          {mob.drive_folder_status === "created" && mob.drive_folder_url && (
            <a href={mob.drive_folder_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-green-600 hover:underline">
              <FolderOpen className="h-3 w-3" /> Open Site Folder <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {mob.drive_folder_status === "failed" && (
            <span className="flex items-center gap-1.5 text-[13px] text-red-600">
              <FolderX className="h-3 w-3" /> Drive folder creation failed
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
