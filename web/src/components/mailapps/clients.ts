import type { mailAppsMessages } from '@/lib/i18n/messages/mailApps';
import { AppWindow, Bird, Laptop, Mails, Smartphone, TabletSmartphone, type LucideIcon } from 'lucide-react';

// PurelyMail's servers for mail apps.
export const SERVERS = {
  imap: { host: 'imap.purelymail.com', port: 993, security: 'SSL/TLS' },
  smtp: { host: 'smtp.purelymail.com', port: 465, security: 'SSL/TLS', altPort: 587 },
  dav: { host: 'purelymail.com', port: 443, url: 'https://purelymail.com/webdav/' },
} as const;

type StepKey = keyof (typeof mailAppsMessages)['en'];

export type ClientId = 'iphone' | 'mac' | 'outlook' | 'thunderbird' | 'android' | 'other';

export interface MailClient {
  id: ClientId;
  icon: LucideIcon;
  // Icon tile colours (light and dark).
  tone: string;
  // Apple devices can install a configuration profile.
  apple: boolean;
  // Message keys of the numbered steps.
  steps: [StepKey, StepKey, StepKey];
}

export const CLIENTS: MailClient[] = [
  { id: 'iphone', icon: Smartphone, tone: 'bg-sky-500/12 text-sky-600 dark:text-sky-400', apple: true, steps: ['ios1', 'ios2', 'ios3'] },
  { id: 'mac', icon: Laptop, tone: 'bg-slate-500/12 text-slate-600 dark:text-slate-300', apple: true, steps: ['mac1', 'mac2', 'mac3'] },
  { id: 'outlook', icon: Mails, tone: 'bg-blue-500/12 text-blue-600 dark:text-blue-400', apple: false, steps: ['outlook1', 'outlook2', 'outlook3'] },
  { id: 'thunderbird', icon: Bird, tone: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300', apple: false, steps: ['thunderbird1', 'thunderbird2', 'thunderbird3'] },
  { id: 'android', icon: TabletSmartphone, tone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', apple: false, steps: ['android1', 'android2', 'android3'] },
  { id: 'other', icon: AppWindow, tone: 'bg-violet-500/12 text-violet-600 dark:text-violet-300', apple: false, steps: ['other1', 'other2', 'other3'] },
];
