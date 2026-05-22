# opencode-qiwei

OpenCode 企业微信桥接 — 让 OpenCode 接入企业微信

基于企业微信智能机器人 WebSocket 长连接通道，提供：
- 消息收发（文本、图片、语音、文件）
- 流式回复（Markdown 渲染）
- 模板卡片交互（按钮、投票、选择）
- 自动权限批准

## 安装

```bash
npm install -g @neomei/opencode-qiwei
```

## 配置

```bash
# 交互式配置向导
opencode-qiwei setup

# 或手动创建 ~/.config/opencode/qiwei.json
{
  "botId": "your-bot-id",
  "secret": "your-bot-secret",
  "opencodeUrl": "http://localhost:19876",
  "autoApprove": true
}
```

## 使用

```bash
opencode-qiwei doctor     # 连接预检
opencode-qiwei start      # 启动桥接
opencode-qiwei status     # 查看版本
```

## 与 AgentSoul（魂器）集成

将 opencode-qiwei 与魂器项目一起使用：

```json
// ~/.config/opencode/opencode.jsonc
{
  "plugin": [
    "/path/to/agent-soul-framework/plugin",
    "@neomei/opencode-feishu",
    "@neomei/opencode-qiwei"
  ]
}
```

这样点点可以同时接入飞书和企业微信，两个 channel 共享同一个灵魂和记忆。

## 架构

```
企业微信用户 → 企微 WebSocket → opencode-qiwei → OpenCode serve → LLM
                                                      ↑
                                               魂器插件注入灵魂
```

对照 opencode-feishu 架构，替换飞书 SDK 为企业微信 `@wecom/aibot-node-sdk`
