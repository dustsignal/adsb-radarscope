// ADSB Radarscope
// Author: dustsignal
// GitHub: https://github.com/dustsignal/adsb-radarscope
//
// ---------------------------------------------------------------------------
// vite.config.ts — Vite build & dev-server configuration
//
// React plugin, dev server (port 3000), ES-module workers, and production build/
// output settings. Edit to change build behavior or dev-server options. Drives
// `npm run dev` and `npm run build`.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: vite-config @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const LOCAL_PROXY_PATH = '/__adsb_proxy';
const PROXY_MAX_BYTES = 32 * 1024 * 1024;

type NextMiddleware = (error?: unknown) => void;

function sendProxyResponse(
  response: ServerResponse,
  status: number,
  body: Uint8Array,
  contentType: string,
): void {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', body.byteLength);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(body);
}

function sendProxyError(response: ServerResponse, status: number, message: string): void {
  const body = new TextEncoder().encode(JSON.stringify({ error: message }));
  sendProxyResponse(response, status, body, 'application/json; charset=utf-8');
}

async function localFeedProxy(
  request: IncomingMessage,
  response: ServerResponse,
  next: NextMiddleware,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (requestUrl.pathname !== LOCAL_PROXY_PATH) {
    next();
    return;
  }

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    response.setHeader('Content-Length', '0');
    response.end();
    return;
  }
  if (request.method !== 'GET') {
    sendProxyError(response, 405, 'Only GET requests are supported.');
    return;
  }

  const targetValue = requestUrl.searchParams.getAll('url');
  if (targetValue.length !== 1 || !targetValue[0]) {
    sendProxyError(response, 400, 'A single non-empty url parameter is required.');
    return;
  }

  let target: URL;
  try {
    target = new URL(targetValue[0]);
  } catch {
    sendProxyError(response, 400, 'The feed URL is invalid.');
    return;
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    sendProxyError(response, 400, 'Only absolute HTTP or HTTPS feed URLs are allowed.');
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
        'User-Agent': 'ADSB-Radarscope-Local/1.0',
      },
      signal: AbortSignal.timeout(20_000),
    });
    const declaredLength = Number(upstream.headers.get('content-length') ?? '0');
    if (declaredLength > PROXY_MAX_BYTES) {
      sendProxyError(response, 502, 'The feed response exceeds the 32 MiB safety limit.');
      return;
    }
    const body = new Uint8Array(await upstream.arrayBuffer());
    if (body.byteLength > PROXY_MAX_BYTES) {
      sendProxyError(response, 502, 'The feed response exceeds the 32 MiB safety limit.');
      return;
    }
    sendProxyResponse(
      response,
      upstream.status,
      body,
      upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    sendProxyError(response, 502, `Could not reach ADS-B feed: ${detail}`);
  }
}

function localFeedProxyPlugin(): Plugin {
  return {
    name: 'adsb-local-feed-proxy',
    configureServer(server) {
      server.middlewares.use(localFeedProxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use(localFeedProxy);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), localFeedProxyPlugin()],
  esbuild: {
    legalComments: 'none',
  },
  server: {
    port: 3000,
    open: true
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
