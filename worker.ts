// Worker Code: bot10temp (Null-Safe Email Handler ပါဝင်သော ဗားရှင်း)

// 1. Configuration (Cloudflare Worker Variables တွင် ထည့်ရမည့် တန်ဖိုးများ)
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; // KV Binding Name ကို bot10temp Worker မှာ MAIL_KV လို့ ထားပေးပါ
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; // သင့် Domain နာမည်ကို မှန်ကန်စွာ ထားပေးပါ
const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

// 2. Telegram API Message ပို့ခြင်း
async function sendTelegramMessage(env: Env, chatId: number, text: string): Promise<void> {
  const url = `${TELEGRAM_API(env.BOT_TOKEN)}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });

  if (!response.ok) {
    console.error(`Failed to send Telegram message: ${response.status} ${response.statusText}`);
    // Error ကို ဒီမှာ swallow လုပ်ထားပါတယ်
  }
}

// 3. Webhook Register Function
async function setWebhook(env: Env, request: Request): Promise<Response> {
  const url = `${TELEGRAM_API(env.BOT_TOKEN)}/setWebhook`;
  const webhookUrl = new URL(request.url);
  webhookUrl.pathname = '/webhook';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl.toString(),
      allowed_updates: ["message"],
      secret_token: env.WEBHOOK_SECRET
    }),
  });

  return new Response(response.ok ? 'Webhook set successfully' : 'Failed to set webhook', { status: response.status });
}

// 4. Temp Mail ဖန်တီးခြင်း
async function generateTempMail(env: Env, chatId: number): Promise<string> {
  // ၈ လုံး random string ဖန်တီး
  const length = 8;
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username = '';
  for (let i = 0; i < length; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // KV မှာ ထည့်သွင်းသိမ်းဆည်း
  await env.MAIL_KV.put(username, chatId.toString(), { expirationTtl: 3600 }); // 1 hour expiration

  const emailAddress = `${username}@${TEMP_MAIL_DOMAIN}`;
  return emailAddress;
}

// 5. Incoming Telegram Message ကို စီမံခြင်း
async function handleTelegramWebhook(env: Env, request: Request): Promise<Response> {
  // Webhook secret စစ်ဆေးခြင်း
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }

  const update = await request.json() as any;

  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    if (text === '/generate') {
      const tempMail = await generateTempMail(env, chatId);
      const message = `🎉 **Temp Mail Address:** \`${tempMail}\`\n\n` +
                      `ဒီအီးမေးလ်က တစ်နာရီကြာအောင် သက်တမ်းကုန်ဆုံးပါမယ်။`;
      await sendTelegramMessage(env, chatId, message);
    } else if (text === '/start') {
        const message = `👋 Hi! ယာယီအီးမေးလ် လိပ်စာတစ်ခု ဖန်တီးဖို့အတွက် /generate လို့ ရိုက်ထည့်ပါ။`;
        await sendTelegramMessage(env, chatId, message);
    }
  }

  return new Response('OK');
}

// 6. Worker ရဲ့ Entry Point နှင့် Email Handler
import { Router } from 'itty-router';
const router = Router();

router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // 🚨 Null Safety ဖြင့် message.to.address ကို စစ်ဆေးခြင်း (Error ဖြေရှင်းရန်)
        const toEmail = message.to?.address; 

        if (!toEmail) {
             console.error('Email Handler FATAL Error: message.to.address is missing or undefined.');
             return message.setReject('Invalid destination email address received. (Missing To Address)'); 
        }

        const fromDisplay = message.from; 

        // 3. Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း (Null Safety ပါဝင်)
        // toEmail မှာ "user@domain.com" သို့မဟုတ် "Name <user@domain.com>" ပုံစံရှိနိုင်သည်
        const emailMatch = toEmail.match(/^<?([^@]+)@/);

        let username: string;
        if (emailMatch && emailMatch[1]) {
            username = emailMatch[1];
        } else {
            console.error('Email Handler FATAL Error: Cannot extract username from:', toEmail);
            return message.setReject(`Invalid destination format or username not found in ${toEmail}.`); 
        }

        // 4. KV မှ chat ID ကို ပြန်ရှာပါ
        const chatIdString = await env.MAIL_KV.get(username); 

        if (chatIdString) {
            // 5. Telegram API ကို စာပို့ရန် Chat ID (String) ကို Number ပြောင်းပါ
            const chatIdNumber = parseInt(chatIdString); 

            // အကြောင်းအရာနှင့် စာကိုယ်အကျဉ်းကို စစ်ဆေးခြင်း
            const subject = message.subject || "(No Subject)";
            const bodyText = message.text || "(Email Body is empty)";

            const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                 `*To:* \`${toEmail}\`\n` +
                                 `*From:* ${fromDisplay || 'Unknown Sender'}\n` + 
                                 `*Subject:* ${subject.substring(0, 100)}\n\n` +
                                 `*ကိုယ်ထည်အကျဉ်း:* ${bodyText.substring(0, 300)}...`; 

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
        message.setReject(`Bot processing error: ${errorMessage.substring(0, 50)}...`); 
    }
  }
};
