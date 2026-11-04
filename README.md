# PurelyMail Manager

A modern, self-hosted web app for [PurelyMail](https://purelymail.com): webmail, calendar and contacts for your members, and administration of domains, mailboxes and routing for you. PurelyMail remains the mail service; this app runs in one small Docker container (~30 MB RAM idle).

> Status: foundation (M1) — sign-in, roles, the app shell and the account overview are done. Mail, calendar, contacts and the admin pages are next; see [ROADMAP.md](ROADMAP.md).

## Features

- Clerk sign-in; administrators are the addresses in `ADMIN_EMAILS` (verified emails only)
- Account overview: credit, domains with DNS health, mailboxes, routing rules
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

Data (the SQLite database) lives in `./data`. Back it up by copying that folder.

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
