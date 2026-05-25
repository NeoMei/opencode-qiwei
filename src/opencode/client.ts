/**
 * OpenCode SDK 封装
 * 通过 HTTP API 与 OpenCode serve 通信
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('OpenCodeClient');

interface OpenCodeClientOptions {
  baseUrl: string;
  timeout?: number;
}

/** 带 timeout 的 fetch 包装 */
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export class OpenCodeClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options: OpenCodeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeout = options.timeout || 30000;
  }

  /** 创建 session */
  async createSession(title?: string): Promise<{ id: string }> {
    const res = await fetchWithTimeout(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || '企微会话' }),
      timeout: this.timeout,
    });
    if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
    return res.json();
  }

  /** 发送 prompt */
  async sendPrompt(sessionId: string, text: string): Promise<any> {
    const res = await fetchWithTimeout(`${this.baseUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text }] }),
      timeout: 120000, // 发送消息可能需要更长时间
    });
    if (!res.ok) throw new Error(`sendPrompt failed: ${res.status}`);
    return res.json();
  }

  /** 列出 sessions */
  async listSessions(): Promise<any[]> {
    const res = await fetchWithTimeout(`${this.baseUrl}/session`, { timeout: this.timeout });
    if (!res.ok) throw new Error(`listSessions failed: ${res.status}`);
    return res.json();
  }

  /** 订阅 SSE 事件 */
  async subscribeEvents(): Promise<ReadableStream<Uint8Array>> {
    const res = await fetchWithTimeout(`${this.baseUrl}/global/event`, {
      headers: { Accept: 'text/event-stream' },
      timeout: this.timeout,
    });
    if (!res.ok || !res.body) throw new Error('SSE connection failed');
    return res.body;
  }

  /** 批准权限 */
  async replyPermission(permId: string, reply: 'once' | 'always' | 'reject'): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/permission/${permId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
      timeout: this.timeout,
    });
    if (!res.ok) throw new Error(`Permission reply failed: ${res.status}`);
  }

  /** 回复问题 */
  async replyQuestion(requestID: string, answers: string[][]): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/question/${requestID}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
      timeout: this.timeout,
    });
    if (!res.ok) throw new Error(`Question reply failed: ${res.status}`);
  }
}
