import { config } from './config';
import { ApiError } from './errors';

// Client for the PurelyMail management API (spec: https://news.purelymail.com/api/index.html).
// Every endpoint is a POST with a JSON body that answers
// { type: 'success', result } or { type: 'error', code, message }.

const TIMEOUT_MS = 20_000;

export interface DomainInfo {
  name: string;
  allowAccountReset: boolean;
  symbolicSubaddressing: boolean;
  isShared: boolean;
  dnsSummary: { passesMx: boolean; passesSpf: boolean; passesDkim: boolean; passesDmarc: boolean };
}

export interface RoutingRule {
  id: number;
  domainName: string;
  // true: matchUser is a prefix (matchUser*); false: the exact local part.
  prefix: boolean;
  matchUser: string;
  targetAddresses: string[];
  // A catch-all rule doesn't apply to addresses that belong to an existing user.
  catchall: boolean;
}

export interface UserInfo {
  enableSearchIndexing: boolean;
  recoveryEnabled: boolean;
  requireTwoFactorAuthentication: boolean;
  enableSpamFiltering: boolean;
  resetMethods: ResetMethod[];
}

export interface ResetMethod {
  type: 'email' | 'phone';
  target: string;
  description?: string;
  allowMfaReset?: boolean;
}

export interface NewUser {
  localPart: string;
  domain: string;
  password: string;
  enablePasswordReset?: boolean;
  enableSearchIndexing?: boolean;
}

export interface UserChanges {
  newUserName?: string;
  newPassword?: string;
  enableSearchIndexing?: boolean;
  enablePasswordReset?: boolean;
  requireTwoFactorAuthentication?: boolean;
}

export class PurelyMailError extends ApiError {
  constructor(message: string, public upstreamCode?: string) {
    super(message, 502, 'purelymail_error', { message });
  }
}

async function call<T = unknown>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.purelymail.apiUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Purelymail-Api-Token': config.purelymail.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ApiError(
      timedOut ? 'PurelyMail did not answer in time' : 'Could not reach PurelyMail',
      504,
      timedOut ? 'purelymail_timeout' : 'purelymail_unreachable'
    );
  }
  const data = (await response.json().catch(() => null)) as
    | { type: 'success'; result: T }
    | { type: 'error'; code?: string; message?: string }
    | null;
  if (!data) throw new PurelyMailError(`PurelyMail answered ${response.status} without JSON`);
  if (data.type !== 'success') throw new PurelyMailError(data.message || 'PurelyMail returned an error', data.code);
  return data.result;
}

export const purelymail = {
  checkAccountCredit: () => call<{ credit: string }>('checkAccountCredit'),

  listDomains: async (includeShared = false) =>
    (await call<{ domains: DomainInfo[] }>('listDomains', { includeShared })).domains,
  addDomain: (domainName: string) => call('addDomain', { domainName }),
  deleteDomain: (name: string) => call('deleteDomain', { name }),
  updateDomainSettings: (
    name: string,
    settings: { allowAccountReset?: boolean; symbolicSubaddressing?: boolean; recheckDns?: boolean }
  ) =>
    call('updateDomainSettings', { name, ...settings }),
  getOwnershipCode: () => call<{ code: string }>('getOwnershipCode'),

  listUsers: async () => (await call<{ users: string[] }>('listUser')).users ?? [],
  getUser: (userName: string) => call<UserInfo>('getUser', { userName }),
  createUser: (user: NewUser) =>
    call('createUser', {
      userName: user.localPart,
      domainName: user.domain,
      password: user.password,
      enablePasswordReset: user.enablePasswordReset ?? false,
      enableSearchIndexing: user.enableSearchIndexing ?? true,
      sendWelcomeEmail: false,
    }),
  modifyUser: (userName: string, changes: UserChanges) => call('modifyUser', { userName, ...changes }),
  deleteUser: (userName: string) => call('deleteUser', { userName }),

  listRoutingRules: async () => (await call<{ rules: RoutingRule[] }>('listRoutingRules')).rules ?? [],
  createRoutingRule: (rule: Omit<RoutingRule, 'id'>) => call('createRoutingRule', { ...rule }),
  deleteRoutingRule: (routingRuleId: number) => call('deleteRoutingRule', { routingRuleId }),

  listPasswordReset: async (userName: string) =>
    (await call<{ users: ResetMethod[] }>('listPasswordReset', { userName })).users ?? [],
  // `existingTarget` updates that method instead of adding one.
  upsertPasswordReset: (userName: string, method: ResetMethod, existingTarget?: string) =>
    call('upsertPasswordReset', { userName, existingTarget, ...method }),
  deletePasswordReset: (userName: string, target: string) => call('deletePasswordReset', { userName, target }),

  createAppPassword: async (userHandle: string, name: string) =>
    (await call<{ appPassword: string }>('createAppPassword', { userHandle, name })).appPassword,
  deleteAppPassword: (userName: string, appPassword: string) => call('deleteAppPassword', { userName, appPassword }),
};
