// worker.ts (Final & Tested Email Handler)

// 1. Configuration (Cloudflare Worker Variables တွင် ထည့်ရမည့် တန်ဖိုးများ)
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; 
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; 

// 2. Telegram API Message ပို့ခြင်း
async function sendTelegramMessage(env: Env, chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Telegram API Error: Status ${response.status} - Body: ${errorBody}`);
    throw new Error(`Telegram failed with status ${response.status}: ${errorBody.substring(0, 100)}`);
  }
  return response.json();
}

// 3. Webhook Register Function
import { Router } from 'itty-router';
const router = Router();

async function setWebhook(env: Env, request: Request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}/webhook`; 
  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}&secret_token=${env.WEBHOOK_SECRET}`;
  const response = await fetch(apiUrl);
  const result = await response.json() as { ok: boolean, description: string };
  return new Response(`Webhook Status: ${result.description}`, { status: result.ok ? 200 : 500 });
}

// 4. Temp Mail ဖန်တီးခြင်း
async function generateTempMail(chatId: number, env: Env) {
  const randomUser = Math.random().toString(36).substring(2, 10);
  const emailAddress = `${randomUser}@${TEMP_MAIL_DOMAIN}`;
  await env.MAIL_KV.put(randomUser, chatId.toString(), { expirationTtl: 3600 }); 
  const responseText = `🎉 Temp Mail Address: \`${emailAddress}\`\n\nဒီအီးမေးလ်က တစ်နာရီကြာရင် သက်တမ်းကုန်ဆုံးပါမယ်။`;
  await sendTelegramMessage(env, chatId, responseText);
}

// 5. Incoming Telegram Message ကို စီမံခြင်း
async function handleTelegramWebhook(env: Env, request: Request) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const update = await request.json() as any;
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;
  
      if (!text) return new Response('OK'); 
      const command = text.toLowerCase().trim();

      if (command === '/start') {
        await sendTelegramMessage(env, chatId, "👋 မင်္ဂလာပါ၊ Temp Mail Bot မှကြိုဆိုပါတယ်။ အီးမေးလ်အသစ်တစ်ခု ဖန်တီးဖို့ /generate ကို နှိပ်ပါ။");
      } else if (command === '/generate') {
        await generateTempMail(chatId, env);
      } else {
        await sendTelegramMessage(env, chatId, "🤔 နားမလည်ပါဘူး။ /start, /generate များကိုသာ လက်ခံပါသည်။");
      }
    }
    return new Response('OK');
    
  } catch (e) {
    console.error('Webhook Handler Error:', e instanceof Error ? e.message : String(e));
    return new Response('OK'); 
  }
}

// 6. Worker ရဲ့ Entry Point နှင့် Email Handler
router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        const toEmail = message.to.address; 
        
        // 🚨 ဤနေရာတွင် toEmail ကို အဓိက စစ်ဆေးခြင်း
        if (!toEmail || typeof toEmail !== 'string') {
             console.error('Email Handler FATAL Error: Received invalid or undefined toEmail address.');
             return message.setReject('Invalid destination email address received.'); 
        }

        // Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        let username;
        // toEmail မှာ "user@domain.com" သို့မဟုတ် "Name <user@domain.com>" ပုံစံရှိနိုင်သည်
        const emailMatch = toEmail.match(/^<?([^@]+)@/);

        if (emailMatch && emailMatch[1]) {
            username = emailMatch[1];
        } else {
            console.error('Email Handler FATAL Error: Cannot extract username from:', toEmail);
            return message.setReject(`Invalid destination format or username not found in ${toEmail}.`); 
        }

        // 1. KV မှ chat ID ကို ပြန်ရှာပါ
        const chatIdString = await env.MAIL_KV.get(username); 

        if (chatIdString) {
            // 2. Telegram API ကို စာပို့ရန် Chat ID (String) ကို Number ပြောင်းပါ
            const chatIdNumber = parseInt(chatIdString); 

            const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                 `*To:* \`${toEmail}\`\n` +
                                 `*From:* ${message.from}\n` + 
                                 `*Subject:* ${message.subject.substring(0, 100)}\n\n` +
                                 `*ကိုယ်ထည်အကျဉ်း:* ${message.text.substring(0, 300)}...`; 

            // Telegram API ကို ခေါ်ဆိုခြင်း
            await sendTelegramMessage(env, chatIdNumber, notification);
            
            console.log(`Email successfully forwarded to Telegram Chat ID: ${chatIdNumber} for user: ${username}`);
        } else {
            console.log(`Rejecting expired email for user: ${username}`);
            message.setReject('This temporary email address has expired or is invalid.');
        }

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('Email Handler FATAL Error in try block:', errorMessage);
        message.setReject('Bot processing error..'); 
    }
  }
};
