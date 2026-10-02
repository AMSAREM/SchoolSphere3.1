import { app, startServer } from '../server.ts';

process.env.VERCEL = '1';

export default async function handler(req: any, res: any) {
  await startServer();
  return app(req, res);
}
