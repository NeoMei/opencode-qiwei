/**
 * 会话管理
 * 维护企业微信 chatId ↔ OpenCode sessionId 的映射
 */

import type { WsFrame, BaseMessage } from '@wecom/aibot-node-sdk';
import { createLogger } from './logger.js';

const log = createLogger('SessionManager');

interface Session {
  id: string;
  chatId: string;
  chatType: 'single' | 'group';
  status: 'idle' | 'busy';
  currentStreamId?: string;
  lastActivity: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private chatToSession = new Map<string, string>();

  /** 获取或创建 session */
  getOrCreate(chatId: string, chatType: 'single' | 'group'): Session {
    const existing = this.chatToSession.get(chatId);
    if (existing) {
      const session = this.sessions.get(existing)!;
      session.lastActivity = Date.now();
      return session;
    }

    const id = `qiwei_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = {
      id,
      chatId,
      chatType,
      status: 'idle',
      lastActivity: Date.now(),
    };

    this.sessions.set(id, session);
    this.chatToSession.set(chatId, id);
    log.info(`创建会话: ${id} → ${chatId} (${chatType})`);
    return session;
  }

  getByChatId(chatId: string): Session | undefined {
    const id = this.chatToSession.get(chatId);
    return id ? this.sessions.get(id) : undefined;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  setStreamId(chatId: string, streamId: string) {
    const session = this.getByChatId(chatId);
    if (session) session.currentStreamId = streamId;
  }

  getStreamId(chatId: string): string | undefined {
    return this.getByChatId(chatId)?.currentStreamId;
  }

  setStatus(chatId: string, status: 'idle' | 'busy') {
    const session = this.getByChatId(chatId);
    if (session) session.status = status;
  }

  isBusy(chatId: string): boolean {
    return this.getByChatId(chatId)?.status === 'busy';
  }
}
