import { Hono } from 'hono';
import { getSession } from '../auth';

export const authRoutes = new Hono()
  // Who is signed in; null when nobody is.
  .get('/session', async (c) => {
    const session = await getSession(c);
    return c.json(session && { role: session.role, email: session.email, name: session.name });
  })
  // After a profile change in Clerk (name, primary email): re-read it now
  // instead of waiting for the cached copy to expire.
  .post('/refresh', async (c) => {
    const session = await getSession(c, { fresh: true });
    return c.json(session && { role: session.role, email: session.email, name: session.name });
  });
