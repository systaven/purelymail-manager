# PurelyMail Manager

A modern, self-hosted web app for [PurelyMail](https://purelymail.com): webmail, calendar and contacts for your members, and administration of domains, mailboxes and routing for you. PurelyMail remains the mail service; this app runs in one small Docker container (~30 MB RAM idle).

> Status: administration, member self-service, webmail, calendar and contacts are done. See [ROADMAP.md](ROADMAP.md) for what's next.

## Features

- Clerk sign-in; administrators are the addresses in `ADMIN_EMAILS` (verified emails only)
- Account overview: credit, domains with DNS health, mailboxes, routing rules
- Domains with a guided setup that checks each DNS record live; mailboxes (passwords, 2FA, recovery, app passwords); routing rules with an address tester; activity log
- Members sign up with Clerk and create or request mailboxes within the quota, domains and approval rules you set. Their mailboxes are private: administrators can delete them but not open or change them
- Webmail: conversations, live push of new mail, search operators, keyboard shortcuts, rich-text composer with drafts, undo send and scheduled send
- Calendar (month, week, day, agenda; drag to create, move and resize; recurring events) and contacts (groups, search, quick compose), stored in PurelyMail over CalDAV/CardDAV
- ⌘K / Ctrl+K command palette and keyboard navigation (`g` then `i`, `o`, `d`, `u`, `r`...)
- Light and dark themes; English, 简体中文, 繁體中文, 日本語
- Your own name and logo (`BRAND_NAME`, `BRAND_LOGO`)
- Strict Content Security Policy, CSRF protection, non-root container

## Run with Docker

1. Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com) and copy its keys.
2. Create `.env` from [`.env.example`](.env.example) and fill in at least `PURELYMAIL_API_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `ADMIN_EMAILS`.
3. Start it:

   ```sh
   docker compose up -d
   ```

   The image is built by GitHub Actions for amd64 and arm64 and pushed to `ghcr.io/systaven/purelymail-manager` (`:latest` on every push to `main`, `:1.2.3` for tags like `v1.2.3`), so the server only downloads it. The compose file caps the container at 256 MB and 0.2 CPU.

   If the package is private, log in first with a GitHub token that has `read:packages`: `echo $TOKEN | docker login ghcr.io -u <github-user> --password-stdin`. Or make it public under the repository's **Packages → Package settings**.
4. Put it behind your HTTPS reverse proxy (Caddy, nginx, Traefik...) and set `PUBLIC_URL` to the public address.

Data (the SQLite database and, unless `SECRET_KEY` is set, the encryption key) lives in `./data`. Back it up by copying that folder.

## Webmail and privacy

Webmail signs in to PurelyMail over IMAP/SMTP with an app password the panel creates for each mailbox:

- **Mailboxes nobody owns** (the administrators'): the app password is stored encrypted in SQLite and shared by administrators.
- **Members' mailboxes**: the app password lives only in that member's browser, in an encrypted HttpOnly cookie. Administrators — and anyone with the database — can't open them. An administrator can still delete a member's mailbox.
- Mail waiting to be sent (undo send, scheduled send) is kept encrypted, together with the password needed to send it, until it has been sent.

New mail is pushed to the browser (IMAP IDLE + Server-Sent Events). Connections are pooled and closed after five idle minutes.

Calendar and contacts use the same app password against PurelyMail's CalDAV/CardDAV server, so they stay in sync with your phone and desktop apps. Recurring events are expanded on the server; new events keep the browser's time zone.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PURELYMAIL_API_KEY` | yes | PurelyMail API key |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | yes | Clerk application keys |
| `ADMIN_EMAILS` | yes | Comma-separated administrator emails. A Clerk user whose verified primary email is listed is an administrator |
| `PUBLIC_URL` | recommended | Public origin (e.g. `https://mail.example.com`); Clerk tokens issued for other sites are refused |
| `CLERK_JWT_KEY` | recommended | Clerk's JWT public key (PEM), so sign-ins are verified without calling Clerk |
| `BRAND_NAME` | no | Name in the sidebar, sign-in page and browser tab (default `PurelyMail`) |
| `BRAND_LOGO` | no | Logo: an `https://` URL, or a file path such as `/data/logo.svg` (svg, png, webp, jpg, ico), also used as the favicon |
| `SECRET_KEY` | no | Encrypts stored webmail credentials and queued mail. Default: a random key created in `DATA_DIR/secret.key` |
| `MAIL_SAVE_SENT` | no | Save sent mail to the Sent folder (default `true`) |
| `MAIL_IMAP_*`, `MAIL_SMTP_*`, `MAIL_MAX_CONNECTIONS` | no | Mail server overrides (testing) and the IMAP connection cap (default 40) |
| `DAV_URL` | no | CalDAV/CardDAV base (default `https://purelymail.com/webdav/`) |
| `PORT`, `DATA_DIR` | no | Defaults `3000` and `/data` in the image |
| `PURELYMAIL_API_URL` | no | Override the API base (testing) |

## Development

```sh
npm install
cp .env.example .env   # fill in, set DATA_DIR=./data
npm run dev            # API on :3000, web app with hot reload on :5173
npm run typecheck
npm run build && npm start
```

Stack: [Hono](https://hono.dev) on Node 24 (22.13+ works), Node's built-in SQLite, React 19, Vite, Tailwind CSS v4, Radix primitives, TanStack Query, Clerk. The server is bundled into a single file, so the Alpine image ships no `node_modules`.

```
server/          API server (auth, PurelyMail client, routes, SQLite)
web/src/         React app
  components/ui    design-system primitives
  components/shell sidebar, command palette, user menu
  lib/i18n         translations (every language side by side, type-checked)
  pages/           screens
```
