import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SettingsMap = Record<string, string>;

export function useSettings(
  keys: readonly string[],
  defaults: SettingsMap,
  extraKeys?: readonly string[],
) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsMap>({ ...defaults });
  const [pristine, setPristine] = useState<SettingsMap>({ ...defaults });

  const allFetchKeys = extraKeys ? [...keys, ...extraKeys] : [...keys];

  const hasChanges =
    JSON.stringify(
      keys.reduce<SettingsMap>((acc, k) => { acc[k] = settings[k] ?? ""; return acc; }, {})
    ) !==
    JSON.stringify(
      keys.reduce<SettingsMap>((acc, k) => { acc[k] = pristine[k] ?? ""; return acc; }, {})
    );

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", allFetchKeys);
      const map: SettingsMap = { ...defaults };
      data?.forEach((row) => { map[row.key] = row.value ?? ""; });
      setSettings(map);
      setPristine({ ...map });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: string) => (value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const saveAll = async () => {
    setSaving(true);
    for (const key of keys) {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key, value: settings[key] ?? "", updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) {
        toast.error(`Failed to save ${key}: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setPristine({ ...settings });
    toast.success("Settings saved successfully");
    setSaving(false);
  };

  const saveOne = async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) toast.error(`Failed to update: ${error.message}`);
  };

  return { settings, set, loading, saving, hasChanges, saveAll, saveOne };
}
