// worker.ts

// 1. Configuration (Cloudflare Worker Variables တွင် ထည့်ရမည့် တန်ဖိုးများ)
interface Env {
  BOT_TOKEN: string; // BotFather ကရတဲ့ Token
  WEBHOOK_SECRET: string; // လျှို့ဝှက်သော string တစ်ခု (Webhooks လုံခြုံရေးအတွက်)
  MAIL_KV: KVNamespace; // Cloudflare KV Namespace Binding (Key-Value Data Store)
}

// 2. Telegram Bot API Call
async function sendTelegramMessage(env: Env, chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });
}

// 3. Webhook Register Function (Worker URL/registerWebhook သို့ POST လုပ်ပါ)
async function setWebhook(env: Env, request: Request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}/webhook`;
  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}&secret_token=${env.WEBHOOK_SECRET}`;

  const response = await fetch(apiUrl);
  const result = await response.json() as { ok: boolean, description: string };
  
  return new Response(`Webhook Status: ${result.description}`, { status: result.ok ? 200 : 500 });
}

// 4. Temp Mail API ကို ခေါ်ဆိုခြင်း (1secmail ကို ဥပမာပြထား)
const TEMP_MAIL_DOMAIN = "1secmail.com";

async function generateTempMail(chatId: number, env: Env) {
  // 1secmail မှာ email ကို random username နဲ့ ဖန်တီးပေးပြီး KV မှာ သိမ်းမယ်
  const randomUser = Math.random().toString(36).substring(2, 10);
  const emailAddress = `${randomUser}@${TEMP_MAIL_DOMAIN}`;
  
  // KV Store မှာ user ရဲ့ email ကို သိမ်းထားမယ်။ Key: telegram_chat_id, Value: email_address
  await env.MAIL_KV.put(chatId.toString(), emailAddress, { expirationTtl: 3600 }); // 1 hour expiration
  
  const responseText = `🎉 Temp Mail Address: \`${emailAddress}\`\n\nဒီအီးမေးလ်က တစ်နာရီကြာရင် သက်တမ်းကုန်ဆုံးပါမယ်။ အီးမေးလ်စစ်ဆေးဖို့ /check ကို သုံးပါ။`;
  await sendTelegramMessage(env, chatId, responseText);
}

// 5. အီးမေးလ် စစ်ဆေးခြင်း
async function checkMail(chatId: number, env: Env) {
  const emailAddress = await env.MAIL_KV.get(chatId.toString());

  if (!emailAddress) {
    await sendTelegramMessage(env, chatId, "❌ သင့်အတွက် Temp Mail Address မရှိသေးပါဘူး။ /start ကို နှိပ်ပြီး အသစ်ဖန်တီးပါ။");
    return;
  }

  const [username] = emailAddress.split('@');
  const checkUrl = `https://www.1secmail.com/api/v1/?action=getMessages&login=${username}&domain=${TEMP_MAIL_DOMAIN}`;
  
  const response = await fetch(checkUrl);
  const messages = await response.json() as any[];

  if (messages.length === 0) {
    await sendTelegramMessage(env, chatId, `Inbox တွင် အီးမေးလ်အသစ်မရှိပါ။`);
    return;
  }
  
  let resultText = `📩 ${messages.length} စောင်သော အီးမေးလ်များကို တွေ့ရှိသည်:\n\n`;
  
  for (const msg of messages.slice(0, 5)) { // နောက်ဆုံး ၅ စောင်သာ ပြပါ
    resultText += `*ID:* \`${msg.id}\`\n`;
    resultText += `*From:* ${msg.from}\n`;
    resultText += `*Subject:* ${msg.subject}\n`;
    // အီးမေးလ် အသေးစိတ်ကို ခေါ်ယူရန် နောက်ထပ် API call ထပ်ခေါ်နိုင်သည်
    resultText += `\`အသေးစိတ်အချက်အလက်ကိုရယူရန်... \`\n\n`;
  }
  
  await sendTelegramMessage(env, chatId, resultText);
}

// ... Router Code (အောက်မှာ ဆက်ပါမယ်)
