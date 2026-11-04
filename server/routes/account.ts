import { Hono } from 'hono';
import { type AppEnv, requireAuth } from '../auth';
import { purelymail } from '../purelymail';

export const accountRoutes = new Hono<AppEnv>()
  .use(requireAuth('admin'))
  .get('/credit', async (c) => c.json(await purelymail.checkAccountCredit()))
  // Everything the Overview page shows, in one round trip.
  .get('/overview', async (c) => {
    const [credit, domains, users, rules] = await Promise.all([
      purelymail.checkAccountCredit(),
      purelymail.listDomains(),
      purelymail.listUsers(),
      purelymail.listRoutingRules(),
    ]);
    const healthy = domains.filter((d) => Object.values(d.dnsSummary ?? {}).every(Boolean)).length;
    return c.json({
      credit: credit.credit,
      domains: domains.length,
      healthyDomains: healthy,
      mailboxes: users.length,
      rules: rules.length,
    });
  });
