#!/usr/bin/env node
/**
 * Builds the MCP server by bundling scripts/mcp-server.ts into a single CJS file.
 * All dependencies (including @modelcontextprotocol/sdk and zod) are bundled in;
 * only Node.js built-ins are kept external.
 */
'use strict'

const esbuild = require('esbuild')
const path = require('path')

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'mcp-server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: path.join(__dirname, '.mcp-server.js'),
  sourcemap: true,
  logLevel: 'warning',
})
