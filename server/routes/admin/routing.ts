import { Hono } from 'hono';
import { type AppEnv } from '../../auth';
import { audit } from '../../db';
import { ApiError, badRequest } from '../../errors';
import { ownersByMailbox } from '../../owners';
import { purelymail, type RoutingRule } from '../../purelymail';
import { bool, domain, emails, json, str } from '../../validate';

type NewRule = Omit<RoutingRule, 'id'>;

function parseRule(body: Record<string, unknown>): NewRule {
  const rule: NewRule = {
    domainName: domain(body.domainName, 'domainName'),
    prefix: bool(body.prefix, 'prefix') ?? false,
    matchUser: str(body.matchUser, 'matchUser', { optional: true, max: 64 }).toLowerCase(),
    targetAddresses: emails(body.targetAddresses, 'targetAddresses'),
    catchall: bool(body.catchall, 'catchall') ?? false,
  };
  if (!rule.prefix && !rule.matchUser) throw badRequest('Enter the address to match', 'missing_field', { name: 'matchUser' });
  if (rule.matchUser && !/^[a-z0-9._+-]+$/.test(rule.matchUser)) throw badRequest('Invalid address', 'invalid_local_part');
  return rule;
}

// Rules may not redirect mail sent to a member's private mailbox. Catch-alls
// never apply to existing mailboxes, so they're fine.
function assertNotIntercepting(rule: NewRule) {
  if (rule.catchall) return;
  for (const mailbox of ownersByMailbox().keys()) {
    const [local, mailboxDomain] = mailbox.split('@');
    if (mailboxDomain !== rule.domainName) continue;
    if (rule.prefix ? local.startsWith(rule.matchUser) : local === rule.matchUser) {
      throw new ApiError('This rule would redirect mail for a private mailbox', 403, 'rule_intercepts_private', { mailbox });
    }
  }
}

async function findRule(id: number): Promise<RoutingRule> {
  const rule = (await purelymail.listRoutingRules()).find((r) => r.id === id);
  if (!rule) throw new ApiError('Rule not found', 404, 'not_found');
  return rule;
}

const ruleId = (value: string) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) throw badRequest('Invalid rule', 'invalid_field', { name: 'id' });
  return id;
};

export const routingRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await purelymail.listRoutingRules()))
  .post('/', async (c) => {
    const rule = parseRule(await json(c.req));
    assertNotIntercepting(rule);
    await purelymail.createRoutingRule(rule);
    audit(c.var.session.actor, 'routing.create', `${rule.matchUser}${rule.prefix ? '*' : ''}@${rule.domainName}`, rule);
    return c.json({ ok: true });
  })
  // PurelyMail has no update: replace the rule, restoring the old one if the new one is refused.
  .put('/:id', async (c) => {
    const old = await findRule(ruleId(c.req.param('id')));
    const rule = parseRule(await json(c.req));
    assertNotIntercepting(rule);
    await purelymail.deleteRoutingRule(old.id);
    try {
      await purelymail.createRoutingRule(rule);
    } catch (error) {
      const { id: _id, ...original } = old;
      await purelymail.createRoutingRule(original).catch(() => {});
      throw error;
    }
    audit(c.var.session.actor, 'routing.update', `${rule.matchUser}${rule.prefix ? '*' : ''}@${rule.domainName}`, rule);
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const rule = await findRule(ruleId(c.req.param('id')));
    await purelymail.deleteRoutingRule(rule.id);
    audit(c.var.session.actor, 'routing.delete', `${rule.matchUser}${rule.prefix ? '*' : ''}@${rule.domainName}`);
    return c.json({ ok: true });
  });
