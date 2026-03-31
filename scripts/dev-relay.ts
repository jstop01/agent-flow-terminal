#!/usr/bin/env node
/**
 * Dev relay server — wraps the shared relay with a standalone HTTP server
 * that includes CORS headers for cross-origin dev mode (Next.js on :3000).
 */
import * as http from 'http'
import { execFile } from 'child_process'
import { createRelay, handleMcpRequest } from './relay'
import { DEFAULT_RELAY_PORT, DEV_WEB_ORIGIN } from '../extension/src/constants'

// ─── Claude CLI wrapper ─────────────────────────────────────────────────────

const CLAUDE_PATH = process.env.CLAUDE_PATH || '/Users/jaeseok/.local/bin/claude'

function handleCliSend(req: http.IncomingMessage, res: http.ServerResponse, body: any) {
  const { sessionId, message, cwd } = body as { sessionId?: string; message?: string; cwd?: string }

  if (!message) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'message is required' }))
    return
  }

  const args = ['-p', message]
  if (sessionId) args.unshift('-r', sessionId)

  console.log(`[cli] Sending to session ${sessionId || 'new'}: ${message.slice(0, 50)}...`)

  const child = execFile(CLAUDE_PATH, args, {
    cwd: cwd || process.env.HOME,
    timeout: 300000, // 5분 타임아웃
    maxBuffer: 10 * 1024 * 1024, // 10MB
  }, (error, stdout, stderr) => {
    if (error) {
      console.log(`[cli] Error: ${error.message}`)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message, stderr }))
      return
    }
    console.log(`[cli] Response received (${stdout.length} chars)`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ response: stdout, sessionId }))
  })
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) { resolve({}); return }
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

async function main() {
  const workspace = process.argv[2] || require('os').homedir()

  console.log('Starting Agent Flow dev relay...\n')
  console.log(`Workspace: ${workspace}`)

  const relay = await createRelay({ workspace, verbose: true })

  const server = http.createServer((req, res) => {
    const isMcp = req.url?.startsWith('/mcp/')
    const isCli = req.url?.startsWith('/cli/')

    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', (isMcp || isCli) ? 'GET, POST, OPTIONS' : 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url === '/events') {
      return relay.handleSSE(req, res)
    }

    // Claude CLI 래핑 엔드포인트
    if (req.url === '/cli/send' && req.method === 'POST') {
      parseBody(req).then(body => {
        handleCliSend(req, res, body)
      }).catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      })
      return
    }

    if (isMcp) {
      if (req.method === 'POST') {
        parseBody(req).then(body => {
          handleMcpRequest(req, res, body)
        }).catch(() => {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        })
      } else {
        handleMcpRequest(req, res)
      }
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Agent Flow Dev Relay')
  })

  server.listen(DEFAULT_RELAY_PORT, '127.0.0.1', () => {
    console.log(`\nSSE relay on http://127.0.0.1:${DEFAULT_RELAY_PORT}/events`)
    console.log('Ready! Events will appear in the web app.')
  })

  function cleanup() {
    server.close()
    relay.dispose()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main().catch(e => {
  console.error('Failed to start dev relay:', e)
  process.exit(1)
})
