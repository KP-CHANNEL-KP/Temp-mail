// worker.ts (Finalized Email Handler Logic)

// 1. Configuration (Cloudflare Worker Variables တွင် ထည့်ရမည့် တန်ဖိုးများ)
interface Env {
  BOT_TOKEN: string; // BotFather ကရတဲ့ Token
  WEBHOOK_SECRET: string; // လျှို့ဝှက်သော string တစ်ခု (Webhooks လုံခြုံရေးအတွက်)
  MAIL_KV: KVNamespace; // Cloudflare KV Namespace Binding (Key-Value Data Store)
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; // Domain အသစ်

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
    console.error('Telegram API Error:', response.status, errorBody);
    // throw လုပ်လိုက်ခြင်းက email handler ကို catch block ထဲရောက်စေပြီး reject လုပ်စေမှာပါ။
    throw new Error(`Telegram failed with status ${response.status}: ${errorBody.substring(0, 100)}`);
  }
  return response.json();
}

// 3. Webhook Register Function ( unchanged )
async function setWebhook(env: Env, request: Request) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}/webhook`; 
  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${webhookUrl}&secret_token=${env.WEBHOOK_SECRET}`;

  const response = await fetch(apiUrl);
  const result = await response.json() as { ok: boolean, description: string };
  
  return new Response(`Webhook Status: ${result.description}`, { status: result.ok ? 200 : 500 });
}

// 4. Temp Mail ဖန်တီးခြင်း ( unchanged )
async function generateTempMail(chatId: number, env: Env) {
  const randomUser = Math.random().toString(36).substring(2, 10);
  const emailAddress = `${randomUser}@${TEMP_MAIL_DOMAIN}`;
  
  await env.MAIL_KV.put(randomUser, chatId.toString(), { expirationTtl: 3600 }); // 1 hour expiration
  
  const responseText = `🎉 Temp Mail Address: \`${emailAddress}\`\n\nဒီအီးမေးလ်က တစ်နာရီကြာရင် သက်တမ်းကုန်ဆုံးပါမယ်။`;
  await sendTelegramMessage(env, chatId, responseText);
}

// ... Router Code
import { Router } from 'itty-router';

const router = Router();

// 6. Incoming Telegram Message ကို စီမံခြင်း ( unchanged )
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
    
    const command = text.toLowerCase().trim();

    if (command === '/start') {
      await sendTelegramMessage(env, chatId, "👋 မင်္ဂလာပါ၊ Temp Mail Bot မှကြိုဆိုပါတယ်။ အီးမေးလ်အသစ်တစ်ခု ဖန်တီးဖို့ /generate ကို နှိပ်ပါ။");
    } else if (command === '/generate') {
      await generateTempMail(chatId, env);
    } else if (command === '/check') {
        await sendTelegramMessage(env, chatId, "⚠️ Email Routing ကို အသုံးပြုနေသောကြောင့် /check command သည် အလုပ်မလုပ်ပါ။ အီးမေးလ်ဝင်လာပါက အလိုအလျောက် အသိပေးပါမည်။");
    } else {
      await sendTelegramMessage(env, chatId, "🤔 နားမလည်ပါဘူး။ /start, /generate များကိုသာ လက်ခံပါသည်။");
    }
  }

  return new Response('OK');
}

// 7. Worker ရဲ့ Entry Point နှင့် Email Handler အသစ် (ပြင်ဆင်ပြီး)
export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        const toEmail = message.to.address; 
        
        // 🚨 ပြဿနာ အမှတ် (၁) ကို ဖြေရှင်းရန် Code: Email address ကို ပိုမို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        let username;
        // toEmail က ဥပမာ: "User Name <username@domain.com>" သို့မဟုတ် "username@domain.com" ဖြစ်နိုင်
        const emailMatch = toEmail.match(/<?([^@]+)@/);

        if (emailMatch && emailMatch[1]) {
            username = emailMatch[1];
        } else {
            // Email address ပုံစံ မှားယွင်းပါက Reject လုပ်ပါ
            console.error('Email Handler FATAL Error: Cannot extract username from:', toEmail);
            return message.setReject('Invalid destination email address format.'); 
        }

        // 1. KV မှ username ဖြင့် chat ID ကို ပြန်ရှာပါ
        const chatId = await env.MAIL_KV.get(username); 

        if (chatId) {
            // 2. Telegram ကို Notification ပို့ပါ
            const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                 `*To:* \`${toEmail}\`\n` +
                                 `*From:* ${message.from}\n` + 
                                 `*Subject:* ${message.subject.substring(0, 100)}\n\n` +
                                 `*ကိုယ်ထည်အကျဉ်း:* ${message.text.substring(0, 300)}...`; 

            // sendTelegramMessage သည် chatId ကို number လိုချင်သောကြောင့် parseInt ဖြင့် ပြောင်းပေးသည်
            await sendTelegramMessage(env, parseInt(chatId), notification);
            
            // Email ကို လက်ခံပြီး Worker လုပ်ငန်းပြီးဆုံးကြောင်း ပြသရန်
            console.log(`Email successfully forwarded to Telegram Chat ID: ${chatId} for user: ${username}`);
            // Reject မလုပ်ဘဲ ပြီးဆုံးပါစေ
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
