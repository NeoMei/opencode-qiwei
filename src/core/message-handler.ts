/**
 * 消息处理器 — 企微消息 ↔ OpenCode 流式回复
 */

import type { WsFrame, TextMessage, ImageMessage, MixedMessage, WSClient } from '@wecom/aibot-node-sdk';
import type { WecomConfig } from './types.js';
import { SessionManager } from './session-manager.js';
import { OpenCodeClient } from '../opencode/client.js';
import { createLogger } from './logger.js';

const log = createLogger('MessageHandler');

export class MessageHandler {
  /** 挂起的流式回调：sessionId → { frame, streamId, lastContent } */
  private streams = new Map<string, { frame: WsFrame<any>; streamId: string; lastContent: string }>();

  constructor(
    private config: WecomConfig,
    private sessionManager: SessionManager,
    private wsClient: WSClient,
    private opencode: OpenCodeClient,
  ) {}

  /** 处理文本消息 */
  async handleMessage(frame: WsFrame<TextMessage>) {
    const msg = frame.body!;
    const chatId = msg.chatid || msg.from.userid;
    const chatType: ('single' | 'group') = (msg.chattype as any) || 'single';
    const text = msg.text?.content || '';

    if (!text.trim()) return;
    log.info(`📩 ${chatId}(${chatType}): "${text.slice(0, 80)}"`);

    if (this.sessionManager.isBusy(chatId)) {
      log.info(`⏳ ${chatId} 忙碌中`);
      return;
    }

    const session = this.sessionManager.getOrCreate(chatId, chatType);
    this.sessionManager.setStatus(chatId, 'busy');

    // 创建 OpenCode 会话（如果还没有）
    if (!session.opencodeId) {
      try {
        const oc = await this.opencode.createSession(`企微-${chatId.slice(0, 8)}`);
        session.opencodeId = oc.id;
      } catch (err) {
        log.error('创建 OpenCode 会话失败', { err });
        await this.wsClient.replyStream(frame, `e_${Date.now()}`, '服务暂时不可用，请稍后再试 😢', true);
        this.sessionManager.setStatus(chatId, 'idle');
        return;
      }
    }

    try {
      // 流式 ID
      const streamId = `s_${Date.now()}`;
      this.streams.set(session.id, { frame, streamId, lastContent: '' });

      // 发送 prompt 到 OpenCode（流式输出由 event-handler 处理）
      await this.opencode.sendPrompt(session.opencodeId, text);
    } catch (err) {
      log.error('消息处理失败', { err });
      await this.wsClient.replyStream(frame, `e_${Date.now()}`, '抱歉，处理出错了 😢', true);
      this.streams.delete(session.id);
      this.sessionManager.setStatus(chatId, 'idle');
    }
  }

  /** 流式推送文本增量到企微 */
  async pushStreamDelta(sessionId: string, delta: string) {
    const stream = this.streams.get(sessionId);
    if (!stream) return;

    stream.lastContent += delta;

    // 截断过长内容
    const content = stream.lastContent.length > 20000
      ? stream.lastContent.slice(-20000)
      : stream.lastContent;

    try {
      await this.wsClient.replyStream(stream.frame, stream.streamId, content, false);
    } catch (err) {
      log.debug('流式推送跳过', { err });
    }
  }

  /** 流式结束 */
  async finishStream(sessionId: string) {
    const stream = this.streams.get(sessionId);
    if (!stream) return;

    const content = stream.lastContent || '（无回复）';
    try {
      await this.wsClient.replyStream(stream.frame, stream.streamId, content, true);
      log.info(`✅ 流式完成: ${content.length} 字`);
    } catch (err) {
      log.error('流式结束失败', { err });
    }

    this.streams.delete(sessionId);
    const session = this.sessionManager.getSession(sessionId);
    if (session) this.sessionManager.setStatus(session.chatId, 'idle');
  }

  /** 处理图片消息 */
  async handleImageMessage(frame: WsFrame<ImageMessage>) {
    const msg = frame.body!;
    const chatId = msg.chatid || msg.from.userid;
    const chatType: ('single' | 'group') = (msg.chattype as any) || 'single';
    log.info(`🖼️ ${chatId}: 收到图片`);
    // 图片暂不支持，回复提示
    await this.wsClient.replyStream(frame, `e_${Date.now()}`, '点点看到图片啦～但现在只能读文字哦 💕', true);
  }

  /** 处理图文混排消息 */
  async handleMixedMessage(frame: WsFrame<MixedMessage>) {
    const msg = frame.body!;
    const items = msg.mixed?.msg_item || [];
    const textParts = items.filter(i => i.msgtype === 'text').map(i => i.text?.content || '').join(' ');
    // 提取文本部分，当作普通文本处理
  }

  /** 进入会话事件 */
  async handleEnterChat(frame: WsFrame<any>) {
    const event = frame.body!;
    const chatId = event.chatid || event.from?.userid;
    log.info(`👋 进入会话: ${chatId}`);

    await this.wsClient.replyWelcome(frame, {
      msgtype: 'text',
      text: { content: '你好～我是点点 💕 有什么可以帮你的？' },
    });
  }

  /** 模板卡片事件 */
  async handleCardEvent(frame: WsFrame<any>) {
    const event = frame.body?.event;
    log.info(`🃏 卡片事件: ${event?.event_key || 'unknown'}`);
  }
}
