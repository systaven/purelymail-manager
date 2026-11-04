import { serve } from '@hono/node-server';
import { createApp } from './app';
import { config } from './config';
import { getDb } from './db';
import { closeAll } from './mail/pool';
import { startOutbox } from './mail/send';

getDb();
startOutbox();
const server = serve({ fetch: createApp().fetch, port: config.port }, (info) => {
  console.log(`purelymail-manager listening on :${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    closeAll();
    getDb().close();
    process.exit(0);
  });
}
