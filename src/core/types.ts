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
  /** 场景值（企业微信后台绑定的 scene，可选） */
  scene?: number;
  /** 插件版本号（企业微信后台要求的 plug_version，可选） */
  plugVersion?: string;
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

/** 挂起的权限请求 */
export interface PendingPermission {
  id: string;
  permission: string;
  patterns: string[];
  title: string;
}

/** 挂起的问题 */
export interface PendingQuestion {
  id: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
}

/** 挂起的交互 */
export type PendingInteraction =
  | { kind: 'permission'; data: PendingPermission }
  | { kind: 'question'; data: PendingQuestion };
