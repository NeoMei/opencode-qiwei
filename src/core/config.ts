import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { WecomConfig } from './types.js';

const WecomConfigSchema = z.object({
  corpId: z.string().min(1),
  corpSecret: z.string().min(1),
  agentId: z.number().int().positive(),
  token: z.string().min(1),
  encodingAESKey: z.string().length(43),
  opencodeUrl: z.string().url().default('http://localhost:19876'),
  streaming: z.boolean().default(true),
  requireMention: z.boolean().default(true),
  groupPolicy: z.enum(['open', 'allowlist', 'disabled']).default('allowlist'),
  allowlist: z.array(z.string()).optional(),
  showProcess: z.enum(['none', 'tools', 'thinking', 'full']).default('tools'),
  autoApprove: z.boolean().default(false),
});

const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'opencode', 'qiwei.json');

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH;
  }

  load(): WecomConfig {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(this.configPath)) {
      throw new Error(`配置文件不存在: ${this.configPath}\n请先配置企业微信凭证`);
    }
    const raw = JSON.parse(readFileSync(this.configPath, 'utf-8'));
    return WecomConfigSchema.parse(raw);
  }

  save(config: WecomConfig): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}

export { WecomConfigSchema };
