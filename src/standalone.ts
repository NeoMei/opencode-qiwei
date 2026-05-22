/**
 * opencode-qiwei 独立运行入口
 * 企微 WSClient → 消息处理 → OpenCode → 流式回复
 */

import { WSClient } from '@wecom/aibot-node-sdk';
import type { WecomConfig } from './core/types.js';
import { ConfigManager } from './core/config.js';
import { createLogger } from './core/logger.js';
import { SessionManager } from './core/session-manager.js';
import { MessageHandler } from './core/message-handler.js';
import { OpenCodeClient } from './opencode/client.js';
import { OpenCodeEventHandler } from './opencode/event-handler.js';

const log = createLogger('Standalone');

export async function startStandalone(options: { configPath?: string } = {}) {
  console.log('🚀 启动 OpenCode 企业微信桥接\n');

  // 1. 加载配置
  const configManager = new ConfigManager(options.configPath);
  const config = configManager.load();
  console.log(`   Bot ID: ${config.botId}`);
  console.log(`   OpenCode: ${config.opencodeUrl}`);
  console.log(`   流式: ${config.streaming ? '✅' : '❌'}`);
  console.log(`   自动授权: ${config.autoApprove ? '✅' : '❌'}\n`);

  // 2. 连接 OpenCode
  const opencode = new OpenCodeClient({ baseUrl: config.opencodeUrl });
  try { await opencode.listSessions(); console.log('✅ OpenCode 已连接\n'); }
  catch { log.warn('OpenCode 未响应'); }

  // 3. 初始化
  const sessionManager = new SessionManager();

  // 4. 企微 WebSocket
  console.log('📡 连接企业微信 WebSocket...');
  const wsClient = new WSClient({
    botId: config.botId,
    secret: config.corpSecret,
    reconnectInterval: 2000,
    maxReconnectAttempts: -1,
    heartbeatInterval: 30000,
  });

  // 5. 消息处理
  const messageHandler = new MessageHandler(config, sessionManager, wsClient, opencode);

  // 6. SSE 事件 → 流式推送
  let eventHandler: OpenCodeEventHandler | undefined;
  if (config.streaming) {
    eventHandler = new OpenCodeEventHandler(sessionManager, messageHandler, config.opencodeUrl, config.autoApprove, opencode);

    // 后台启动 SSE 监听
    opencode.subscribeEvents().then(stream => {
      eventHandler!.start(stream).catch(err => log.error('SSE error', { err }));
    }).catch(err => log.warn('SSE 连接失败'));
  }

  // 7. 消息监听
  wsClient.on('message.text', frame => messageHandler.handleMessage(frame).catch(e => log.error('text')));
  wsClient.on('message.image', frame => messageHandler.handleImageMessage(frame).catch(e => log.error('image')));
  wsClient.on('message.mixed', frame => messageHandler.handleMixedMessage(frame).catch(e => log.error('mixed')));
  wsClient.on('event.enter_chat', frame => messageHandler.handleEnterChat(frame).catch(e => log.error('enter')));
  wsClient.on('event.template_card_event', frame => messageHandler.handleCardEvent(frame).catch(e => log.error('card')));

  wsClient.on('connected', () => log.info('🔗 WebSocket 已连接'));
  wsClient.on('authenticated', () => console.log('✅ 企业微信认证成功\n'));
  wsClient.on('disconnected', reason => log.warn(`🔌 断开: ${reason}`));
  wsClient.on('error', err => log.error(`WebSocket 错误: ${err.message}`));

  wsClient.connect();

  // 8. 状态
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     OpenCode 企业微信桥接 运行中              ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║  OpenCode: ${config.opencodeUrl.padEnd(36)} ║`);
  console.log(`║  流式:     ${(config.streaming ? 'Markdown 实时推送' : '禁用').padEnd(36)} ║`);
  console.log('╚════════════════════════════════════════════════╝\n');

  // 9. 退出
  const cleanup = () => { wsClient.disconnect(); eventHandler?.stop(); process.exit(0); };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
