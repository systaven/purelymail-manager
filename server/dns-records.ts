import { Resolver } from 'node:dns/promises';

// The DNS records PurelyMail needs for a domain, and whether each one is
// already published.

export interface DnsRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  content: string;
  priority?: number;
  purpose: 'mx' | 'spf' | 'ownership' | 'dkim' | 'dmarc';
  // null: couldn't check (DNS error other than "not found").
  found: boolean | null;
}

const OWNERSHIP_PREFIX = 'purelymail_ownership_proof=';

export function requiredRecords(domain: string, ownershipCode?: string): Omit<DnsRecord, 'found'>[] {
  const records: Omit<DnsRecord, 'found'>[] = [
    { type: 'MX', name: domain, content: 'mailserver.purelymail.com', priority: 50, purpose: 'mx' },
    { type: 'TXT', name: domain, content: 'v=spf1 include:_spf.purelymail.com ~all', purpose: 'spf' },
  ];
  if (ownershipCode) {
    const content = ownershipCode.startsWith(OWNERSHIP_PREFIX) ? ownershipCode : OWNERSHIP_PREFIX + ownershipCode;
    records.push({ type: 'TXT', name: domain, content, purpose: 'ownership' });
  }
  for (const i of [1, 2, 3]) {
    records.push({ type: 'CNAME', name: `purelymail${i}._domainkey.${domain}`, content: `key${i}.dkimroot.purelymail.com`, purpose: 'dkim' });
  }
  records.push({ type: 'CNAME', name: `_dmarc.${domain}`, content: 'dmarcroot.purelymail.com', purpose: 'dmarc' });
  return records;
}

const resolver = new Resolver({ timeout: 3000, tries: 2 });
const notFound = (error: any) => ['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN'].includes(error?.code);
const same = (a: string, b: string) => a.toLowerCase().replace(/\.$/, '') === b.toLowerCase().replace(/\.$/, '');

async function check(record: Omit<DnsRecord, 'found'>): Promise<boolean | null> {
  try {
    if (record.type === 'MX') return (await resolver.resolveMx(record.name)).some((mx) => same(mx.exchange, record.content));
    if (record.type === 'CNAME') return (await resolver.resolveCname(record.name)).some((c) => same(c, record.content));
    const txt = (await resolver.resolveTxt(record.name)).map((parts) => parts.join(''));
    if (record.purpose === 'spf') return txt.some((t) => t.startsWith('v=spf1') && t.includes('include:_spf.purelymail.com'));
    return txt.includes(record.content);
  } catch (error) {
    return notFound(error) ? false : null;
  }
}

export async function checkRecords(domain: string, ownershipCode?: string): Promise<DnsRecord[]> {
  const records = requiredRecords(domain, ownershipCode);
  const found = await Promise.all(records.map(check));
  return records.map((record, i) => ({ ...record, found: found[i] }));
}
