import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2 } from "lucide-react";

type Status = {
  connected: boolean;
  account_email?: string | null;
  error?: string;
  oauth_available?: boolean;
};

/** Where Google sends the user back after consent. Must be registered on the
 *  OAuth client in Google Cloud, exactly as written here. */
export const DRIVE_REDIRECT_URI = `${window.location.origin}/oauth/google/callback`;

/**
 * "Connect Google Drive" for an org. The account that consents owns the files
 * the app creates, which is the point — a service account has no Drive storage
 * of its own, so uploads it owns are rejected. Switching accounts is a
 * disconnect followed by a connect as someone else.
 */
export function DriveConnect({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["drive-status", orgId],
    queryFn: () => apiClient.get<Status>(`/admin/orgs/${orgId}/drive/status`),
  });

  const connect = async () => {
    setStarting(true);
    try {
      const { url } = await apiClient.post<{ url: string }>(`/admin/orgs/${orgId}/drive/oauth-url`, {
        redirect_uri: DRIVE_REDIRECT_URI,
      });
      // Full-page redirect rather than a popup: popups are blocked often enough
      // that a silent failure here would be hard to explain.
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message || "Could not start Google sign-in");
      setStarting(false);
    }
  };

  const disconnect = useMutation({
    mutationFn: () => apiClient.post(`/admin/orgs/${orgId}/drive/disconnect`, {}),
    onSuccess: () => {
      toast.success("Google Drive disconnected");
      qc.invalidateQueries({ queryKey: ["drive-status", orgId] });
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg p-3" style={{ border: "1px solid #E0E7EF" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="h-4 w-4 shrink-0" style={{ color: "#546E7A" }} />
          <div className="min-w-0">
            <div className="font-medium text-sm">Google Drive</div>
            <div className="text-[12px] truncate" style={{ color: "#546E7A" }}>
              {isLoading
                ? "Checking…"
                : status?.connected
                  ? `Connected as ${status.account_email ?? "a Google account"}`
                  : status?.error
                    ? status.error
                    : "Not connected"}
            </div>
          </div>
        </div>
        {status?.connected ? (
          <Button variant="outline" size="sm" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
            {disconnect.isPending ? "…" : "Disconnect"}
          </Button>
        ) : (
          <Button size="sm" disabled={starting || isLoading} onClick={connect}>
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
          </Button>
        )}
      </div>
      {status && !status.oauth_available && (
        <p className="text-[12px] mt-2" style={{ color: "#B45309" }}>
          Google OAuth is not set up on the API — set GOOGLE_OAUTH_CLIENT_ID and
          GOOGLE_OAUTH_CLIENT_SECRET, then redeploy.
        </p>
      )}
      <p className="text-[12px] mt-2" style={{ color: "#94A3B8" }}>
        Files are created in a “Global Geotechnics QMS” folder in the connected
        account&apos;s Drive. Switching accounts does not move files already saved.
      </p>
    </div>
  );
}
