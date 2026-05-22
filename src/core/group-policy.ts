/**
 * 群聊策略处理
 */

export class GroupPolicy {
  /**
   * 检查是否需要 @ 机器人才回复
   * 企微文本消息中，@ 机器人会以 @机器人名 的形式出现在内容开头
   * 群聊消息中如果不 @ 机器人，则不回复
   */
  static shouldReply(
    text: string,
    chatType: 'single' | 'group',
    requireMention: boolean,
    botName?: string,
  ): boolean {
    // 单聊永远回复
    if (chatType === 'single') return true;

    // 群聊：不需要 @ 则直接回复
    if (!requireMention) return true;

    // 群聊需要 @ — 检查是否 @ 了机器人
    if (botName && text.includes(`@${botName}`)) return true;

    // 通用 @ 检测
    if (text.startsWith('@') || text.includes('@')) return true;

    return false;
  }
}
