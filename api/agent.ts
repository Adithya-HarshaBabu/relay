import { handleAgent } from '../src/server/handler.js'

// Vercel Function (Node.js runtime): POST /api/agent
export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  return handleAgent(await request.text(), ip, { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL })
}
