/**
 * opencode-qiwei OpenCode 插件模式
 * 
 * 注册为 OpenCode 插件，自动处理企微消息
 * 使用方式：在 ~/.config/opencode/opencode.jsonc 中添加
 *   "plugin": ["@neomei/opencode-qiwei"]
 */

import { WSClient } from '@wecom/aibot-node-sdk';
import { ConfigManager } from './core/config.js';
import { SessionManager } from './core/session-manager.js';
import { MessageHandler } from './core/message-handler.js';
import { OpenCodeClient } from './opencode/client.js';
import { OpenCodeEventHandler } from './opencode/event-handler.js';
import { createLogger } from './core/logger.js';

const log = createLogger('Plugin');

export default function QiweiPlugin(_ctx: any) {
  let wsClient: WSClient | undefined;
  let eventHandler: OpenCodeEventHandler | undefined;
  let cleanup: (() => void) | undefined;

  return {
    name: 'opencode-qiwei',
    version: '0.1.0',

    async start() {
      try {
        const configManager = new ConfigManager();
        const config = configManager.load();

        const opencode = new OpenCodeClient({ baseUrl: config.opencodeUrl });
        const sessionManager = new SessionManager();

        wsClient = new WSClient({
          botId: config.botId,
          secret: config.corpSecret,
          reconnectInterval: 2000,
          maxReconnectAttempts: -1,
        });

        const messageHandler = new MessageHandler(config, sessionManager, wsClient, opencode);

        if (config.streaming) {
          eventHandler = new OpenCodeEventHandler(sessionManager, messageHandler, config.opencodeUrl, config.autoApprove, opencode);
          opencode.subscribeEvents().then(s => eventHandler!.start(s)).catch(() => {});
        }

        wsClient.on('message.text', f => messageHandler.handleMessage(f).catch(() => {}));
        wsClient.on('message.image', f => messageHandler.handleImageMessage(f).catch(() => {}));
        wsClient.on('event.enter_chat', f => messageHandler.handleEnterChat(f).catch(() => {}));
        wsClient.on('event.template_card_event', f => messageHandler.handleCardEvent(f).catch(() => {}));

        wsClient.connect();
        log.info('插件已启动');

        cleanup = () => { wsClient?.disconnect(); eventHandler?.stop(); };
      } catch (err) {
        log.error('插件启动失败', { err });
      }
    },

    async stop() {
      cleanup?.();
      log.info('插件已停止');
    },
  };
}
