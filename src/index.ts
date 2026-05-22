/**
 * opencode-qiwei — OpenCode 企业微信桥接
 * 
 * @neomei/opencode-qiwei
 * 
 * 使用方式：
 *   独立运行: npx opencode-qiwei start
 *   插件模式: 添加到 ~/.config/opencode/opencode.jsonc 的 plugin 列表
 */

export { WecomConfig } from './core/types.js';
export { ConfigManager } from './core/config.js';
export { SessionManager } from './core/session-manager.js';
export { MessageHandler } from './core/message-handler.js';
export { TemplateCardManager } from './core/template-card-manager.js';
export { MediaHandler } from './core/media-handler.js';
export { GroupPolicy } from './core/group-policy.js';
export { OpenCodeClient } from './opencode/client.js';
export { OpenCodeEventHandler } from './opencode/event-handler.js';
export { startStandalone } from './standalone.js';

import QiweiPlugin from './plugin.js';
export { QiweiPlugin };
export default QiweiPlugin;
