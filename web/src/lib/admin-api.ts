import { api } from './api';

// Types and calls for /api/admin/*. Query keys live here so pages can refresh
// each other's data after changes.

export interface Domain {
  name: string;
  allowAccountReset: boolean;
  symbolicSubaddressing: boolean;
  isShared: boolean;
  dnsSummary: { passesMx: boolean; passesSpf: boolean; passesDkim: boolean; passesDmarc: boolean };
}

export interface DnsRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  content: string;
  priority?: number;
  purpose: 'mx' | 'spf' | 'ownership' | 'dkim' | 'dmarc';
  found: boolean | null;
}

export interface Owner {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  imageUrl?: string | null; // Clerk profile photo (admin lists)
}

export interface MailboxSummary {
  address: string;
  owner: Owner | null;
}

export interface ResetMethod {
  type: 'email' | 'phone';
  target: string;
  description?: string;
  allowMfaReset?: boolean;
}

export type MailboxDetail =
  | { address: string; owner: Owner; private: true }
  | {
      address: string;
      owner: null;
      private: false;
      enableSearchIndexing: boolean;
      recoveryEnabled: boolean;
      requireTwoFactorAuthentication: boolean;
      enableSpamFiltering: boolean;
      resetMethods: ResetMethod[];
    };

export interface RoutingRule {
  id: number;
  domainName: string;
  prefix: boolean;
  matchUser: string;
  targetAddresses: string[];
  catchall: boolean;
}

export type NewRoutingRule = Omit<RoutingRule, 'id'>;

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  details: string | null;
}

export const adminKeys = {
  domains: ['admin', 'domains'] as const,
  records: (domain: string) => ['admin', 'domains', domain, 'records'] as const,
  mailboxes: ['admin', 'mailboxes'] as const,
  mailbox: (address: string) => ['admin', 'mailboxes', address] as const,
  routing: ['admin', 'routing'] as const,
  audit: ['admin', 'audit'] as const,
  overview: ['overview'] as const,
};

const enc = encodeURIComponent;

export const adminApi = {
  domains: () => api<Domain[]>('/admin/domains'),
  records: (domain: string) => api<DnsRecord[]>(`/admin/domains/${enc(domain)}/records`),
  addDomain: (domain: string) => api('/admin/domains', { body: { domain } }),
  updateDomain: (name: string, settings: { allowAccountReset?: boolean; symbolicSubaddressing?: boolean; recheckDns?: boolean }) =>
    api(`/admin/domains/${enc(name)}`, { method: 'PATCH', body: settings }),
  deleteDomain: (name: string) => api(`/admin/domains/${enc(name)}`, { method: 'DELETE' }),

  mailboxes: () => api<MailboxSummary[]>('/admin/mailboxes'),
  mailbox: (address: string) => api<MailboxDetail>(`/admin/mailboxes/${enc(address)}`),
  // Without a password the server sets a random one.
  createMailbox: (body: { localPart: string; domain: string; password?: string; enablePasswordReset?: boolean; enableSearchIndexing?: boolean }) =>
    api('/admin/mailboxes', { body }),
  updateMailbox: (
    address: string,
    body: { newPassword?: string; newUserName?: string; enableSearchIndexing?: boolean; enablePasswordReset?: boolean; requireTwoFactorAuthentication?: boolean }
  ) => api(`/admin/mailboxes/${enc(address)}`, { method: 'PATCH', body }),
  deleteMailbox: (address: string) => api(`/admin/mailboxes/${enc(address)}`, { method: 'DELETE' }),
  // Show an existing PurelyMail mailbox in the panel / stop showing it (nothing is deleted).
  adoptMailbox: (address: string, password?: string) => api('/admin/mailboxes/adopt', { body: { address, password } }),
  checkMailbox: (address: string) =>
    api<{ address: string; exists: boolean; managed: boolean; owned: boolean }>(`/admin/mailboxes/check?address=${encodeURIComponent(address)}`),
  releaseMailbox: (address: string) => api(`/admin/mailboxes/${enc(address)}/managed`, { method: 'DELETE' }),
  setRecovery: (address: string, body: ResetMethod & { existingTarget?: string }) =>
    api(`/admin/mailboxes/${enc(address)}/recovery`, { method: 'PUT', body }),
  deleteRecovery: (address: string, target: string) => api(`/admin/mailboxes/${enc(address)}/recovery`, { method: 'DELETE', body: { target } }),
  createAppPassword: (address: string, name: string) =>
    api<{ appPassword: string }>(`/admin/mailboxes/${enc(address)}/app-passwords`, { body: { name } }),

  routing: () => api<RoutingRule[]>('/admin/routing'),
  createRule: (rule: NewRoutingRule) => api('/admin/routing', { body: rule }),
  updateRule: (id: number, rule: NewRoutingRule) => api(`/admin/routing/${id}`, { method: 'PUT', body: rule }),
  deleteRule: (id: number) => api(`/admin/routing/${id}`, { method: 'DELETE' }),

  audit: (before?: number) => api<AuditEntry[]>(`/admin/audit${before ? `?before=${before}` : ''}`),
};

// A strong random password for new mailboxes.
export function generatePassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
