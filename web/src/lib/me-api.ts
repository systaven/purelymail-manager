import { api } from './api';

// The signed-in member's own mailboxes (/api/me).

export interface MyAccount {
  // mailApps: may set a password and use IMAP/SMTP apps (webmail always works).
  limits: { maxMailboxes: number; requiresApproval: boolean; allowedDomains: string[]; mailApps: boolean };
  mailboxes: string[];
  requests: { id: number; mailbox: string; note: string | null; created_at: string }[];
}

export interface Forwarding {
  targets: string[];
  keepCopy: boolean;
}

export const meKeys = {
  account: ['me'] as const,
  forwarding: (address: string) => ['me', 'forwarding', address] as const,
};

const enc = encodeURIComponent;

export const meApi = {
  account: () => api<MyAccount>('/me'),
  create: (body: { localPart: string; domain: string; note?: string }) =>
    api<{ status: 'created' | 'requested' }>('/me/mailboxes', { body }),
  // Takes over a mailbox that already exists in PurelyMail, proven with its password.
  // Without mail-app access the server gives it a random password instead.
  claim: (body: { address: string; password: string; newPassword?: string }) => api('/me/claim', { body }),
  cancelRequest: (id: number) => api(`/me/requests/${id}`, { method: 'DELETE' }),
  remove: (address: string) => api(`/me/mailboxes/${enc(address)}`, { method: 'DELETE' }),
  // 403 mail_apps_disabled when mail apps are off for this member.
  setPassword: (address: string, password: string) => api(`/me/mailboxes/${enc(address)}/password`, { body: { password } }),
  forwarding: (address: string) => api<Forwarding>(`/me/mailboxes/${enc(address)}/forwarding`),
  setForwarding: (address: string, forwarding: Forwarding) =>
    api(`/me/mailboxes/${enc(address)}/forwarding`, { method: 'PUT', body: forwarding }),
};
