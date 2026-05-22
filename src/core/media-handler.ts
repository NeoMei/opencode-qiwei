/**
 * 企微媒体文件处理
 * 下载并解密企微发送的图片/文件/语音/视频
 */

import type { WSClient } from '@wecom/aibot-node-sdk';
import { createLogger } from './logger.js';

const log = createLogger('MediaHandler');

export interface DownloadedMedia {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class MediaHandler {
  /**
   * 从企微消息中下载并解密文件
   * @param url - 加密的文件 URL（5分钟有效）
   * @param aesKey - Base64 编码的 AES 解密密钥
   */
  static async download(
    wsClient: WSClient,
    url: string,
    aesKey?: string
  ): Promise<DownloadedMedia | null> {
    try {
      const result = await wsClient.downloadFile(url, aesKey);
      return {
        buffer: result.buffer,
        filename: result.filename || 'download',
        mimeType: MediaHandler.guessMimeType(result.filename || ''),
      };
    } catch (err) {
      log.error('文件下载失败', { err });
      return null;
    }
  }

  /** 上传文件获取 media_id（用于主动发送） */
  static async upload(
    wsClient: WSClient,
    fileBuffer: Buffer,
    type: 'image' | 'file' | 'voice' | 'video',
    filename: string
  ): Promise<string | null> {
    try {
      const result = await wsClient.uploadMedia(fileBuffer, { type, filename });
      return result.media_id;
    } catch (err) {
      log.error('文件上传失败', { err });
      return null;
    }
  }

  private static guessMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      mp4: 'video/mp4', mov: 'video/quicktime',
      mp3: 'audio/mpeg', wav: 'audio/wav', amr: 'audio/amr',
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return map[ext] || 'application/octet-stream';
  }
}
