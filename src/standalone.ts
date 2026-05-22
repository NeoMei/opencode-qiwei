/**
 * opencode-qiwei 独立运行入口
 * 
 * 架构对照 opencode-feishu/standalone.ts：
 * 飞书用 Lark WSClient → 企微用 @wecom/aibot-node-sdk WSClient
 * 
 * 流程：
 * 1. 加载配置 (~/.config/opencode/qiwei.json)
 * 2. 连接 OpenCode serve
 * 3. 建立企微 WebSocket 长连接
 * 4. 注册消息/事件处理器
 * 5. 启动流式消息处理
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
  console.log(`   流式: ${config.streaming}`);
  console.log(`   自动授权: ${config.autoApprove}\n`);

  // 2. 连接 OpenCode
  const opencode = new OpenCodeClient({ baseUrl: config.opencodeUrl });
  await opencode.listSessions().catch(() => {
    log.warn('OpenCode 服务未响应，将重试...');
  });

  // 3. 初始化会话管理
  const sessionManager = new SessionManager();

  // 4. 企微 WebSocket 连接
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

  // 6. 事件处理（流式消息）
  let eventHandler: OpenCodeEventHandler | undefined;
  if (config.streaming) {
    eventHandler = new OpenCodeEventHandler(
      sessionManager,
      wsClient,
      config.opencodeUrl,
      config.showProcess,
      config.autoApprove,
      opencode
    );

    const eventStream = await opencode.subscribeEvents();
    eventHandler.start(eventStream).catch(err => log.error({ err }, 'Event stream error'));
  }

  // 7. 注册消息监听
  wsClient.on('message.text', (frame) => {
    messageHandler.handleMessage(frame).catch(err => log.error({ err }, 'Message handling failed'));
  });

  wsClient.on('message.image', (frame) => {
    messageHandler.handleImageMessage(frame).catch(err => log.error({ err }, 'Image handling failed'));
  });

  wsClient.on('message.mixed', (frame) => {
    messageHandler.handleMixedMessage(frame).catch(err => log.error({ err }, 'Mixed handling failed'));
  });

  wsClient.on('event.enter_chat', (frame) => {
    messageHandler.handleEnterChat(frame).catch(err => log.error({ err }, 'Enter chat handling failed'));
  });

  wsClient.on('event.template_card_event', (frame) => {
    messageHandler.handleCardEvent(frame).catch(err => log.error({ err }, 'Card event handling failed'));
  });

  // 8. 启动连接
  wsClient.connect();
  console.log('✅ 企业微信 WebSocket 已连接\n');

  // 9. 显示状态
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     OpenCode 企业微信桥接 运行中              ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║  OpenCode: ${config.opencodeUrl.padEnd(36)} ║`);
  console.log(`║  流式:     ${(config.streaming ? '启用' : '禁用').padEnd(36)} ║`);
  console.log('╚════════════════════════════════════════════════╝\n');

  // 10. 优雅退出
  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭...');
    wsClient.disconnect();
    eventHandler?.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    wsClient.disconnect();
    eventHandler?.stop();
    process.exit(0);
  });
}
