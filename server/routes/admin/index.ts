import { Hono } from 'hono';
import { type AppEnv, requireAuth } from '../../auth';
import { getDb } from '../../db';
import { domainRoutes } from './domains';
import { mailboxRoutes } from './mailboxes';
import { memberRoutes, requestRoutes } from './members';
import { routingRoutes } from './routing';

export const adminRoutes = new Hono<AppEnv>()
  .use(requireAuth('admin'))
  .route('/domains', domainRoutes)
  .route('/mailboxes', mailboxRoutes)
  .route('/routing', routingRoutes)
  .route('/members', memberRoutes)
  .route('/requests', requestRoutes)
  .get('/audit', (c) => {
    const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER;
    const rows = getDb().prepare('SELECT * FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT 100').all(before);
    return c.json(rows);
  });
