/**
 * opencode-qiwei — OpenCode 企业微信桥接
 * 
 * 架构参考 opencode-feishu，适配企业微信 HTTP 回调模式：
 * - 飞书用 WebSocket 长连接 → 企微用 HTTP 回调 URL
 * - 企微消息需加解密（AES + SHA1 签名）
 * - 企微用 corpid + corpsecret 认证
 * - 支持智能机器人长连接模式（WebSocket）
 */

export { WecomConfig } from './core/types.js';
export { ConfigManager } from './core/config.js';
export { WecomAPI } from './wecom/api.js';
export { MessageHandler } from './core/message-handler.js';
export { startStandalone } from './standalone.js';
