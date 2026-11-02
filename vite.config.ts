import react from '@vitejs/plugin-react'
import { Readable } from 'node:stream'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Serves /api/agent in development with the same handler the Vercel Function uses, streaming
// the response through so the trace fills in live.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'relay-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/agent', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const { handleAgent } = await server.ssrLoadModule('/src/server/handler.ts')
        const response: Response = await handleAgent(Buffer.concat(chunks).toString('utf8'), 'local', { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL })
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        if (!response.body) return res.end()
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devApi(env)],
    server: { host: '127.0.0.1', port: 5193, strictPort: true },
    preview: { host: '127.0.0.1', port: 4193, strictPort: true },
  }
})
