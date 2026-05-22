/**
 * 消息处理器
 * 处理企微消息 → 调用 OpenCode → 流式回复
 */

import type { WsFrame, TextMessage, ImageMessage, MixedMessage, WSClient } from '@wecom/aibot-node-sdk';
import type { WecomConfig } from './types.js';
import { SessionManager } from './session-manager.js';
import { OpenCodeClient } from '../opencode/client.js';
import { createLogger } from './logger.js';

const log = createLogger('MessageHandler');

export class MessageHandler {
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
    const chatType: 'single' | 'group' = msg.chattype || 'single';
    const text = msg.text?.content || '';

    log.info(`消息: ${chatId} (${chatType}): ${text.slice(0, 100)}`);

    if (!text.trim()) return;

    // 群聊里需要 @ 才回复
    if (this.config.requireMention && chatType === 'group') {
      // TODO: 检查是否 @ 了机器人
    }

    if (this.sessionManager.isBusy(chatId)) {
      log.info(`会话 ${chatId} 忙碌中，跳过`);
      return;
    }

    const session = this.sessionManager.getOrCreate(chatId, chatType);
    this.sessionManager.setStatus(chatId, 'busy');

    try {
      // 发送 prompt 到 OpenCode
      await this.opencode.sendPrompt(session.id, text);

      // 流式回复
      const streamId = `s_${Date.now()}`;
      this.sessionManager.setStreamId(chatId, streamId);

      // 发送"思考中"提示
      await this.wsClient.replyStream(frame, streamId, '思考中...', false);

      // OpenCode 的 SSE 事件会通过 event-handler 处理流式输出
    } catch (err) {
      log.error('消息处理失败', { err });
      await this.wsClient.replyStream(frame, `s_${Date.now()}`, '抱歉，处理出错了，请稍后再试 😢', true);
    } finally {
      this.sessionManager.setStatus(chatId, 'idle');
    }
  }

  /** 处理图片消息 */
  async handleImageMessage(_frame: WsFrame<ImageMessage>) {
    // await this.wsClient.replyStream(frame, streamId, '点点看到了图片～但我现在只能读文字哦', true);
  }

  /** 处理图文混排消息 */
  async handleMixedMessage(_frame: WsFrame<MixedMessage>) {
    // 提取文本部分处理
  }

  /** 进入会话事件 */
  async handleEnterChat(frame: WsFrame<any>) {
    const event = frame.body!;
    const chatId = event.chatid || event.from?.userid;
    log.info(`进入会话: ${chatId}`);
    // 发送欢迎语
    await this.wsClient.replyWelcome(frame, {
      msgtype: 'text',
      text: { content: '你好～我是点点 💕 有什么可以帮你的？' },
    });
  }

  /** 模板卡片事件 */
  async handleCardEvent(frame: WsFrame<any>) {
    log.info(`卡片事件: ${frame.body?.event?.event_key}`);
    // 处理卡片按钮点击
  }
}
