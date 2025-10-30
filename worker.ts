// worker.ts (Full Code - FINAL, All Fixes Included)

// 🚨 1. Imports and Router Initialization
import { Router } from 'itty-router';
const router = Router(); // <--- router is defined here

// 2. Configuration 
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; 
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; 
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
  fetch: router.handle, // <--- router is used here

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        let username: string | null = null;
        let finalToEmail: string | null = null;
        
        // Final fallback domain pattern to check against
        const DOMAIN_PATTERN = `@${TEMP_MAIL_DOMAIN}`; // @kponly.ggff.net

        // --- NEW ROBUST ADDRESS RESOLUTION LOGIC ---
        
        // 1. message.destination ကို စစ်ဆေးခြင်း
        if (message.destination && message.destination.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = message.destination;
        }

        // 2. Fallback: message.to (Array or Object) ကို အသုံးပြု၍ စစ်ဆေးခြင်း
        if (!finalToEmail) {
            const potentialToAddresses = [];
            
            // Collect addresses from message.to (may be array or object)
            const toList = message.to as unknown as Array<{ address: string, name: string }>;
            if (Array.isArray(toList)) {
                potentialToAddresses.push(...toList.map(item => item.address));
            } else if (toList && (toList as any).address) {
                potentialToAddresses.push((toList as any).address);
            }

            // Find the one that matches our TEMP_MAIL_DOMAIN
            const foundAddress = potentialToAddresses.find(addr => addr.endsWith(DOMAIN_PATTERN));
            if (foundAddress) {
                finalToEmail = foundAddress;
            }
        }
        
        // 3. FINAL FALLBACK: rcptTo ကို အသုံးပြု၍ စစ်ဆေးခြင်း (Log တွင် တွေ့ရှိရသော Property)
        if (!finalToEmail) {
             const messageWithRcptTo = message as unknown as { rcptTo?: string };
             if (messageWithRcptTo.rcptTo && messageWithRcptTo.rcptTo.endsWith(DOMAIN_PATTERN)) {
                 finalToEmail = messageWithRcptTo.rcptTo;
             }
        }
        
        // --- END ADDRESS RESOLUTION LOGIC ---

        // 4. To Address မရရှိသေးပါက Reject လုပ်ပါ (Final Rejection)
        if (!finalToEmail) {
             console.error('Email Handler FATAL Error: Cannot determine valid To address after all attempts. Rejecting.');
             return message.setReject('Invalid destination email address received. (Final Address Cannot Be Resolved)'); 
        }

        // 5. Final To Address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        const usernameMatch = finalToEmail.match(/^([^@]+)@/);

        if (usernameMatch && usernameMatch[1]) {
            username = usernameMatch[1];
        } else {
            // This should not happen if finalToEmail is valid, but as a safeguard
            console.error('Email Handler FATAL Error: Cannot extract username from:', finalToEmail);
            return message.setReject(`Invalid destination format or username not found in ${finalToEmail}.`); 
        }

        const fromDisplay = message.from; 

        // 6. KV မှ chat ID ကို ပြန်ရှာပါ
        const chatIdString = await env.MAIL_KV.get(username); 
        
        if (chatIdString) {
            const chatIdNumber = parseInt(chatIdString); 
            const subject = message.subject || "(No Subject)";
            const bodyText = message.text || "(Email Body is empty)";

            const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                 `*To:* \`${finalToEmail}\`\n` +
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
