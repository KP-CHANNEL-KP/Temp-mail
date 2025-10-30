// worker.ts

// 1. Configuration (Cloudflare Worker Variables တွင် ထည့်ရမည့် တန်ဖိုးများ)
interface Env {
  BOT_TOKEN: string; // BotFather ကရတဲ့ Token
  WEBHOOK_SECRET: string; // လျှို့ဝှက်သော string တစ်ခု (Webhooks လုံခြုံရေးအတွက်)
  MAIL_KV: KVNamespace; // Cloudflare KV Namespace Binding (Key-Value Data Store)
}
// ⚠️ TEMP_MAIL_DOMAIN ကို 'kponly.ggff.net' သို့ ပြောင်းလဲပြီးဖြစ်သည်။
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; // Domain အသစ်

// 2. Telegram API Message ပို့ခြင်း
// sendTelegramMessage function သည် ယခင်အတိုင်း env တစ်ခုလုံးကို လက်ခံရယူပါမည်။
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
  // Telegram ကနေ စာမပြန်လာရင်တောင် Worker က Crash မဖြစ်အောင် စစ်ဆေးထားပါတယ်။
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Telegram API Error:', response.status, errorBody);
    throw new Error(`Telegram failed with status ${response.status}`);
  }
  return response.json();
}

// 3. Webhook Register Function
async function setWebhook(env: Env, request: Request) {
  const url = new URL(request.url);
  // Custom Domain ကို အသုံးပြုနေပါက url.hostname သည် 'bot.kponly.ggff.net' ဖြစ်နေပါမည်။
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
  
  // KV Store တွင် Key: email_username, Value: telegram_chat_id ဖြင့် သိမ်းမည်။
  // ဤနေရာတွင် KV က အလုပ်လုပ်ကြောင်း သင်အတည်ပြုပြီးဖြစ်သည်။
  await env.MAIL_KV.put(randomUser, chatId.toString(), { expirationTtl: 3600 }); // 1 hour expiration
  
  const responseText = `🎉 Temp Mail Address: \`${emailAddress}\`\n\nဒီအီးမေးလ်က တစ်နာရီကြာရင် သက်တမ်းကုန်ဆုံးပါမယ်။`;
  await sendTelegramMessage(env, chatId, responseText);
}

// ... Router Code
import { Router } from 'itty-router';

const router = Router();

// 6. Incoming Telegram Message ကို စီမံခြင်း
async function handleTelegramWebhook(env: Env, request: Request) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const update = await request.json() as any;

  if (update.message) {
    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;

    if (!text) {
        return new Response('OK'); 
    }
    
    // Command များကို Lowercase ဖြင့်သာ စစ်ဆေးပါမည်
    const command = text.toLowerCase().trim();

    if (command === '/start') {
      await sendTelegramMessage(env, chatId, "👋 မင်္ဂလာပါ၊ Temp Mail Bot မှကြိုဆိုပါတယ်။ အီးမေးလ်အသစ်တစ်ခု ဖန်တီးဖို့ /generate ကို နှိပ်ပါ။");
    } else if (command === '/generate') {
      await generateTempMail(chatId, env);
    } else if (command === '/check') {
        // /check ကို ဖြုတ်လိုက်ပါပြီ။
        await sendTelegramMessage(env, chatId, "⚠️ Email Routing ကို အသုံးပြုနေသောကြောင့် /check command သည် အလုပ်မလုပ်ပါ။ အီးမေးလ်ဝင်လာပါက အလိုအလျောက် အသိပေးပါမည်။");
    } else {
      await sendTelegramMessage(env, chatId, "🤔 နားမလည်ပါဘူး။ /start, /generate များကိုသာ လက်ခံပါသည်။");
    }
  }

  return new Response('OK');
}

// 7. Worker ရဲ့ Entry Point နှင့် Email Handler အသစ်
router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: router.handle,

  // 👈 ဝင်လာသော Email များကို ကိုင်တွယ်မည့် email handler (Error ဖြေရှင်းပြီး)
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        const toEmail = message.to.address; 
        
        // ⚠️ ပုံ (1000012829.jpg) Error ကို ဖြေရှင်းရန် message.to.address ကို စစ်ဆေးခြင်း
        if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
            console.error('Invalid destination email address:', toEmail);
            // Email address ပုံစံ မှားယွင်းပါက Reject လုပ်ပါ
            return message.setReject('Invalid destination email address format.'); 
        }

        const [username] = toEmail.split('@'); 
        
        // 1. KV မှ username ဖြင့် chat ID ကို ပြန်ရှာပါ
        const chatId = await env.MAIL_KV.get(username); 

        if (chatId) {
            // 2. Telegram ကို Notification ပို့ပါ
            const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                 `*To:* \`${toEmail}\`\n` +
                                 `*From:* ${message.from}\n` + 
                                 `*Subject:* ${message.subject.substring(0, 100)}\n\n` +
                                 `*ကိုယ်ထည်အကျဉ်း:* ${message.text.substring(0, 300)}...`; // Email Body အကျဉ်း

            // sendTelegramMessage သည် chatId ကို number လိုချင်သောကြောင့် parseInt ဖြင့် ပြောင်းပေးသည်
            await sendTelegramMessage(env, parseInt(chatId), notification);
            
            // Email ကို လက်ခံပြီး Worker လုပ်ငန်းပြီးဆုံးကြောင်း ပြသရန်
            console.log(`Email successfully forwarded to Telegram Chat ID: ${chatId}`);
            // Reject မလုပ်တော့ဘဲ၊ message.forward() ကိုလည်း မခေါ်ဘဲ ပုံမှန်အတိုင်း ပြီးဆုံးပါစေ
        } else {
            // သက်တမ်းကုန်သွားသော Email ဖြစ်ပါက Reject လုပ်ပါ။
            console.log(`Rejecting expired email for user: ${username}`);
            message.setReject('This temporary email address has expired or is invalid.');
        }

    } catch (e) {
        // Telegram ကို စာပို့ရာမှာ Error ဖြစ်ပါက Email ကို Reject လုပ်ပါ
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('Email Handler FATAL Error:', errorMessage);
        message.setReject('Bot processing error..'); 
    }
  }
};
