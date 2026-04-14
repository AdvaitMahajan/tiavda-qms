import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, FolderOpen, FolderX, CalendarDays, ExternalLink } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Mobilisation = Tables<"mobilisation">;

export function MobilisationSection({ enquiryId }: { enquiryId: string }) {
  const [mob, setMob] = useState<Mobilisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [mobDate, setMobDate] = useState("");
  const [mobTime, setMobTime] = useState("");
  const [team, setTeam] = useState("");
  const [equipment, setEquipment] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const fetchMob = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("mobilisation").select("*").eq("enquiry_id", enquiryId).maybeSingle();
    setMob(data);
    setLoading(false);
  }, [enquiryId]);

  useEffect(() => { fetchMob(); }, [fetchMob]);

  const handleSave = async () => {
    if (!mobDate) { toast.error("Mobilisation date is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("mobilisation").insert({
      enquiry_id: enquiryId,
      mobilisation_date: mobDate,
      mobilisation_time: mobTime || null,
      team_description: team || null,
      equipment_notes: equipment || null,
      site_contact_name: contactName || null,
      site_contact_phone: contactPhone || null,
      drive_folder_status: "pending",
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Mobilisation scheduled. Google Drive folder will be created automatically.");
    setShowForm(false);
    setSaving(false);
    fetchMob();
  };

  if (loading) return <div className="h-16 bg-muted/30 animate-pulse rounded-lg" />;

  if (!mob) {
    return (
      <>
        <Button onClick={() => setShowForm(true)} className="w-full bg-steel text-white hover:bg-steel/90">
          <CalendarDays className="mr-2 h-4 w-4" /> Schedule Mobilisation
        </Button>

        <Sheet open={showForm} onOpenChange={setShowForm}>
          <SheetContent>
            <SheetHeader><SheetTitle>Schedule Mobilisation</SheetTitle></SheetHeader>
            <div className="space-y-4 mt-6">
              <div><Label>Mobilisation Date *</Label><Input type="date" value={mobDate} onChange={(e) => setMobDate(e.target.value)} /></div>
              <div><Label>Time</Label><Input type="time" value={mobTime} onChange={(e) => setMobTime(e.target.value)} /></div>
              <div><Label>Team Description</Label><Textarea value={team} onChange={(e) => setTeam(e.target.value)} /></div>
              <div><Label>Equipment Notes</Label><Textarea value={equipment} onChange={(e) => setEquipment(e.target.value)} /></div>
              <div><Label>Site Contact Name</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
              <div><Label>Site Contact Phone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </SheetContent>
        </Sheet>
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
          {mob.team_description && <div className="col-span-2"><span className="text-muted-foreground">Team:</span> {mob.team_description}</div>}
          {mob.site_contact_name && <div><span className="text-muted-foreground">Contact:</span> {mob.site_contact_name}</div>}
          {mob.site_contact_phone && <div><span className="text-muted-foreground">Phone:</span> {mob.site_contact_phone}</div>}
        </div>
        <div className="mt-3">
          {mob.drive_folder_status === "pending" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Creating Drive folder...
            </span>
          )}
          {mob.drive_folder_status === "created" && mob.drive_folder_url && (
            <a href={mob.drive_folder_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-green-600 hover:underline">
              <FolderOpen className="h-3 w-3" /> Open Site Folder <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {mob.drive_folder_status === "failed" && (
            <span className="flex items-center gap-1.5 text-xs text-red-600">
              <FolderX className="h-3 w-3" /> Drive folder creation failed
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
