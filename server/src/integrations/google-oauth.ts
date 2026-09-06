import { env } from '../env';

/**
 * "Connect Google Drive" — OAuth against a real Google account rather than a
 * service account. A service account has no My Drive storage of its own, so
 * uploads it owns are rejected with storageQuotaExceeded; files created under a
 * connected user's token belong to that user and use their quota.
 *
 * Scope is drive.file: access is limited to files this app creates, so Google
 * treats it as non-sensitive — no verification review, and refresh tokens do not
 * expire after 7 days the way they do for an unpublished app on broader scopes.
 * The trade is that the app cannot see pre-existing folders, so it creates and
 * owns its own root folder in whichever account is connected.
 */
// drive.file plus email so the Admin Console can show which account is connected.
// Both are non-sensitive, so no Google verification review is required.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

export function oauthConfigured(): boolean {
  return !!env.GOOGLE_OAUTH_CLIENT_ID && !!env.GOOGLE_OAUTH_CLIENT_SECRET;
}

/** Consent URL. `state` carries the org id back to the callback. */
export function buildConsentUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    // offline + consent so Google actually returns a refresh token; without
    // prompt=consent a re-connect of an already-approved account returns none.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as TokenResponse;
}

/** Exchange the one-time code from the consent redirect for a refresh token. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ refresh_token: string; access_token: string }> {
  const data = await tokenRequest({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (!data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error_description || data.error || 'unknown error'}`);
  }
  if (!data.refresh_token) {
    // Happens when the account previously approved and prompt=consent was lost.
    throw new Error(
      'Google returned no refresh token. Remove this app at myaccount.google.com/permissions and connect again.',
    );
  }
  return { refresh_token: data.refresh_token, access_token: data.access_token };
}

/** A short-lived access token for a stored refresh token. */
export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const data = await tokenRequest({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
  });
  if (!data.access_token) {
    throw new Error(
      `Google Drive connection is no longer valid (${data.error || 'refresh failed'}). Reconnect the account in the Admin Console.`,
    );
  }
  return data.access_token;
}

/** Which account consented — shown in the Admin Console. */
export async function accountEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { email?: string }).email;
  } catch {
    return undefined;
  }
}
