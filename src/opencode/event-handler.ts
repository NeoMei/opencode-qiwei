/**
 * OpenCode SSE 事件处理器
 * 
 * 解析 OpenCode serve 的 SSE 流，桥接到企微：
 * - text delta → MessageHandler.pushStreamDelta()
 * - step-finish → MessageHandler.finishStream()
 * - permission.asked → 自动批准
 */

import { SessionManager } from '../core/session-manager.js';
import { MessageHandler } from '../core/message-handler.js';
import { OpenCodeClient } from './client.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('EventHandler');

export class OpenCodeEventHandler {
  private isRunning = false;

  constructor(
    private sessionManager: SessionManager,
    private messageHandler: MessageHandler,
    private opencodeUrl: string,
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
          const idx = buffer.indexOf('\n\n');
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          await this.processEvent(raw);
        }
      }
    } catch (err) {
      log.error('SSE error', { err });
    }
  }

  private async processEvent(raw: string) {
    let type = '';
    let data: any = {};

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      if (line.startsWith('data:')) {
        try { data = JSON.parse(line.slice(5).trim()); } catch {}
      }
    }

    // 合并顶层字段
    const evt = { ...data, type: type || data.type };

    // 文本增量
    if (evt.type === 'text' || evt.field === 'text') {
      const delta = evt.text || evt.delta || '';
      if (delta) {
        const session = this.sessionManager.getByOpenCodeId(evt.sessionID || '');
        if (session) await this.messageHandler.pushStreamDelta(session.id, delta);
      }
      return;
    }

    // 流式结束
    if (evt.type === 'step-finish' || evt.reason === 'stop') {
      const session = this.sessionManager.getByOpenCodeId(evt.sessionID || '');
      if (session) await this.messageHandler.finishStream(session.id);
      return;
    }

    // 权限请求 → 自动批准
    if ((evt.type === 'permission.asked' || evt.type === 'permission.updated') && this.autoApprove) {
      const permId = evt.id || evt.permissionID || '';
      if (permId) {
        log.info(`自动批准: ${permId}`);
        this.opencode.replyPermission(permId, 'always').catch(() => {});
      }
      return;
    }
  }

  stop() {
    this.isRunning = false;
  }
}
