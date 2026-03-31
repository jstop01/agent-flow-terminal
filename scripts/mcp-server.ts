#!/usr/bin/env node
/**
 * Agent Flow MCP Server
 * Claude Code가 호출하는 MCP 도구를 제공하여 UI와 양방향 통신 구현
 * stdio transport 사용 (Claude Code가 자식 프로세스로 실행)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as http from 'http';

const RELAY_PORT = process.env.AGENT_FLOW_RELAY_PORT || '3001';
const RELAY_BASE = `http://127.0.0.1:${RELAY_PORT}`;

// Helper: HTTP request to relay
function relayRequest(method: string, path: string, body?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, RELAY_BASE);
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    });
    req.on('error', (e) => {
      // Relay not running - return empty/default
      resolve({ commands: [], error: `Relay unavailable: ${e.message}` });
    });
    if (data) req.write(data);
    req.end();
  });
}

const server = new McpServer({
  name: "agent-flow-monitor",
  version: "1.0.0",
});

// Tool 1: check_commands - UI에서 보낸 명령 폴링
server.tool(
  "check_commands",
  "Agent Flow 모니터 UI에서 보낸 명령을 확인합니다. 주기적으로 호출하여 사용자 지시를 수신하세요.",
  { session_id: z.string().describe("현재 Claude Code 세션 ID") },
  async ({ session_id }) => {
    const data = await relayRequest('GET', `/mcp/commands?session=${session_id}`);
    const commands = data.commands || [];
    if (commands.length === 0) {
      return { content: [{ type: "text", text: "대기 중인 명령이 없습니다." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(commands, null, 2) }] };
  }
);

// Tool 2: report_status - Claude 상태 보고
server.tool(
  "report_status",
  "현재 작업 상태를 Agent Flow 모니터 UI에 보고합니다.",
  {
    session_id: z.string().describe("현재 Claude Code 세션 ID"),
    status: z.string().describe("현재 상태 (예: 'working', 'waiting', 'completed')"),
    details: z.string().optional().describe("상세 설명"),
  },
  async ({ session_id, status, details }) => {
    await relayRequest('POST', '/mcp/status', { sessionId: session_id, status, details });
    return { content: [{ type: "text", text: `상태 보고 완료: ${status}` }] };
  }
);

// Tool 3: get_ui_state - UI 상태 조회
server.tool(
  "get_ui_state",
  "Agent Flow 모니터 UI의 현재 상태를 조회합니다 (선택된 에이전트, 열린 패널 등).",
  { session_id: z.string().describe("현재 Claude Code 세션 ID") },
  async ({ session_id }) => {
    const data = await relayRequest('GET', `/mcp/ui-state?session=${session_id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Tool 4: send_notification - UI에 알림 전송
server.tool(
  "send_notification",
  "Agent Flow 모니터 UI에 알림 메시지를 전송합니다.",
  {
    session_id: z.string().describe("현재 Claude Code 세션 ID"),
    title: z.string().describe("알림 제목"),
    message: z.string().describe("알림 내용"),
    level: z.enum(["info", "warn", "error"]).default("info").describe("알림 레벨"),
  },
  async ({ session_id, title, message, level }) => {
    await relayRequest('POST', '/mcp/notification', { sessionId: session_id, title, message, level });
    return { content: [{ type: "text", text: `알림 전송 완료: [${level}] ${title}` }] };
  }
);

// Tool 5: acknowledge_command - 명령 처리 확인
server.tool(
  "acknowledge_command",
  "UI에서 받은 명령의 처리를 확인합니다.",
  {
    session_id: z.string().describe("현재 Claude Code 세션 ID"),
    command_id: z.string().describe("처리한 명령 ID"),
    result: z.string().optional().describe("처리 결과"),
  },
  async ({ session_id, command_id, result }) => {
    await relayRequest('POST', '/mcp/acknowledge', { sessionId: session_id, commandId: command_id, result });
    return { content: [{ type: "text", text: `명령 ${command_id} 처리 확인 완료` }] };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`MCP Server error: ${e}\n`);
  process.exit(1);
});
