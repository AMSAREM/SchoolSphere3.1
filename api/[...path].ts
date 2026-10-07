process.env.VERCEL = '1';

let serverModPromise: Promise<any> | null = null;

async function getServerModule() {
  if (!serverModPromise) {
    const bundlePath = './_serverBundle.mjs';
    serverModPromise = import(/* @vite-ignore */ bundlePath).catch(() => import('../server'));
  }
  return serverModPromise;
}

export default async function handler(req: any, res: any) {
  const { app, startServer } = await getServerModule();
  await startServer();
  return app(req, res);
}
