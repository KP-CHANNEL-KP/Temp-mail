// worker.ts (Full Code - FINAL, All Fixes Included)

// 🚨 1. Imports and Router Initialization
import { Router } from 'itty-router';
const router = Router(); 

// 2. Configuration 
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; 
}
// Email Routing Rule မှာ သတ်မှတ်ထားသော Domain ဖြစ်ပါတယ် (Catch-all ကို ပြန်ထားပါ)
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; // <--- ဤနေရာကို kponly.ggff.net သို့ ပြန်ထားပါ
const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

// 3. Function Definitions 

const sendTelegramMessage = async (env: Env, chatId: number, text: string): Promise<void> => {
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
};

const setWebhook = async (env: Env, request: Request): Promise<Response> => {
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
};

const generateTempMail = async (env: Env, chatId: number): Promise<string> => {
  const length = 8;
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username = '';
  for (let i = 0; i < length; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  await env.MAIL_KV.put(username, chatId.toString(), { expirationTtl: 3600 }); 
  return `${username}@${TEMP_MAIL_DOMAIN}`;
};

const handleTelegramWebhook = async (env: Env, request: Request): Promise<Response> => {
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
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('Webhook Handler Error:', errorMessage);
    return new Response('OK (Error handled)', { status: 200 }); 
  }
};


// 4. Router Binding
router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

// 5. Export Default (Entry Points)
export default {
  fetch: router.handle, 

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        let username: string | null = null;
        let finalToEmail: string | null = null;
        
        const DOMAIN_PATTERN = `@${TEMP_MAIL_DOMAIN}`; 

        // 1. message.destination ကို ဦးစားပေး စစ်ဆေးခြင်း
        if (message.destination && message.destination.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = message.destination;
        }

        // 2. Fallback: message.to ကို အသုံးပြု၍ စစ်ဆေးခြင်း
        if (!finalToEmail) {
            const potentialToAddresses = [];
            const toList = message.to as unknown as Array<{ address: string, name: string }>;
            if (Array.isArray(toList)) {
                potentialToAddresses.push(...toList.map(item => item.address));
            } else if (toList && (toList as any).address) {
                potentialToAddresses.push((toList as any).address);
            }

            const foundAddress = potentialToAddresses.find(addr => addr.endsWith(DOMAIN_PATTERN));
            if (foundAddress) {
                finalToEmail = foundAddress;
            }
        }
        
        // 🚨 3. FINAL FALLBACK: rcptTo ကို တိုက်ရိုက်ယူခြင်း (Invocation Log မှ တွေ့ရှိရသော Property ကို အသုံးပြုခြင်း)
        if (!finalToEmail) {
             const messageWithRcptTo = message as unknown as { rcptTo?: string };
             if (messageWithRcptTo.rcptTo && messageWithRcptTo.rcptTo.endsWith(DOMAIN_PATTERN)) {
                 finalToEmail = messageWithRcptTo.rcptTo;
             }
        }
        
        // 4. To Address မရရှိသေးရင်တောင် Reject မလုပ်ဘဲ Log ထုတ်ပြီး ဆက်လုပ်ပါ
        if (!finalToEmail) {
             console.error('Email Handler Warning: To address still could not be determined. Attempting to extract from any available data.');
             // Reject လုပ်ခြင်းကို ဖယ်ရှားထားပါသည်
        }

        // 5. Final To Address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        if (finalToEmail) {
            const usernameMatch = finalToEmail.match(/^([^@]+)@/);

            if (usernameMatch && usernameMatch[1]) {
                username = usernameMatch[1];
            } else {
                console.error('Email Handler FATAL Error: Cannot extract username from:', finalToEmail);
                // Reject မလုပ်ဘဲ ထွက်ပါ
                return; 
            }
        } else {
             // finalToEmail မရှိရင်တောင် username ကို ထုတ်လို့မရနိုင်ပါဘူး။
             console.error('Email Handler FATAL Error: Cannot proceed without finalToEmail.');
             return;
        }

        const fromDisplay = message.from; 

        // 6. KV မှ chat ID ကို ပြန်ရှာပါ
        if (username) {
            const chatIdString = await env.MAIL_KV.get(username); 
            
            if (chatIdString) {
                const chatIdNumber = parseInt(chatIdString); 
                const subject = message.subject || "(No Subject)";
                const bodyText = message.text || "(Email Body is empty)";
                
                const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                     `*To:* \`${finalToEmail || 'Unknown'}\`\n` +
                                     `*From:* ${fromDisplay || 'Unknown Sender'}\n` + 
                                     `*Subject:* ${subject.substring(0, 100)}\n\n` +
                                     `*ကိုယ်ထည်အကျဉ်း:* ${bodyText.substring(0, 300)}...`; 

                await sendTelegramMessage(env, chatIdNumber, notification);
                
                console.log(`Email successfully forwarded to Telegram Chat ID: ${chatIdNumber} for user: ${username}`);
                return;
            } else {
                // Address တွေ့တယ်၊ KV ထဲမှာ သက်တမ်းကုန်နေပြီ
                console.log(`Rejecting expired email for user: ${username}`);
                message.setReject('This temporary email address has expired or is invalid.');
                return;
            }
        }


    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('Email Handler FATAL Error in try block:', errorMessage);
        // Catch block ထဲမှာ reject လုပ်ခြင်းကို ထားရှိပါ
        message.setReject(`Bot processing error: ${errorMessage.substring(0, 50)}...`); 
    }
  }
};
