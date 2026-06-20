import { SignJWT, importPKCS8 } from 'jose';
import { currentOrgId } from '../db';
import { supabaseAdmin } from '../lib/supabase';
import { resolveDriveCreds } from '../lib/org-integrations';

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
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Failed to obtain Google access token');
  return data.access_token;
}

async function findOrCreateFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const searchData = (await searchRes.json()) as { files?: Array<{ id: string }> };
  if (searchData.files && searchData.files.length > 0 && searchData.files[0]) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

// Faithful port of the create-drive-folder edge function.
export async function createDriveFolder(input: CreateDriveFolderInput): Promise<CreateDriveFolderResult> {
  const { enquiry_id, ref_number, client_name, city } = input;
  try {
    const creds = await resolveDriveCreds(input.orgId ?? currentOrgId());
    if (!creds.service_account_b64 || !creds.root_folder_id) {
      throw new Error('Google Drive is not configured for this organization');
    }
    const sa = JSON.parse(Buffer.from(creds.service_account_b64, 'base64').toString('utf8')) as ServiceAccount;
    const accessToken = await getGoogleAccessToken(sa);
    const year = new Date().getFullYear().toString();
    const yearFolderId = await findOrCreateFolder(year, creds.root_folder_id, accessToken);
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
