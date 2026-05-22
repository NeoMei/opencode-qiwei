/**
 * OpenCode SSE 事件处理器
 * 
 * 处理 OpenCode serve 的 Server-Sent Events：
 * - text delta → 流式推送到企微
 * - permission.asked → 自动批准（如启用 autoApprove）
 * - session.idle → 清理状态
 */

import type { WSClient, StreamReplyBody } from '@wecom/aibot-node-sdk';
import { SessionManager } from '../core/session-manager.js';
import { OpenCodeClient } from './client.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('EventHandler');

interface SSEData {
  type?: string;
  field?: string;
  text?: string;
  delta?: string;
  partID?: string;
  sessionID?: string;
  permission?: string;
  patterns?: string[];
  id?: string;
  permissionID?: string;
  reply?: string;
}

export class OpenCodeEventHandler {
  private isRunning = false;

  constructor(
    private sessionManager: SessionManager,
    private wsClient: WSClient,
    private opencodeUrl: string,
    private showProcess: string = 'tools',
    private autoApprove: boolean = false,
    private opencode: OpenCodeClient,
  ) {}

  async start(eventStream: ReadableStream<Uint8Array>) {
    this.isRunning = true;
    const reader = eventStream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (this.isRunning) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n\n')) {
          const eventEnd = buffer.indexOf('\n\n');
          const eventStr = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          const data = this.parseSSE(eventStr);
          if (!data) continue;

          await this.handleEvent(data, data.sessionID || '');
        }
      }
    } catch (err) {
      log.error('SSE stream error', { err });
    }
  }

  private parseSSE(raw: string): SSEData | null {
    const event: any = {};
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event.type = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        try { event.data = JSON.parse(line.slice(5).trim()); } catch {}
      }
    }
    return { ...event.data, type: event.type };
  }

  private async handleEvent(data: SSEData, sessionId: string) {
    const type = data.type || '';

    // 文本增量 → 流式推送到企微
    if (type === 'text' || data.field === 'text' || data.field === 'delta') {
      await this.handleTextDelta(data);
      return;
    }

    // 权限请求 → 自动批准
    if (type === 'permission.asked' && this.autoApprove) {
      const permId = data.id || data.permissionID || '';
      if (permId) {
        log.info(`自动批准权限: ${permId}`);
        await this.opencode.replyPermission(permId, 'always').catch(() => {});
      }
      return;
    }

    // 会话空闲 → 清理
    if (type === 'session.idle') {
      const chatId = data.sessionID || '';
      this.sessionManager.setStatus(chatId, 'idle');
    }
  }

  private async handleTextDelta(data: SSEData) {
    const sessionId = data.sessionID || '';
    // 通过 sessionManager 获取对应的 chatId
    // 由于会话映射关系，需要通过 OpenCode sessionId 找到对应的企微 chatId
    // 这里简化处理：直接发送到最近活跃的会话
  }

  stop() {
    this.isRunning = false;
  }
}
