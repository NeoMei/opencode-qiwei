/**
 * 消息处理器 — 企微消息 ↔ OpenCode 流式回复
 */

import type { WsFrame, TextMessage, ImageMessage, MixedMessage, WSClient } from '@wecom/aibot-node-sdk';
import type { WecomConfig, PendingInteraction } from './types.js';
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

    const session = this.sessionManager.getByChatId(chatId);

    // 如果有挂起的交互（question/permission），优先尝试作为回复处理
    if (session?.pendingInteraction) {
      const handled = await this.handleInteractionReply(chatId, text.trim(), session.pendingInteraction);
      if (handled) return;
      // 不是有效回复格式，提示用户先处理交互
      await this.wsClient.replyStream(frame, `e_${Date.now()}`,
        session.pendingInteraction.kind === 'permission'
          ? '⏳ 请先处理上方的权限请求（回复「确认」/「始终」/「拒绝」），或等待当前任务完成。'
          : '⏳ 请先回复上方的提问，或等待当前任务完成。',
        true
      );
      return;
    }

    // 检查是否忙碌（排除有挂起交互的情况）
    if (this.sessionManager.isBusy(chatId)) {
      log.info(`⏳ ${chatId} 忙碌中`);
      await this.wsClient.replyStream(frame, `e_${Date.now()}`, '⏳ 正在处理上一条消息，请稍候...', true);
      return;
    }

    const newSession = this.sessionManager.getOrCreate(chatId, chatType);
    this.sessionManager.setStatus(chatId, 'busy');

    // 创建 OpenCode 会话（如果还没有）
    if (!newSession.opencodeId) {
      try {
        const oc = await this.opencode.createSession(`企微-${chatId.slice(0, 8)}`);
        newSession.opencodeId = oc.id;
        this.sessionManager.setOpenCodeId(newSession.id, oc.id);
      } catch (err) {
        log.error('创建 OpenCode 会话失败', { err });
        await this.wsClient.replyStream(frame, `e_${Date.now()}`, '服务暂时不可用，请稍后再试 😢', true);
        this.sessionManager.setStatus(chatId, 'idle');
        return;
      }
    }

    try {
      const streamId = `s_${Date.now()}`;
      await this.wsClient.replyStream(frame, streamId, '...', false);

      // 调用 OpenCode API 并等待同步回复
      const response = await this.opencode.sendPrompt(newSession.opencodeId!, text);
      const reply = response?.parts?.find((p: any) => p.type === 'text')?.text || '';
      
      if (reply) {
        await this.wsClient.replyStream(frame, streamId, reply, true);
      } else {
        await this.wsClient.replyStream(frame, streamId, '抱歉，处理出错了 😢', true);
      }
    } catch (err) {
      log.error('消息处理失败', { err });
      await this.wsClient.replyStream(frame, `e_${Date.now()}`, '抱歉，处理出错了 😢', true);
      this.streams.delete(newSession.id);
      this.sessionManager.setStatus(chatId, 'idle');
    }
  }

  /**
   * 尝试将用户消息解析为挂起交互的回复。
   * 返回 true 表示已处理。
   */
  private async handleInteractionReply(
    chatId: string,
    text: string,
    interaction: PendingInteraction,
  ): Promise<boolean> {
    try {
      if (interaction.kind === 'permission') {
        const perm = interaction.data;
        let reply: 'once' | 'always' | 'reject' | undefined;

        if (text === '确认' || text === '同意' || text === '允许' || text === 'yes' || text === 'y') {
          reply = 'once';
        } else if (text === '始终' || text === '总是' || text === 'always') {
          reply = 'always';
        } else if (text === '拒绝' || text === '否' || text === '不同意' || text === 'no' || text === 'n') {
          reply = 'reject';
        }

        if (!reply) return false;

        log.info('Replying to permission via text', { chatId, permissionId: perm.id, reply });
        await this.opencode.replyPermission(perm.id, reply);
        this.sessionManager.clearPendingInteraction(chatId);
        this.sessionManager.setStatus(chatId, 'busy'); // AI 会继续输出

        // 发送确认给用户
        const stream = this.streams.get(this.sessionManager.getByChatId(chatId)?.id || '');
        const confirmText = reply === 'reject'
          ? '已拒绝该权限请求。'
          : reply === 'always'
            ? '已永久授权该权限。'
            : '已授权一次该权限。';
        if (stream) {
          await this.wsClient.replyStream(stream.frame, `e_${Date.now()}`, confirmText, true);
        }
        return true;
      }

      if (interaction.kind === 'question') {
        const q = interaction.data;
        // 解析答案：逗号、空格或换行分隔的序号/标签
        const selections = text.split(/[,，\s]+/).filter(s => s.length > 0);
        if (selections.length === 0) return false;

        const answers: string[][] = [];
        for (const [qIdx, question] of q.questions.entries()) {
          const answer: string[] = [];
          for (const sel of selections) {
            // 尝试数字序号
            const idx = parseInt(sel, 10);
            if (!isNaN(idx) && idx >= 1 && idx <= question.options.length) {
              answer.push(question.options[idx - 1].label);
            } else {
              // 尝试匹配标签
              const match = question.options.find(o =>
                o.label === sel || o.label.toLowerCase() === sel.toLowerCase(),
              );
              if (match) answer.push(match.label);
            }
          }
          // 去重
          const unique = [...new Set(answer)];
          if (unique.length > 0) {
            answers.push(unique);
          } else if (qIdx < q.questions.length - 1) {
            answers.push([]);
          }
        }

        // 如果问题允许自定义输入且没有匹配到选项，将整个文本作为答案
        const hasCustom = q.questions.some(q => q.custom);
        if ((answers.length === 0 || answers.every(a => a.length === 0)) && hasCustom) {
          answers.push([text.trim()]);
        }

        if (answers.length === 0 || answers.every(a => a.length === 0)) {
          return false;
        }

        log.info('Replying to question via text', { chatId, requestId: q.id, answers });
        await this.opencode.replyQuestion(q.id, answers);
        this.sessionManager.clearPendingInteraction(chatId);
        this.sessionManager.setStatus(chatId, 'busy'); // AI 会继续输出

        const label = answers.map(a => a.join(', ')).join('; ');
        const stream = this.streams.get(this.sessionManager.getByChatId(chatId)?.id || '');
        if (stream) {
          await this.wsClient.replyStream(stream.frame, `e_${Date.now()}`, `已提交：${label}`, true);
        }
        return true;
      }

      return false;
    } catch (err) {
      log.error('Failed to handle interaction reply', { err, chatId, interactionKind: interaction.kind });
      this.sessionManager.clearPendingInteraction(chatId);
      return false;
    }
  }

  /** 通知用户有挂起的交互（由 EventHandler 调用） */
  async notifyPending(chatId: string, message: string): Promise<void> {
    const session = this.sessionManager.getByChatId(chatId);
    if (!session) return;

    // 复用当前 stream 的 frame，如果没有则找一个
    let frame = this.streams.get(session.id)?.frame;
    if (!frame) {
      // 没有活跃流，创建一个最小 frame 用于回复
      // 注意：企微 SDK 可能不支持没有原始 frame 的回复，这里仅作兜底
      log.warn('No active stream frame for notifyPending, message may not be delivered');
      return;
    }

    try {
      await this.wsClient.replyStream(frame, `e_${Date.now()}`, message, true);
    } catch (err) {
      log.error('Failed to send pending notification', { err });
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
