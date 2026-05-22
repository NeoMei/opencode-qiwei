/** 轻量日志工具 */
export function createLogger(module: string) {
  const prefix = `[${module}]`;
  return {
    info(msg: string, data?: any) {
      console.log(`${prefix} ${msg}`, data ? JSON.stringify(data).slice(0, 200) : '');
    },
    warn(msg: string, data?: any) {
      console.warn(`${prefix} ⚠️  ${msg}`, data ? JSON.stringify(data).slice(0, 200) : '');
    },
    error(msg: string, data?: any) {
      console.error(`${prefix} ❌ ${msg}`, data ? JSON.stringify(data).slice(0, 200) : '');
    },
    debug(msg: string, data?: any) {
      if (process.env.DEBUG) console.log(`${prefix} 🔍 ${msg}`, data ? JSON.stringify(data).slice(0, 200) : '');
    },
  };
}
