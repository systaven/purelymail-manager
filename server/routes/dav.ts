import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { randomUUID } from 'node:crypto';
import { type DavContext, readCollection, text, withDav } from '../dav/client';
import { createCalendar, createEvent, deleteEvent, type EventInput, listCalendars, listEvents, moveEvent, type Repeat, updateCalendar, updateEvent } from '../dav/calendar';
import { type ContactInput, createContact, deleteContact, type Labeled, listAddressBooks, listContacts, updateContact } from '../dav/contacts';
import { badRequest } from '../errors';
import { openMailbox } from '../mail/access';
import { bool, json, str } from '../validate';

// Calendar and contacts, mounted under /api/mail/dav so members' mailbox
// credential cookies (Path=/api/mail) are sent with these requests too.

const REPEATS: Repeat[] = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

const colorOf = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw badRequest('Invalid color', 'invalid_field', { name: 'color' });
  return value;
};

const etagOf = (value: unknown) => (typeof value === 'string' && value.length < 300 ? value : null);

function eventInput(body: Record<string, unknown>): EventInput {
  const allDay = bool(body.allDay, 'allDay') ?? false;
  const repeat = body.repeat;
  if (repeat !== undefined && repeat !== null && !REPEATS.includes(repeat as Repeat)) throw badRequest('Invalid repeat', 'invalid_field', { name: 'repeat' });
  return {
    title: str(body.title, 'title', { optional: true, max: 500 }),
    location: str(body.location, 'location', { optional: true, max: 500 }),
    description: str(body.description, 'description', { optional: true, max: 20_000 }),
    allDay,
    start: str(body.start, 'start', { max: 40 }),
    end: str(body.end, 'end', { max: 40 }),
    timeZone: str(body.timeZone, 'timeZone', { optional: true, max: 100 }) || 'UTC',
    repeat: repeat as Repeat | null | undefined,
  };
}

function labeled(value: unknown, name: string): Labeled[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  return value.map((v) => ({
    value: str((v as Labeled)?.value, name, { optional: true, max: 300 }),
    label: str((v as Labeled)?.label, name, { optional: true, max: 30 }).toLowerCase(),
  }));
}

function contactInput(body: Record<string, unknown>): ContactInput {
  const groups = body.groups === undefined ? [] : body.groups;
  if (!Array.isArray(groups) || groups.length > 50) throw badRequest('Invalid groups', 'invalid_field', { name: 'groups' });
  const input = {
    firstName: str(body.firstName, 'firstName', { optional: true, max: 200 }),
    lastName: str(body.lastName, 'lastName', { optional: true, max: 200 }),
    emails: labeled(body.emails, 'emails'),
    phones: labeled(body.phones, 'phones'),
    organization: str(body.organization, 'organization', { optional: true, max: 300 }),
    title: str(body.title, 'title', { optional: true, max: 300 }),
    note: str(body.note, 'note', { optional: true, max: 20_000 }),
    birthday: str(body.birthday, 'birthday', { optional: true, max: 10 }),
    groups: groups.map((g) => str(g, 'groups', { max: 100 })),
  };
  if (!input.firstName && !input.lastName && !input.organization && !input.emails.some((e) => e.value)) throw badRequest('Missing name', 'missing_field', { name: 'name' });
  return input;
}

const list = (value: string | undefined) => (value ? value.split(',').filter(Boolean).slice(0, 50) : []);

// One save → list → read → delete round on a real collection, recording what
// the server answered at each step. For debugging against PurelyMail; returns
// no credentials. Removes what it created.
async function roundTrip(ctx: DavContext, collection: string, kind: 'calendar' | 'addressbook') {
  const uid = `diagnose-${randomUUID()}`;
  const href = `${collection}${uid}.${kind === 'calendar' ? 'ics' : 'vcf'}`;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const body =
    kind === 'calendar'
      ? `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//purelymail-manager//diagnose//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${now}\r\nDTSTART:${now}\r\nDURATION:PT30M\r\nSUMMARY:purelymail-manager test\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
      : `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:purelymail-manager test\r\nN:test;purelymail-manager;;;\r\nEND:VCARD\r\n`;
  const result: Record<string, unknown> = { collection, href };
  const put = await ctx.dav.request('PUT', href, { body, headers: { 'Content-Type': `text/${kind === 'calendar' ? 'calendar' : 'vcard'}; charset=utf-8`, 'If-None-Match': '*' } });
  result.put = { status: put.status, etag: put.headers.get('etag'), location: put.headers.get('location'), body: (await put.text()).slice(0, 500) };
  const get = await ctx.dav.request('GET', href);
  result.get = { status: get.status, contentType: get.headers.get('content-type'), body: (await get.text()).slice(0, 800) };
  const list = await ctx.dav.request('PROPFIND', collection, {
    body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>',
    headers: { Depth: '1' },
  });
  const listXml = await list.text();
  result.propfind = { status: list.status, mentionsTestItem: listXml.includes(uid), bytes: listXml.length, start: listXml.slice(0, 2500) };
  try {
    const items = await readCollection(ctx.dav, `diagnose|${ctx.address}`, collection, kind);
    const mine = items.find((r) => r.href.includes(uid));
    result.readCollection = { items: items.length, found: Boolean(mine), hasData: Boolean(mine && text(mine.props[kind === 'calendar' ? 'calendar-data' : 'address-data'])) };
  } catch (error) {
    result.readCollection = { error: String(error) };
  }
  const del = await ctx.dav.request('DELETE', href);
  result.delete = { status: del.status };
  return result;
}

export const davRoutes = new Hono<AppEnv>()
  .get('/diagnose', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(
      await withDav(access, async (ctx) => {
        ctx.dav.trace = [];
        const out: Record<string, unknown> = { homes: ctx.homes };
        const step = async (name: string, fn: () => Promise<unknown>) => {
          try {
            out[name] = await fn();
          } catch (error) {
            out[name] = { error: error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error) };
          }
        };
        let calendars: { href: string; readOnly: boolean }[] = [];
        let books: { href: string }[] = [];
        await step('calendars', async () => (calendars = await listCalendars(ctx)));
        await step('addressBooks', async () => (books = await listAddressBooks(ctx)));
        const cal = calendars.find((x) => !x.readOnly) ?? calendars[0];
        if (cal) await step('calendarTest', () => roundTrip(ctx, cal.href, 'calendar'));
        if (books[0]) await step('contactTest', () => roundTrip(ctx, books[0].href, 'addressbook'));
        out.trace = ctx.dav.trace;
        return out;
      })
    );
  })
  // --- Calendars
  .get('/calendars', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(await withDav(access, (ctx) => listCalendars(ctx)));
  })
  .post('/calendars', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const name = str(body.name, 'name', { max: 200 });
    const href = await withDav(access, (ctx) => createCalendar(ctx, name, colorOf(body.color)));
    return c.json({ href }, 201);
  })
  .patch('/calendars', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const name = str(body.name, 'name', { max: 200 });
    await withDav(access, (ctx) => updateCalendar(ctx, ctx.resolve(str(body.href, 'href', { max: 1000 }), 'calendars'), name, colorOf(body.color)));
    return c.json({ ok: true });
  })
  .delete('/calendars', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    await withDav(access, async (ctx) => {
      const href = ctx.resolve(str(body.href, 'href', { max: 1000 }), 'calendars');
      if (href === ctx.homes.calendars) throw badRequest('Invalid path', 'invalid_field', { name: 'href' });
      await ctx.dav.remove(href);
    });
    return c.json({ ok: true });
  })

  // --- Events
  .get('/events', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    const from = Date.parse(c.req.query('from') ?? '');
    const to = Date.parse(c.req.query('to') ?? '');
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw badRequest('Invalid range', 'invalid_field', { name: 'range' });
    return c.json(
      await withDav(access, async (ctx) => {
        const wanted = list(c.req.query('calendars'));
        const hrefs = wanted.length ? wanted.map((h) => ctx.resolve(h, 'calendars')) : (await listCalendars(ctx)).map((cal) => cal.href);
        return listEvents(ctx, hrefs, from, to);
      })
    );
  })
  .post('/events', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const input = eventInput(body);
    return c.json(await withDav(access, (ctx) => createEvent(ctx, ctx.resolve(str(body.calendar, 'calendar', { max: 1000 }), 'calendars'), input)), 201);
  })
  .put('/events', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const input = eventInput(body);
    const scope = {
      recurrenceId: str(body.recurrenceId, 'recurrenceId', { optional: true, max: 40 }) || null,
      only: body.scope === 'this',
      occurrenceStart: str(body.occurrenceStart, 'occurrenceStart', { optional: true, max: 40 }) || null,
    };
    return c.json(
      await withDav(access, async (ctx) => {
        let href = ctx.resolve(str(body.href, 'href', { max: 1000 }), 'calendars');
        let etag = etagOf(body.etag);
        const result = await updateEvent(ctx, href, etag, input, scope);
        href = result.href;
        etag = result.etag;
        // Moving to another calendar (whole event only).
        if (typeof body.calendar === 'string' && !scope.only) {
          const target = ctx.resolve(body.calendar, 'calendars');
          if (!href.startsWith(target) || href.slice(target.length).includes('/')) return moveEvent(ctx, href, null, target);
        }
        return result;
      })
    );
  })
  .delete('/events', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const recurrenceId = body.scope === 'this' ? str(body.recurrenceId, 'recurrenceId', { max: 40 }) : null;
    await withDav(access, (ctx) => deleteEvent(ctx, ctx.resolve(str(body.href, 'href', { max: 1000 }), 'calendars'), etagOf(body.etag), recurrenceId));
    return c.json({ ok: true });
  })

  // --- Contacts
  .get('/addressbooks', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(await withDav(access, (ctx) => listAddressBooks(ctx)));
  })
  .get('/contacts', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(
      await withDav(access, async (ctx) => {
        const wanted = list(c.req.query('addressbooks'));
        const hrefs = wanted.length ? wanted.map((h) => ctx.resolve(h, 'contacts')) : (await listAddressBooks(ctx)).map((b) => b.href);
        return listContacts(ctx, hrefs);
      })
    );
  })
  .post('/contacts', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const input = contactInput(body);
    return c.json(await withDav(access, (ctx) => createContact(ctx, ctx.resolve(str(body.addressBook, 'addressBook', { max: 1000 }), 'contacts'), input)), 201);
  })
  .put('/contacts', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const input = contactInput(body);
    return c.json(await withDav(access, (ctx) => updateContact(ctx, ctx.resolve(str(body.href, 'href', { max: 1000 }), 'contacts'), etagOf(body.etag), input)));
  })
  .delete('/contacts', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    await withDav(access, (ctx) => deleteContact(ctx, ctx.resolve(str(body.href, 'href', { max: 1000 }), 'contacts'), etagOf(body.etag)));
    return c.json({ ok: true });
  });
