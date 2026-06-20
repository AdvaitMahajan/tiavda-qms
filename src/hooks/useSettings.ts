import { useState, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";
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
      const data = await apiClient.get<{ key: string; value: string }[]>("/settings", { keys: allFetchKeys.join(",") });
      const map: SettingsMap = { ...defaults };
      data.forEach((row) => { map[row.key] = row.value ?? ""; });
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
    try {
      const entries = keys.reduce<SettingsMap>((acc, k) => { acc[k] = settings[k] ?? ""; return acc; }, {});
      await apiClient.patch("/settings", { entries });
      setPristine({ ...settings });
      toast.success("Settings saved successfully");
    } catch (e) {
      toast.error(`Failed to save settings: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveOne = async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await apiClient.patch("/settings", { entries: { [key]: value } });
    } catch (e) {
      toast.error(`Failed to update: ${(e as Error).message}`);
    }
  };

  return { settings, set, loading, saving, hasChanges, saveAll, saveOne };
}
