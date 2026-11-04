import { serve } from '@hono/node-server';
import { createApp } from './app';
import { config } from './config';
import { getDb } from './db';

getDb();
const server = serve({ fetch: createApp().fetch, port: config.port }, (info) => {
  console.log(`purelymail-manager listening on :${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    getDb().close();
    process.exit(0);
  });
}
