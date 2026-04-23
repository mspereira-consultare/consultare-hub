export const SHARED_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SHARED_NEXTAUTH_SESSION_COOKIE_NAME = 'consultare_hub_session';
export const PANEL_SIGN_IN_PATH = '/login';
export const INTRANET_SIGN_IN_PATH = '/login';

export const normalizeAuthUrl = (raw?: string) => {
  const input = String(raw || '').trim();
  if (!input) return '';

  let value = input.replace(/\s+/g, '');
  value = value
    .replace(/^https:\/\/https:\/\//i, 'https://')
    .replace(/^http:\/\/http:\/\//i, 'http://')
    .replace(/^https:\/\/http:\/\//i, 'https://')
    .replace(/^http:\/\/https:\/\//i, 'https://');

  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return '';
  }
};

export const getSharedSessionCookieOptions = () => {
  const domain = String(process.env.AUTH_COOKIE_DOMAIN || '').trim();

  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    ...(domain ? { domain } : {}),
  };
};

export const buildSharedNextAuthCookies = () => ({
  sessionToken: {
    name: SHARED_NEXTAUTH_SESSION_COOKIE_NAME,
    options: getSharedSessionCookieOptions(),
  },
});
