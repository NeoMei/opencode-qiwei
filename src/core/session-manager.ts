/**
 * 会话管理
 * 维护企微 chatId ↔ OpenCode sessionId 映射 + 流式状态
 */

import { createLogger } from './logger.js';
import type { PendingInteraction } from './types.js';

const log = createLogger('SessionManager');

interface Session {
  id: string;
  opencodeId?: string;
  chatId: string;
  chatType: 'single' | 'group';
  status: 'idle' | 'busy';
  lastActivity: number;
  pendingInteraction?: PendingInteraction;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private chatToSession = new Map<string, string>();  // chatId → sessionId
  private opencodeToSession = new Map<string, string>(); // opencodeId → sessionId

  getOrCreate(chatId: string, chatType: 'single' | 'group'): Session {
    const existing = this.chatToSession.get(chatId);
    if (existing) {
      const session = this.sessions.get(existing)!;
      session.lastActivity = Date.now();
      return session;
    }

    const id = `qiwei_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = { id, chatId, chatType, status: 'idle', lastActivity: Date.now() };
    this.sessions.set(id, session);
    this.chatToSession.set(chatId, id);
    log.info(`创建: ${id} → ${chatId}`);
    return session;
  }

  getByChatId(chatId: string): Session | undefined {
    return this.chatToSession.has(chatId) ? this.sessions.get(this.chatToSession.get(chatId)!) : undefined;
  }

  getByOpenCodeId(opencodeId: string): Session | undefined {
    return this.opencodeToSession.has(opencodeId) ? this.sessions.get(this.opencodeToSession.get(opencodeId)!) : undefined;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  setOpenCodeId(sessionId: string, opencodeId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.opencodeId = opencodeId;
      this.opencodeToSession.set(opencodeId, sessionId);
    }
  }

  setStatus(chatId: string, status: 'idle' | 'busy') {
    const session = this.getByChatId(chatId);
    if (session) session.status = status;
  }

  isBusy(chatId: string): boolean {
    return this.getByChatId(chatId)?.status === 'busy';
  }

  getPendingInteraction(chatId: string): PendingInteraction | undefined {
    return this.getByChatId(chatId)?.pendingInteraction;
  }

  setPendingInteraction(chatId: string, interaction: PendingInteraction): void {
    const session = this.getByChatId(chatId);
    if (session) session.pendingInteraction = interaction;
  }

  clearPendingInteraction(chatId: string): void {
    const session = this.getByChatId(chatId);
    if (session) session.pendingInteraction = undefined;
  }

  /** 清理过期会话 (1小时无活动) */
  cleanExpired() {
    const cutoff = Date.now() - 3600000;
    for (const [id, session] of this.sessions) {
      if (session.lastActivity < cutoff) {
        this.sessions.delete(id);
        this.chatToSession.delete(session.chatId);
        if (session.opencodeId) this.opencodeToSession.delete(session.opencodeId);
      }
    }
  }
}
