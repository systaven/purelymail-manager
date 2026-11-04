# Roadmap

A self-hosted web app for [PurelyMail](https://purelymail.com): a modern webmail, calendar and contacts for everyone with a mailbox, plus account administration. PurelyMail stays the mail backend (IMAP, SMTP, CalDAV/CardDAV and its management API); this project is only the front end and the small server behind it.

## Goals

- **Feels like a modern mail app.** Fast, keyboard-first, good on phones, light and dark, in English, 简体中文, 繁體中文 and 日本語. The bar is Gmail / Fastmail / Superhuman-class interaction, not "admin panel with a mail tab".
- **Small.** One Docker container, idle under 64 MB RAM and ~0% CPU; comfortably inside 512 MB / 0.2 CPU with many users.
- **Private.** A member's mailbox is theirs alone: administrators can delete it, not read it.
- **Independent.** Written from scratch; no code from the old panel. Interaction ideas come from open-source clients such as [Zero](https://github.com/Mail-0/Zero) (MIT) and [next-email-client](https://github.com/leerob/next-email-client) (MIT).

Running as a long-lived container (instead of serverless) is what makes the mail features below possible: persistent IMAP connections, push via IDLE, and server-side timers for undo send, scheduled send and snooze.

## Milestones

### M1 — Foundation ✅
- [x] Hono server, SQLite (WAL), migrations, audit log
- [x] Clerk sign-in; administrators from `ADMIN_EMAILS` (verified addresses only)
- [x] Typed PurelyMail API client matching the official spec
- [x] Strict CSP, CSRF protection, security headers
- [x] Design system (Tailwind v4 tokens, light/dark), app shell with collapsible sidebar, mobile drawer
- [x] ⌘K command palette, `g`-then-letter navigation
- [x] Four languages, theme switch, brand name and logo from environment variables
- [x] Docker image (amd64/arm64) built by GitHub Actions; ~30 MB RAM idle

### M2 — Administration ✅
- [x] Domains: list with DNS health, add-domain wizard with live DNS checks and copy buttons, settings, PurelyMail recheck, delete
- [x] Mailboxes: search, create, rename, reset password, search indexing, 2FA requirement, recovery methods, app passwords, delete
- [x] Routing: aliases, forwards, prefix rules, catch-alls; "which rule wins" address tester
- [x] Members (Clerk users): quotas, approval, allowed domains, disable, promote; mailbox requests and approvals; hand an existing mailbox to a member
- [x] Activity log
- [ ] Branding override from the UI (stored in SQLite) — env vars for now

### M3 — Mail ✅
- [x] IMAP connection pool (idle timeout, connection cap) and push to the browser (IDLE + NOOP fallback over Server-Sent Events)
- [x] Folders with unread counts, create folders; mailbox switcher
- [x] Conversation view (reply headers, subject fallback), hover actions, multi-select, optimistic updates with Undo
- [x] Keyboard shortcuts (j/k, o, u, e, #, s, Shift+U/I, r, a, f, c, x, !, /, ?)
- [x] Search with operators (`from:`, `to:`, `subject:`, `has:attachment`, `is:unread`, `before:`, `after:`)
- [x] Reader: sandboxed HTML, remote images blocked until allowed, tracker/script removal, inline images, attachments, unsubscribe link
- [x] Composer: rich text, recipient chips with autocomplete, attachments (drag/paste), signatures, drafts saved to IMAP, undo send, scheduled send
- [x] Members' mailbox credentials only in their browser; outbox encrypted at rest
- [ ] Conversations that span folders (your replies from Sent inside Inbox threads)
- [ ] Snooze; desktop notifications polish

### M4 — Calendar and contacts ✅
- [x] CalDAV: day / week / month / agenda views, drag to create, move and resize, recurring events (this event / all events), several calendars with colours
- [x] CardDAV: contacts with search, groups, quick compose; saved contacts in recipient autocomplete
- [x] Tolerant DAV client (PurelyMail omits `supported-calendar-component-set`; see purelymail-issues#421)
- [ ] Invitations (iMIP) shown and answered in mail

### M5 — Members ✅
- [x] "My mailboxes": request or create mailboxes within quota, change password, forwarding, delete, mail-app settings
- [x] Account page: profile, email addresses, password, two-step verification, devices, preferences, delete account (our own UI over Clerk's API)

### M6 — Polish
- [ ] Installable PWA, offline cache of recent mail
- [ ] Code-split Clerk and pages (smaller first load)
- [ ] Import tool for data from the old panel (Supabase) into SQLite
- [ ] Backup / restore docs, metrics endpoint

## Resource budget

| | Target |
|---|---|
| Idle memory | < 64 MB (measured ~30 MB at M1) |
| Memory with 20 active webmail users | < 256 MB |
| Idle CPU | ~0 |
| Image | linux/amd64, linux/arm64 |
