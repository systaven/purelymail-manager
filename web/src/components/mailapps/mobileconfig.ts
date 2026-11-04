import { SERVERS } from './clients';

// Builds an Apple configuration profile (.mobileconfig) for one mailbox: mail
// (IMAP/SMTP), calendars (CalDAV) and contacts (CardDAV). It is made in the
// browser and saved straight to disk; the password never leaves the device.
// Without a password, iOS and macOS ask for it while installing.

type PlistValue = string | number | boolean | PlistValue[] | { [key: string]: PlistValue | undefined };

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(value: PlistValue, depth: number): string {
  const pad = '\t'.repeat(depth);
  if (typeof value === 'string') return `${pad}<string>${escapeXml(value)}</string>`;
  if (typeof value === 'number') return `${pad}<integer>${Math.trunc(value)}</integer>`;
  if (typeof value === 'boolean') return `${pad}<${value}/>`;
  if (Array.isArray(value)) return `${pad}<array>\n${value.map((v) => render(v, depth + 1)).join('\n')}\n${pad}</array>`;
  const entries = Object.entries(value).filter((entry): entry is [string, PlistValue] => entry[1] !== undefined);
  return `${pad}<dict>\n${entries.map(([k, v]) => `${pad}\t<key>${escapeXml(k)}</key>\n${render(v, depth + 1)}`).join('\n')}\n${pad}</dict>`;
}

// crypto.randomUUID needs a secure context; the panel may be served over plain HTTP.
function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID().toUpperCase();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}

export function buildMobileConfig({ address, password, description }: { address: string; password?: string | null; description: string }): string {
  // Stable per mailbox, so installing again replaces the earlier profile.
  const host = window.location.hostname.split('.').reverse().join('.') || 'local';
  const id = `${host}.mailapps.${address.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const pw = password || undefined;
  const common = (type: string, name: string, suffix: string) => ({
    PayloadType: type,
    PayloadVersion: 1,
    PayloadIdentifier: `${id}.${suffix}`,
    PayloadUUID: uuid(),
    PayloadDisplayName: name,
  });

  const mail = {
    ...common('com.apple.mail.managed', `${address} (Mail)`, 'mail'),
    EmailAccountDescription: address,
    EmailAccountType: 'EmailTypeIMAP',
    EmailAddress: address,
    IncomingMailServerAuthentication: 'EmailAuthPassword',
    IncomingMailServerHostName: SERVERS.imap.host,
    IncomingMailServerPortNumber: SERVERS.imap.port,
    IncomingMailServerUseSSL: true,
    IncomingMailServerUsername: address,
    IncomingPassword: pw,
    OutgoingMailServerAuthentication: 'EmailAuthPassword',
    OutgoingMailServerHostName: SERVERS.smtp.host,
    OutgoingMailServerPortNumber: SERVERS.smtp.port,
    OutgoingMailServerUseSSL: true,
    OutgoingMailServerUsername: address,
    OutgoingPassword: pw,
    OutgoingPasswordSameAsIncomingPassword: true,
    PreventAppSheet: false,
    PreventMove: false,
    SMIMEEnabled: false,
    allowMailDrop: true,
  };
  const caldav = {
    ...common('com.apple.caldav.account', `${address} (Calendars)`, 'caldav'),
    CalDAVAccountDescription: address,
    CalDAVHostName: SERVERS.dav.host,
    CalDAVPort: SERVERS.dav.port,
    CalDAVPrincipalURL: SERVERS.dav.url,
    CalDAVUseSSL: true,
    CalDAVUsername: address,
    CalDAVPassword: pw,
  };
  const carddav = {
    ...common('com.apple.carddav.account', `${address} (Contacts)`, 'carddav'),
    CardDAVAccountDescription: address,
    CardDAVHostName: SERVERS.dav.host,
    CardDAVPort: SERVERS.dav.port,
    CardDAVPrincipalURL: SERVERS.dav.url,
    CardDAVUseSSL: true,
    CardDAVUsername: address,
    CardDAVPassword: pw,
  };
  const profile: PlistValue = {
    PayloadContent: [mail, caldav, carddav],
    PayloadDescription: description,
    PayloadDisplayName: address,
    PayloadIdentifier: id,
    PayloadOrganization: window.location.hostname || 'PurelyMail',
    PayloadRemovalDisallowed: false,
    PayloadType: 'Configuration',
    PayloadUUID: uuid(),
    PayloadVersion: 1,
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    render(profile, 0),
    '</plist>',
    '',
  ].join('\n');
}

export function downloadMobileConfig(options: Parameters<typeof buildMobileConfig>[0]) {
  const blob = new Blob([buildMobileConfig(options)], { type: 'application/x-apple-aspen-config' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.address}.mobileconfig`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
