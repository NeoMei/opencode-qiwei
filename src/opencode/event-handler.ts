/**
 * OpenCode SSE 事件处理器
 *
 * 解析 OpenCode serve 的 SSE 流，桥接到企微：
 * - text delta → MessageHandler.pushStreamDelta()
 * - step-finish → MessageHandler.finishStream()
 * - permission.asked → 通知用户（或自动批准）
 * - question.asked → 通知用户等待回复
 */

import { SessionManager } from '../core/session-manager.js';
import { MessageHandler } from '../core/message-handler.js';
import { OpenCodeClient } from './client.js';
import { createLogger } from '../core/logger.js';
import type { PendingInteraction } from '../core/types.js';

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

    // 权限请求
    if (evt.type === 'permission.asked' || evt.type === 'permission.updated') {
      const permId = evt.id || evt.permissionID || '';
      const session = this.sessionManager.getByOpenCodeId(evt.sessionID || '');

      if (this.autoApprove && permId) {
        log.info(`自动批准: ${permId}`);
        this.opencode.replyPermission(permId, 'always').catch(() => {});
        return;
      }

      if (session) {
        const interaction: PendingInteraction = {
          kind: 'permission',
          data: {
            id: permId,
            permission: evt.permission || evt.type || 'unknown',
            patterns: evt.patterns || (evt.pattern ? [evt.pattern] : []),
            title: evt.title || `${evt.permission}: ${(evt.patterns || []).join(', ')}`,
          },
        };
        this.sessionManager.setPendingInteraction(session.chatId, interaction);
        await this.messageHandler.notifyPending(session.chatId,
          `🔐 权限请求：${interaction.data.title}\n\n` +
          `请回复「确认」授权一次，或「始终」永久授权，或「拒绝」拒绝该请求。`
        );
      }
      return;
    }

    // 权限已回复
    if (evt.type === 'permission.replied') {
      const session = this.sessionManager.getByOpenCodeId(evt.sessionID || '');
      if (session) {
        this.sessionManager.clearPendingInteraction(session.chatId);
      }
      return;
    }

    // 问题提问
    if (evt.type === 'question.asked') {
      const session = this.sessionManager.getByOpenCodeId(evt.sessionID || '');
      if (!session) return;

      const rawQuestions = evt.questions || [];
      const questions = rawQuestions.map((q: any) => ({
        question: q.question || '',
        header: q.header || q.question?.substring(0, 30) || '',
        options: (q.options || []).map((o: any) => ({
          label: o.label || '',
          description: o.description || '',
        })),
        multiple: !!q.multiple,
        custom: q.custom !== false,
      }));

      const interaction: PendingInteraction = {
        kind: 'question',
        data: {
          id: evt.id || evt.requestID || '',
          questions,
        },
      };

      this.sessionManager.setPendingInteraction(session.chatId, interaction);

      // 构建提示文本
      let prompt = '❓ 需要你提供信息：\n\n';
      for (const [idx, q] of questions.entries()) {
        prompt += `${idx + 1}. ${q.question}\n`;
        if (q.options.length > 0) {
          prompt += '选项：' + q.options.map((o: { label: string }, i: number) => `${i + 1}.${o.label}`).join(' ') + '\n';
        }
        if (q.custom) {
          prompt += '(也支持直接回复文字)\n';
        }
        prompt += '\n';
      }
      prompt += '请直接回复对应选项编号或内容。';

      await this.messageHandler.notifyPending(session.chatId, prompt);
      return;
    }

    // 问题已回复
    if (evt.type === 'question.replied' || evt.type === 'question.rejected') {
      const session = this.sessionManager.getByOpenCodeId(evt.sessionID || '');
      if (session) {
        this.sessionManager.clearPendingInteraction(session.chatId);
      }
      return;
    }
  }

  stop() {
    this.isRunning = false;
  }
}
