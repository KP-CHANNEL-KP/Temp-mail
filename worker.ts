// worker.ts (Webhook Response အား စနစ်တကျ ပြန်ပေးရန် ပြင်ဆင်ထားသော Final Code)

// 1. Configuration (Cloudflare Worker Variables တွင် ထည့်ရမည့် တန်ဖိုးများ)
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; 
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net";
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
  const length = 8;
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username = '';
  for (let i = 0; i < length; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  await env.MAIL_KV.put(username, chatId.toString(), { expirationTtl: 3600 }); // 1 hour expiration
  return `${username}@${TEMP_MAIL_DOMAIN}`;
}

// 5. Incoming Telegram Message ကို စီမံခြင်း 🚨 ပြင်ဆင်ထားသော အပိုင်း 🚨
async function handleTelegramWebhook(env: Env, request: Request): Promise<Response> {
  // Webhook secret စစ်ဆေးခြင်း
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }

  try {
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
      // 🚨 အောင်မြင်လျှင် Response ကို ချက်ချင်း ပြန်ပေးခြင်း
      return new Response('OK', { status: 200 }); 
    }
    
    // Message မပါဝင်လျှင် (သို့) စိတ်မဝင်စားလျှင် Response ကို ချက်ချင်း ပြန်ပေးခြင်း
    return new Response('OK', { status: 200 }); 

  } catch (e) {
    console.error('Webhook Handler Error:', e instanceof Error ? e.message : String(e));
    // 🚨 Error ဖြစ်သည့်တိုင် Telegram ကို Error Message ပြန်မပို့ဘဲ OK ပြန်ပေးခြင်း
    return new Response('OK (Error handled)', { status: 200 }); 
  }
}


// 6. Worker ရဲ့ Entry Point နှင့် Email Handler (ယခင်အတိုင်း Null-Safe Code)
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
        // Fallback Mechanism ဖြင့် To Address ရယူခြင်း
        
        let toAddressSource: string | null = null;
        
        // 1. message.to.address ကို အရင်စစ်ဆေးခြင်း
        if (message.to?.address) {
            toAddressSource = message.to.address;
        } 
        
        // 2. မပါလာလျှင် Original-To Header ကို အစားထိုးစစ်ဆေးခြင်း
        if (!toAddressSource) {
            const originalToHeader = message.headers.get('Original-To');
            if (originalToHeader) {
                // Header မှ Email Address ကို ခွဲထုတ်ခြင်း
                const toEmailMatch = originalToHeader.match(/<?([^>]+@[^>]+)>/) || originalToHeader.match(/([^ ]+@[^ ]+)/);
                if (toEmailMatch && toEmailMatch[1]) {
                    toAddressSource = toEmailMatch[1].trim();
                }
            }
        }
        
        const toEmail = toAddressSource;

        if (!toEmail) {
             console.error('Email Handler FATAL Error: Cannot find a valid To address from message.to.address or Original-To header.');
             return message.setReject('Invalid destination email address received. (To Address Not Found)'); 
        }

        const fromDisplay = message.from; 

        // 3. Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        const usernameMatch = toEmail.match(/^([^@]+)@/);

        let username: string;
        if (usernameMatch && usernameMatch[1]) {
            username = usernameMatch[1];
        } else {
            console.error('Email Handler FATAL Error: Cannot extract username from:', toEmail);
            return message.setReject(`Invalid destination format or username not found in ${toEmail}.`); 
        }

        // 4. KV မှ chat ID ကို ပြန်ရှာပါ
        const chatIdString = await env.MAIL_KV.get(username); 

        if (chatIdString) {
            const chatIdNumber = parseInt(chatIdString); 
            const subject = message.subject || "(No Subject)";
            const bodyText = message.text || "(Email Body is empty)";

            const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                 `*To:* \`${toEmail}\`\n` +
                                 `*From:* ${fromDisplay || 'Unknown Sender'}\n` + 
                                 `*Subject:* ${subject.substring(0, 100)}\n\n` +
                                 `*ကိုယ်ထည်အကျဉ်း:* ${bodyText.substring(0, 300)}...`; 

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
