/** 企业微信配置类型 */
export interface WecomConfig {
  /** 智能机器人 ID */
  botId: string;
  /** 智能机器人 Secret */
  secret: string;
  /** 企业ID (corpId) */
  corpId: string;
  /** 应用Secret (corpSecret) */
  corpSecret: string;
  /** 应用AgentId */
  agentId: number;
  /** Token（回调验证） */
  token: string;
  /** EncodingAESKey（消息加解密, 43字符） */
  encodingAESKey: string;
  /** OpenCode 服务地址 */
  opencodeUrl: string;
  /** 是否启用流式消息 */
  streaming: boolean;
  /** 是否需要 @ 才回复 */
  requireMention: boolean;
  /** 群聊策略 */
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  /** 白名单 */
  allowlist?: string[];
  /** 显示工具执行状态 */
  showProcess?: 'none' | 'tools' | 'thinking' | 'full';
  /** 自动批准权限 */
  autoApprove?: boolean;
}

/** 企微消息 */
export interface WecomMessage {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  MsgId: string;
  AgentID: number;
  /** 群聊ID */
  ChatId?: string;
  /** 发送者信息 */
  sender?: string;
}
