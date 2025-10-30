// worker.ts (Final Working Code - Structure, Webhook, and Email Fixes)

// 🚨 1. Imports and Router Initialization (အပေါ်ဆုံးတွင် ရှိရမည်)
import { Router } from 'itty-router';
const router = Router(); // 👈 router ကို ဒီနေရာမှာ ချက်ချင်း သတ်မှတ်ပေးလိုက်ပါပြီ

// 2. Configuration 
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; 
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net";
const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

// 3. Function Definitions (router ခေါ်တဲ့အပိုင်းအောက် ရောက်နေခဲ့ရင်တောင် အလုပ်လုပ်အောင်)

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

async function generateTempMail(env: Env, chatId: number): Promise<string> {
  const length = 8;
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username = '';
  for (let i = 0; i < length; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  await env.MAIL_KV.put(username, chatId.toString(), { expirationTtl: 3600 });
  return `${username}@${TEMP_MAIL_DOMAIN}`;
}

async function handleTelegramWebhook(env: Env, request: Request): Promise<Response> {
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
      return new Response('OK', { status: 200 }); 
    }
    
    return new Response('OK', { status: 200 }); 

  } catch (e) {
    console.error('Webhook Handler Error:', e instanceof Error ? e.message : String(e));
    return new Response('OK (Error handled)', { status: 200 }); 
  }
}

// 4. Router Binding (Functions တွေ declare လုပ်ပြီးမှ bind လုပ်ပါ)
router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

// 5. Export Default (Worker ရဲ့ Entry Point များ)
export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // Email Address ရယူသော Fallback Logic
        
        let toEmail: string | null = null;
        
        // 1. message.to object (Array သို့မဟုတ် Single Object) မှ Address ကို စီမံခြင်း
        const toList = Array.isArray(message.to) ? message.to : [message.to];
        
        if (toList.length > 0 && toList[0] && toList[0].address) {
            toEmail = toList[0].address;
        }

        // 2. Delivered-To Header ကို fallback လုပ်ခြင်း
        if (!toEmail) {
            const deliveredToHeader = message.headers.get('Delivered-To');
            if (deliveredToHeader) {
                toEmail = deliveredToHeader.trim();
            }
        }
        
        // 3. Original-To Header ကို fallback လုပ်ခြင်း
        if (!toEmail) {
            const originalToHeader = message.headers.get('Original-To');
            if (originalToHeader) {
                // Address များကို ထပ်မံ စစ်ဆေးရန်လိုအပ်ပါက ဤနေရာတွင် logic ထပ်ထည့်နိုင်သည်
                toEmail = originalToHeader.trim(); 
            }
        }
        
        if (!toEmail) {
             console.error('Email Handler FATAL Error: Cannot determine valid To address after all attempts.');
             return message.setReject('Invalid destination email address received. (Final Address Cannot Be Resolved)'); 
        }

        const fromDisplay = message.from; 

        // 4. Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        const usernameMatch = toEmail.match(/^([^@]+)@/);

        let username: string;
        if (usernameMatch && usernameMatch[1]) {
            username = usernameMatch[1];
        } else {
            console.error('Email Handler FATAL Error: Cannot extract username from:', toEmail);
            return message.setReject(`Invalid destination format or username not found in ${toEmail}.`); 
        }

        // 5. KV မှ chat ID ကို ပြန်ရှာပါ
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
