import { CalendarDays, Globe, Inbox, LayoutDashboard, Mailbox, Route, Settings, UserRound, Users, UsersRound, type LucideIcon } from 'lucide-react';
import type { shellMessages } from '@/lib/i18n/messages/shell';

export interface NavItem {
  to: string;
  label: keyof typeof shellMessages.en;
  icon: LucideIcon;
  // Single-key shortcut after pressing g (g then i = Mail...).
  goKey?: string;
}

export const appNav: NavItem[] = [
  { to: '/mail', label: 'mail', icon: Inbox, goKey: 'i' },
  { to: '/calendar', label: 'calendar', icon: CalendarDays, goKey: 'c' },
  { to: '/contacts', label: 'contacts', icon: UserRound, goKey: 'p' },
];

export const memberNav: NavItem[] = [{ to: '/mailboxes', label: 'myMailboxes', icon: Mailbox, goKey: 'm' }];

export const adminNav: NavItem[] = [
  { to: '/', label: 'overview', icon: LayoutDashboard, goKey: 'o' },
  { to: '/domains', label: 'domains', icon: Globe, goKey: 'd' },
  { to: '/users', label: 'users', icon: Users, goKey: 'u' },
  { to: '/routing', label: 'routing', icon: Route, goKey: 'r' },
  { to: '/guests', label: 'guests', icon: UsersRound, goKey: 'g' },
  { to: '/settings', label: 'settings', icon: Settings, goKey: 's' },
];
