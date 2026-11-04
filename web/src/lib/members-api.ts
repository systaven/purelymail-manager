import { api } from './api';

// Types and calls for /api/admin/members and /api/admin/requests.

export interface MemberDefaults {
  maxMailboxes: number;
  requiresApproval: boolean;
  openDomains: string[];
}

export interface MemberLimits {
  maxMailboxes: number;
  requiresApproval: boolean;
  allowedDomains: string[];
}

export interface Member {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  role: 'admin' | 'guest';
  envAdmin: boolean;
  disabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  mailboxes: number;
  pendingRequests: number;
  // null = uses the default.
  overrides: { maxMailboxes: number | null; requiresApproval: boolean | null; allowedDomains: string[] | null };
  limits: MemberLimits;
}

export type MemberPatch = Partial<{
  role: 'admin' | 'guest';
  disabled: boolean;
  maxMailboxes: number | null;
  requiresApproval: boolean | null;
  allowedDomains: string[] | null;
}>;

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface MailboxRequest {
  id: number;
  mailbox: string;
  note: string | null;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  clerkUserId: string;
  email: string | null;
  name: string | null;
}

export const memberKeys = {
  members: ['admin', 'members'] as const,
  memberMailboxes: (id: string) => ['admin', 'members', id, 'mailboxes'] as const,
  requests: (status: RequestStatus) => ['admin', 'requests', status] as const,
  allRequests: ['admin', 'requests'] as const,
  defaults: ['admin', 'memberDefaults'] as const,
};

const enc = encodeURIComponent;

export const membersApi = {
  defaults: () => api<MemberDefaults>('/admin/members/defaults'),
  saveDefaults: (body: MemberDefaults) => api<MemberDefaults>('/admin/members/defaults', { method: 'PUT', body }),
  members: () => api<Member[]>('/admin/members'),
  mailboxes: (id: string) => api<string[]>(`/admin/members/${enc(id)}/mailboxes`),
  update: (id: string, body: MemberPatch) => api(`/admin/members/${enc(id)}`, { method: 'PATCH', body }),
  assign: (id: string, address: string) => api(`/admin/members/${enc(id)}/mailboxes/${enc(address)}`, { method: 'PUT' }),
  requests: (status: RequestStatus) => api<MailboxRequest[]>(`/admin/requests?status=${status}`),
  decide: (id: number, decision: 'approve' | 'reject') => api(`/admin/requests/${id}`, { body: { decision } }),
};

// SQLite's "YYYY-MM-DD HH:MM:SS" is UTC.
export const parseDbTime = (value: string) => new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);

export const memberLabel = (m: { name: string | null; email: string | null; clerkUserId: string }) => m.name || m.email || m.clerkUserId;
