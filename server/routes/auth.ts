import { Hono } from 'hono';
import { getSession } from '../auth';

export const authRoutes = new Hono()
  // Who is signed in; null when nobody is.
  .get('/session', async (c) => {
    const session = await getSession(c);
    return c.json(session && { role: session.role, email: session.email, name: session.name });
  });
