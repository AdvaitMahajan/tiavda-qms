import { SignJWT, importPKCS8 } from 'jose';
import { currentOrgId } from '../db';
import { supabaseAdmin } from '../lib/supabase';
import { resolveDriveCreds, setDriveRootFolder, type DriveCreds } from '../lib/org-integrations';
import { accessTokenFromRefresh } from './google-oauth';

export interface CreateDriveFolderInput {
  enquiry_id: string;
  ref_number: string;
  client_name: string;
  city: string;
  /** Org whose provisioned Google service account to use; defaults to request org. */
  orgId?: string | null;
}

export interface CreateDriveFolderResult {
  success: boolean;
  folder_id?: string;
  folder_url?: string;
  error?: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  // RS256-signed JWT bearer grant (jose handles the PKCS8 PEM key).
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/drive' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    // Surface Google's real reason (bad key, clock skew, API not enabled…) instead
    // of a generic failure so the folder-status error is actionable.
    throw new Error(
      `Google auth failed: ${data.error_description || data.error || `HTTP ${res.status}`}`,
    );
  }
  return data.access_token;
}

// supportsAllDrives / includeItemsFromAllDrives are required for Shared Drives,
// which is the recommended home for these folders — a service account has no My
// Drive storage quota of its own, so folders it creates must live in a Shared
// Drive owned by the drive, not the account.
async function findOrCreateFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!searchRes.ok) {
    const body = await searchRes.text();
    throw new Error(`Drive search failed (HTTP ${searchRes.status}): ${body.slice(0, 300)}`);
  }
  const searchData = (await searchRes.json()) as { files?: Array<{ id: string }> };
  if (searchData.files && searchData.files.length > 0 && searchData.files[0]) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Drive folder create failed (HTTP ${createRes.status}): ${body.slice(0, 300)}`);
  }
  const createData = (await createRes.json()) as { id?: string };
  if (!createData.id) throw new Error(`Drive create returned no folder id for "${name}"`);
  return createData.id;
}


/** Root folder name created in a connected account (drive.file cannot see
 *  folders it did not create, so the app owns its own root). */
const OAUTH_ROOT_FOLDER_NAME = 'Global Geotechnics QMS';

/**
 * An access token plus the root folder to work under, for whichever auth the org
 * has configured. OAuth wins when present: files are then owned by a real
 * account with real storage, where a service account has none.
 */
async function driveContext(orgId: string | null): Promise<{ accessToken: string; rootFolderId: string }> {
  const creds: DriveCreds = await resolveDriveCreds(orgId);

  if (creds.oauth_refresh_token) {
    const accessToken = await accessTokenFromRefresh(creds.oauth_refresh_token);
    if (creds.root_folder_id) return { accessToken, rootFolderId: creds.root_folder_id };
    // First use after connecting: make the root folder and remember it.
    const rootFolderId = await findOrCreateFolder(OAUTH_ROOT_FOLDER_NAME, 'root', accessToken);
    if (orgId) await setDriveRootFolder(orgId, rootFolderId);
    return { accessToken, rootFolderId };
  }

  if (!creds.service_account_b64 || !creds.root_folder_id) {
    throw new Error('Google Drive is not configured for this organization');
  }
  const sa = JSON.parse(Buffer.from(creds.service_account_b64, 'base64').toString('utf8')) as ServiceAccount;
  return { accessToken: await getGoogleAccessToken(sa), rootFolderId: creds.root_folder_id };
}

// Faithful port of the create-drive-folder edge function.
export async function createDriveFolder(input: CreateDriveFolderInput): Promise<CreateDriveFolderResult> {
  const { enquiry_id, ref_number, client_name, city } = input;
  try {
    const { accessToken, rootFolderId } = await driveContext(input.orgId ?? currentOrgId());
    const year = new Date().getFullYear().toString();
    const yearFolderId = await findOrCreateFolder(year, rootFolderId, accessToken);
    const projectFolderId = await findOrCreateFolder(`${ref_number} — ${client_name} — ${city}`, yearFolderId, accessToken);
    const projectFolderUrl = `https://drive.google.com/drive/folders/${projectFolderId}`;

    await Promise.all(
      ['Quotations', 'Reports', 'Site Photos', 'Borehole Logs', 'Correspondence'].map((name) =>
        findOrCreateFolder(name, projectFolderId, accessToken),
      ),
    );

    await supabaseAdmin
      .from('mobilisation')
      .update({ drive_folder_id: projectFolderId, drive_folder_url: projectFolderUrl, drive_folder_status: 'created' })
      .eq('enquiry_id', enquiry_id);

    return { success: true, folder_id: projectFolderId, folder_url: projectFolderUrl };
  } catch (err) {
    await supabaseAdmin
      .from('mobilisation')
      .update({ drive_folder_status: 'failed' })
      .eq('enquiry_id', enquiry_id)
      .then(undefined, () => undefined);
    return { success: false, error: (err as Error).message };
  }
}

export interface UploadToDriveInput {
  orgId?: string | null;
  /** Enquiry the file belongs to — decides which job folder it lands in. */
  ref_number: string;
  client_name: string;
  city: string;
  /** Sub-folder within the job folder, e.g. "Quotations". Created if absent. */
  subfolder: string;
  file_name: string;
  mime_type: string;
  bytes: Buffer;
}

export interface UploadToDriveResult {
  success: boolean;
  file_id?: string;
  file_url?: string;
  error?: string;
}

/**
 * Put a file into a job's Drive folder, creating year / job / sub-folder as
 * needed so it works whether or not a mobilisation has been scheduled yet.
 *
 * Re-uploading the same name replaces the existing file rather than piling up
 * duplicates — a regenerated quotation should supersede the old PDF, not sit
 * beside it.
 */
export async function uploadToDrive(input: UploadToDriveInput): Promise<UploadToDriveResult> {
  try {
    const { accessToken, rootFolderId } = await driveContext(input.orgId ?? currentOrgId());

    const year = new Date().getFullYear().toString();
    const yearFolderId = await findOrCreateFolder(year, rootFolderId, accessToken);
    const jobFolderId = await findOrCreateFolder(
      `${input.ref_number} — ${input.client_name} — ${input.city}`,
      yearFolderId,
      accessToken,
    );
    const targetId = await findOrCreateFolder(input.subfolder, jobFolderId, accessToken);

    const existingId = await findFileInFolder(input.file_name, targetId, accessToken);

    const boundary = `qms${Date.now()}`;
    const metadata = existingId
      ? { name: input.file_name }                       // update: parents cannot be re-sent
      : { name: input.file_name, parents: [targetId] };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\nContent-Type: ${input.mime_type}\r\n\r\n`,
        'utf8',
      ),
      input.bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);

    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&supportsAllDrives=true`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';

    const res = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    });

    if (!res.ok) {
      const text = await res.text();
      // A service account has no My Drive quota of its own; files it owns must
      // live in a Shared Drive. Say so rather than passing Google's raw JSON up.
      if (text.includes('storageQuotaExceeded')) {
        throw new Error(
          'Drive upload rejected: the service account has no storage of its own. Move the root folder into a Shared Drive and add the service account as Content manager.',
        );
      }
      throw new Error(`Drive upload failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error('Drive upload returned no file id');
    return { success: true, file_id: data.id, file_url: `https://drive.google.com/file/d/${data.id}/view` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Existing file with this name in the folder, so re-uploads replace it. */
async function findFileInFolder(name: string, parentId: string, accessToken: string): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\'")}' and '${parentId}' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}
