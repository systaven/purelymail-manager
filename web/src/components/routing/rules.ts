import type { MailboxSummary, NewRoutingRule, RoutingRule } from '@/lib/admin-api';

// Pure helpers for routing rules: kinds, sorting, matching. Mirrors the
// server's validation (server/routes/admin/routing.ts).

export type RuleKind = 'exact' | 'prefix' | 'catchall';
type RuleShape = Pick<NewRoutingRule, 'prefix' | 'matchUser' | 'catchall'>;

export const LOCAL_RE = /^[a-z0-9._+-]+$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_TARGETS = 50;

export const ruleKind = (r: RuleShape): RuleKind => (!r.prefix ? 'exact' : !r.matchUser && r.catchall ? 'catchall' : 'prefix');

export const rulePattern = (r: Pick<NewRoutingRule, 'prefix' | 'matchUser' | 'domainName'>) =>
  `${r.matchUser}${r.prefix ? '*' : ''}@${r.domainName}`;

const KIND_ORDER: Record<RuleKind, number> = { exact: 0, prefix: 1, catchall: 2 };

// Exact rules first, then prefixes, then catch-alls; alphabetical within each.
export const sortRules = (rules: RoutingRule[]) =>
  [...rules].sort((a, b) => KIND_ORDER[ruleKind(a)] - KIND_ORDER[ruleKind(b)] || a.matchUser.localeCompare(b.matchUser) || a.id - b.id);

const splitAddress = (address: string) => {
  const at = address.lastIndexOf('@');
  return [address.slice(0, at), address.slice(at + 1)] as const;
};

// Does the rule's pattern cover this local part (ignoring the catch-all flag)?
const patternCovers = (rule: RuleShape, local: string) => (rule.prefix ? local.startsWith(rule.matchUser) : local === rule.matchUser);

// Mailboxes on the rule's domain whose mail the rule would take.
export function interceptedMailboxes(rule: NewRoutingRule, mailboxes: MailboxSummary[]) {
  if (rule.catchall || (!rule.prefix && !rule.matchUser)) return [];
  return mailboxes.filter((m) => {
    const [local, domain] = splitAddress(m.address.toLowerCase());
    return domain === rule.domainName && patternCovers(rule, local);
  });
}

export type TestResult =
  | { type: 'invalid' }
  | { type: 'rule'; rule: RoutingRule; hasMailbox: boolean }
  | { type: 'mailbox'; address: string }
  | { type: 'unknownDomain'; domain: string }
  | { type: 'none' };

// Approximates PurelyMail: an exact rule wins, then the longest matching
// prefix; catch-all rules skip addresses that have a mailbox.
export function testAddress(input: string, rules: RoutingRule[], mailboxes: Set<string>, domains: Set<string>): TestResult | null {
  const address = input.trim().toLowerCase();
  if (!address) return null;
  if (!EMAIL_RE.test(address)) return { type: 'invalid' };
  const [local, domain] = splitAddress(address);
  // user+tag@ is delivered to user@ when that mailbox exists.
  const base = `${local.split('+')[0]}@${domain}`;
  const mailbox = mailboxes.has(address) ? address : mailboxes.has(base) ? base : null;
  const candidates = rules.filter((r) => r.domainName === domain && !(r.catchall && mailbox) && patternCovers(r, local));
  const best =
    candidates.find((r) => !r.prefix) ??
    candidates.filter((r) => r.prefix).sort((a, b) => b.matchUser.length - a.matchUser.length || Number(a.catchall) - Number(b.catchall))[0];
  if (best) return { type: 'rule', rule: best, hasMailbox: Boolean(mailbox) };
  if (mailbox) return { type: 'mailbox', address: mailbox };
  if (!domains.has(domain)) return { type: 'unknownDomain', domain };
  return { type: 'none' };
}

// Splits pasted/typed text into candidate addresses.
export const parseAddresses = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^<|>$/g, '').toLowerCase())
    .filter(Boolean);
