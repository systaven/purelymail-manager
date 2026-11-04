import path from 'node:path';

// All configuration comes from the environment, read once at startup. Missing
// required values stop the server with a clear message instead of failing later.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const optional = (name: string) => process.env[name]?.trim() || undefined;

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function adminEmails(): string[] {
  const emails = list(optional('ADMIN_EMAILS')).map((email) => email.toLowerCase());
  if (!emails.length) throw new Error('Set ADMIN_EMAILS to the email address(es) of the administrators, separated by commas');
  return emails;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  production: process.env.NODE_ENV === 'production',
  // Where the built web app lives (vite build output).
  webDir: path.resolve(process.env.WEB_DIR || './dist/web'),
  purelymail: {
    apiKey: required('PURELYMAIL_API_KEY'),
    apiUrl: optional('PURELYMAIL_API_URL') || 'https://purelymail.com/api/v0',
  },
  // Clerk users whose verified primary email is listed here are administrators.
  adminEmails: adminEmails(),
  clerk: {
    publishableKey: required('CLERK_PUBLISHABLE_KEY'),
    secretKey: required('CLERK_SECRET_KEY'),
    // PEM public key from the Clerk dashboard; lets tokens be verified without a network call.
    jwtKey: optional('CLERK_JWT_KEY'),
    // Origins allowed to present Clerk tokens; defaults to PUBLIC_URL.
    authorizedParties: list(optional('CLERK_AUTHORIZED_PARTIES') || optional('PUBLIC_URL')).map((origin) => new URL(origin).origin),
  },
  brand: {
    name: optional('BRAND_NAME') || 'PurelyMail',
    // An http(s) URL, or a path to an image file (e.g. /data/logo.svg) served at /brand/logo.
    logo: optional('BRAND_LOGO'),
  },
};
