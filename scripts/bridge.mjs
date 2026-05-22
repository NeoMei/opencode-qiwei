import { WSClient } from '@wecom/aibot-node-sdk';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync(process.env.HOME + '/.config/opencode/qiwei.json', 'utf-8'));
const ws = new WSClient({ botId: config.botId, secret: config.secret, maxReconnectAttempts: -1 });

async function callOC(text) {
  try {
    const s = await fetch(config.opencodeUrl + '/session', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title:'企微'}) });
    const session = await s.json();
    const r = await fetch(config.opencodeUrl + '/session/' + session.id + '/message', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parts:[{type:'text',text}]}) });
    const reply = await r.json();
    return reply.parts?.find(p => p.type === 'text')?.text || '';
  } catch(e) { console.error('OC:', e.message); return ''; }
}

ws.on('message.text', async (frame) => {
  const sid = 's_'+Date.now();
  await ws.replyStream(frame, sid, '...', false).catch(()=>{});
  const reply = await callOC(frame.body?.text?.content || '');
  await ws.replyStream(frame, sid, reply || '出错了😢', true).catch(()=>{});
});

ws.on('authenticated', () => console.log('✅ 点点企微在线'));
ws.on('error', (e) => console.error('❌', e.message));
ws.on('disconnected', (r) => console.log('🔌', r));
ws.connect();
