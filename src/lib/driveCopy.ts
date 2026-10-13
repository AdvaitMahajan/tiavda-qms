import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";

/** Where each kind of file is filed inside the job's Drive folder. */
export type DriveSubfolder = "Quotations" | "Reports" | "Site Photos" | "Correspondence";

export interface DriveCopyInput {
  enquiryId: string;
  bucket: "quotation-pdfs" | "receipts" | "reports" | "site-visit-photos" | "intake-uploads";
  path: string;
  subfolder: DriveSubfolder;
  fileName?: string;
  mimeType?: string;
  /** Shown if the copy fails, e.g. "receipt". */
  label?: string;
}

/**
 * File a stored object into the job's Google Drive folder.
 *
 * Fire-and-forget by design: the file is already saved in the app, and Drive is
 * a second copy. A failure warns rather than failing the action that produced
 * the file — but it does warn, because a silent catch made "Drive is not
 * reachable" and "nothing happened" indistinguishable.
 */
export function copyToDrive(input: DriveCopyInput): void {
  const what = input.label ?? "file";
  apiClient
    .post<{ success: boolean; error?: string }>("/integrations/drive-file", {
      enquiry_id: input.enquiryId,
      bucket: input.bucket,
      path: input.path,
      subfolder: input.subfolder,
      file_name: input.fileName,
      mime_type: input.mimeType,
    })
    .then((r) => {
      if (!r?.success) toast.warning(`Saved, but the ${what} was not copied to Drive: ${r?.error ?? "unknown reason"}`);
    })
    .catch((e) => toast.warning(`Saved, but the ${what} copy to Drive failed: ${(e as Error)?.message ?? "request failed"}`));
}
