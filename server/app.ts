import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config';
import { ApiError } from './errors';
import { accountRoutes } from './routes/account';
import { authRoutes } from './routes/auth';

// Clerk's Frontend API host is encoded in the publishable key
// (pk_live_<base64("clerk.example.com$")>); the page loads Clerk from there.
function clerkHost(): string | null {
  const host = Buffer.from(config.clerk.publishableKey.split('_')[2] ?? '', 'base64').toString().replace(/\$$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? host : null;
}

const LOGO_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// BRAND_LOGO is either a URL the browser loads directly, or a local file served
// at /brand/logo.
function brandLogo(): { url: string | null; file: string | null; origin: string | null } {
  const logo = config.brand.logo;
  if (!logo) return { url: null, file: null, origin: null };
  if (/^https?:\/\//i.test(logo)) return { url: logo, file: null, origin: new URL(logo).origin };
  const file = path.resolve(logo);
  if (!LOGO_TYPES[path.extname(file).toLowerCase()]) throw new Error(`BRAND_LOGO must be ${Object.keys(LOGO_TYPES).join(', ')}`);
  if (!fs.existsSync(file)) throw new Error(`BRAND_LOGO file not found: ${file}`);
  return { url: `/brand/logo${path.extname(file).toLowerCase()}`, file, origin: null };
}

export function createApp() {
  const app = new Hono();
  const clerk = clerkHost();
  const clerkSources = clerk ? [`https://${clerk}`] : [];
  const logo = brandLogo();

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...clerkSources, 'https://challenges.cloudflare.com'],
        // Clerk's components inject their styles at runtime.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://img.clerk.com', ...(logo.origin ? [logo.origin] : [])],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...clerkSources],
        frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
  );

  const api = new Hono()
    // JSON can't be sent cross-site without CORS; this also stops cross-site form posts.
    .use(csrf())
    .use(bodyLimit({ maxSize: 1024 * 1024 }))
    .get('/health', (c) => c.json({ ok: true }))
    // Settings the web app needs before anyone signs in.
    .get('/config', (c) =>
      c.json({ clerkPublishableKey: config.clerk.publishableKey, brand: { name: config.brand.name, logoUrl: logo.url } })
    )
    .route('/auth', authRoutes)
    .route('/account', accountRoutes)
    .notFound(() => {
      throw new ApiError('Not found', 404, 'not_found');
    });

  app.route('/api', api);

  if (logo.file) {
    const file = logo.file;
    app.get('/brand/*', (c) => {
      c.header('Content-Type', LOGO_TYPES[path.extname(file).toLowerCase()]);
      c.header('Cache-Control', 'public, max-age=3600');
      return c.body(fs.readFileSync(file));
    });
  }

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: error.message, code: error.code, params: error.params }, error.status as 400);
    }
    // Thrown by Hono's own middleware (CSRF check, body limit...).
    if (error instanceof HTTPException) {
      return c.json({ error: error.message || 'Request rejected', code: `http_${error.status}` }, error.status);
    }
    console.error(`${c.req.method} ${c.req.path}:`, error);
    return c.json({ error: 'Something went wrong', code: 'internal_error' }, 500);
  });

  // The web app: hashed assets are cached forever, every other path gets index.html.
  const root = path.relative(process.cwd(), config.webDir);
  app.use(
    '/assets/*',
    serveStatic({
      root,
      onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    })
  );
  app.use('*', serveStatic({ root }));
  const indexFile = path.join(config.webDir, 'index.html');
  app.get('*', (c) => {
    if (!fs.existsSync(indexFile)) return c.text('Web app not built. Run: npm run build', 503);
    c.header('Cache-Control', 'no-cache');
    return c.html(fs.readFileSync(indexFile, 'utf8'));
  });

  return app;
}
