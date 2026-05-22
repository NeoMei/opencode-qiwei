/**
 * 企微模板卡片管理器
 * 处理 OpenCode 的工具状态 → 企微卡片更新
 * 
 * 支持卡片类型：
 * - text_notice: 通知（进度提示）
 * - button_interaction: 按钮交互（权限请求/确认）
 * - vote_interaction: 投票
 * - multiple_interaction: 多选
 */

import type { WSClient, WsFrame, TemplateCard, ReplyFeedback } from '@wecom/aibot-node-sdk';

export interface CardState {
  taskId: string;
  title: string;
  status: 'running' | 'completed' | 'error';
  tools?: Array<{ name: string; status: string; error?: string }>;
}

export class TemplateCardManager {
  /** 创建"思考中"通知卡片 */
  static createThinkingCard(botName: string): TemplateCard {
    return {
      card_type: 'text_notice',
      main_title: { title: `${botName} 正在思考...`, desc: '请稍候' },
      sub_title_text: '正在分析你的问题...',
    };
  }

  /** 创建工具执行状态卡片 */
  static createToolsCard(state: CardState): TemplateCard {
    const tools = state.tools || [];
    const toolList = tools.map(t => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'error' ? '❌' : '🔧';
      return { keyname: `${icon} ${t.name}`, value: t.error || t.status };
    });

    return {
      card_type: 'text_notice',
      main_title: { title: state.title, desc: state.status === 'completed' ? '已完成' : state.status === 'error' ? '出错' : '执行中' },
      horizontal_content_list: toolList.slice(0, 6),
      sub_title_text: state.status === 'completed' ? '' : '正在执行工具操作...',
    };
  }

  /** 发送/更新卡片 */
  static async sendCard(
    wsClient: WSClient,
    frame: WsFrame<any>,
    card: TemplateCard,
    taskId: string,
    feedback?: ReplyFeedback
  ): Promise<void> {
    card.task_id = taskId;
    if (feedback) card.feedback = feedback;
    await wsClient.replyTemplateCard(frame, card, feedback);
  }

  /** 更新已有卡片 */
  static async updateCard(
    wsClient: WSClient,
    frame: WsFrame<any>,
    card: TemplateCard,
    userids?: string[]
  ): Promise<void> {
    await wsClient.updateTemplateCard(frame, card, userids);
  }
}
