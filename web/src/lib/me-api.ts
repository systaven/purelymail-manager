import { api } from './api';

// The signed-in member's own mailboxes (/api/me).

export interface MyAccount {
  limits: { maxMailboxes: number; requiresApproval: boolean; allowedDomains: string[] };
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
  create: (body: { localPart: string; domain: string; password?: string; note?: string }) =>
    api<{ status: 'created' | 'requested' }>('/me/mailboxes', { body }),
  // Takes over a mailbox that already exists in PurelyMail, proven with its password.
  claim: (body: { address: string; password: string; newPassword?: string }) => api('/me/claim', { body }),
  cancelRequest: (id: number) => api(`/me/requests/${id}`, { method: 'DELETE' }),
  remove: (address: string) => api(`/me/mailboxes/${enc(address)}`, { method: 'DELETE' }),
  setPassword: (address: string, password: string) => api(`/me/mailboxes/${enc(address)}/password`, { body: { password } }),
  forwarding: (address: string) => api<Forwarding>(`/me/mailboxes/${enc(address)}/forwarding`),
  setForwarding: (address: string, forwarding: Forwarding) =>
    api(`/me/mailboxes/${enc(address)}/forwarding`, { method: 'PUT', body: forwarding }),
};
