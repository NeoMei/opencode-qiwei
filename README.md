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

```json
// ~/.config/opencode/qiwei.json
{
  "botId": "your-bot-id",
  "corpSecret": "your-secret",
  "agentId": 1000001,
  "token": "your-token",
  "encodingAESKey": "your-43-char-aes-key",
  "opencodeUrl": "http://localhost:19876",
  "streaming": true,
  "showProcess": "tools",
  "autoApprove": true
}
```

## 使用

```bash
opencode-qiwei start
```
