/**
 * OpenCode SDK 封装
 * 通过 HTTP API 与 OpenCode serve 通信
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('OpenCodeClient');

interface OpenCodeClientOptions {
  baseUrl: string;
}

export class OpenCodeClient {
  private baseUrl: string;

  constructor(options: OpenCodeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
  }

  /** 创建 session */
  async createSession(title?: string): Promise<{ id: string }> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || '企微会话' }),
    });
    return res.json();
  }

  /** 发送 prompt */
  async sendPrompt(sessionId: string, text: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text }] }),
    });
    return res.json();
  }

  /** 列出 sessions */
  async listSessions(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/sessions`);
    return res.json();
  }

  /** 订阅 SSE 事件 */
  async subscribeEvents(): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(`${this.baseUrl}/session/events`, {
      headers: { Accept: 'text/event-stream' },
    });
    if (!res.ok || !res.body) throw new Error('SSE connection failed');
    return res.body;
  }

  /** 批准权限 */
  async replyPermission(permId: string, reply: 'once' | 'always' | 'reject'): Promise<void> {
    const res = await fetch(`${this.baseUrl}/permission/${permId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    });
    if (!res.ok) throw new Error(`Permission reply failed: ${res.status}`);
  }
}
