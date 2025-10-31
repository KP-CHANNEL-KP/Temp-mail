// worker.ts (FINAL FINAL FINAL VERSION with Simplified Markdown Fix)

// 🚨 1. Imports and Router Initialization
import { Router } from 'itty-router';
const router = Router(); 

// 2. Configuration 
interface Env {
  BOT_TOKEN: string; 
  WEBHOOK_SECRET: string; 
  MAIL_KV: KVNamespace; 
}
const TEMP_MAIL_DOMAIN = "kponly.ggff.net"; 
const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

// 3. Function Definitions 

// 🚨 ULTIMATE FIX: Markdown V2 Escape Function (Backslash ကိုပါ Escape လုပ်ခြင်း)
const escapeMarkdownV2 = (text: string): string => {
  // Markdown V2 တွင် Reserved Characters အားလုံးကို Escape လုပ်သည်။
  return text.replace(/([_*[\]()~>#+=|{}.!-\\])/g, '\\$1');
};

const sendTelegramMessage = async (env: Env, chatId: number, text: string): Promise<void> => {
  const url = `${TELEGRAM_API(env.BOT_TOKEN)}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      // 🚨 FIX: MarkdownV2 ကို အသုံးပြုပါသည်
      parse_mode: 'MarkdownV2', 
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Failed to send Telegram message: ${response.status} ${response.statusText}. Response: ${errorBody}`);
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
        // FIX: Mono Font/Copyable Email Address
        const message = `🎉 \*Temp Mail Address:\* \n\`${tempMail}\`\n\n` +
                        `ဒီအီးမေးလ်က တစ်နာရီကြာအောင် သက်တမ်းကုန်ဆုံးပါမယ်။`;
        await sendTelegramMessage(env, chatId, message);
      } else if (text === '/start') {
        // FIX: MarkdownV2 ဖြင့် စာလုံးများကို Escape လုပ်ခြင်း
        const message = `👋 Hi\! ယာယီအီးမေးလ် လိပ်စာတစ်ခု ဖန်တီးဖို့အတွက် /generate လို့ ရိုက်ထည့်ပါ။`;
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


// 4. Router Binding (HTTP Request Entry Point)
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

        // Helper function to extract email from potential header values (No changes)
        const extractAddress = (headerValue: string | null): string | null => {
            if (!headerValue) return null;
            const candidates = headerValue.split(/[;,]/).map(s => s.trim());
            for (const candidate of candidates) {
                if (candidate.endsWith(DOMAIN_PATTERN)) {
                    const match = candidate.match(/<([^>]+)>/) || candidate.match(/(\S+@\S+)/);
                    if (match) {
                        const email = match[1] || match[0];
                        if (email.endsWith(DOMAIN_PATTERN)) {
                            return email;
                        }
                    }
                }
            }
            return null;
        };
        
        // Header & Fallback Logic (No changes)
        const headerNames = [
            'to', 'cc', 'bcc', 'delivered-to', 
            'x-forwarded-to', 'x-original-to', 'original-recipient', 'envelope-to' 
        ];
        
        for (const name of headerNames) {
            const headerValue = message.headers.get(name);
            const extracted = extractAddress(headerValue);
            if (extracted) {
                finalToEmail = extracted;
                break; 
            }
        }
        
        if (!finalToEmail && message.destination && message.destination.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = message.destination;
        }
        
        const messageWithRcptTo = message as unknown as { rcptTo?: string };
        if (!finalToEmail && messageWithRcptTo.rcptTo && messageWithRcptTo.rcptTo.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = messageWithRcptTo.rcptTo;
        }
        
        // Final Check and Username Extraction Logic (No changes)
        if (finalToEmail) {
            if (finalToEmail === `bot10temp@${TEMP_MAIL_DOMAIN}`) {
                 return; 
            }
            const usernameMatch = finalToEmail.match(/^([^@]+)@/);

            if (usernameMatch && usernameMatch[1]) {
                username = usernameMatch[1];
            } else {
                console.error('Email Handler FATAL Error: Cannot extract username from:', finalToEmail);
                return; 
            }
        } else {
             console.error('Email Handler FATAL Error: Cannot proceed without finalToEmail.');
             return;
        }

        const fromDisplay = message.from; 

        // 5. KV မှ chat ID ကို ပြန်ရှာပါ
        if (username) {
            const chatIdString = await env.MAIL_KV.get(username); 
            
            if (chatIdString) {
                const chatIdNumber = parseInt(chatIdString); 
                
                const subject = message.headers.get('Subject') || "(No Subject)";
                
                // Email Body (Plain Text) Extraction Logic (No changes)
                let bodyText = message.text || "(Email Body is empty)";
                
                if (bodyText === "(Email Body is empty)") {
                   try {
                        const rawContent = await new Response(message.raw).text();
                        const bodyMatch = rawContent.match(/Content-Type: text\/plain;[\s\S]*?\r?\n\r?\n([\s\S]*)/i);
                        if (bodyMatch && bodyMatch[1]) {
                            bodyText = bodyMatch[1].trim();
                            bodyText = bodyText.split(/On\s+.*wrote:|\r?\n-{2,}\r?\n/i)[0].trim();
                        }
                    } catch (e) {
                        console.error("Error reading raw email body:", e);
                    }
                }

                // 🚨 Escape Logic
                const escapedBodyText = escapeMarkdownV2(bodyText);
                const escapedSubject = escapeMarkdownV2(subject);
                
                // 🚨 FIX: To/From ကို Mono Font (Inline Code) ထဲထည့်ဖို့အတွက် စာသားကို escape လုပ်ရပါမယ်။
                const escapedFrom = escapeMarkdownV2(fromDisplay);
                const escapedTo = escapeMarkdownV2(finalToEmail);

                // 🚨 FIX: Notification Message (Email Address ကို Mono Font ဖြင့်)
                const notification = `📧 \*Email အသစ် ဝင်လာပြီ\*\n\n` + 
                                     `*To:* \`${escapedTo || 'Unknown'}\`\n` + // Mono Font
                                     `*From:* \`${escapedFrom || 'Unknown Sender'}\`\n` + // Mono Font
                                     `*Subject:* ${escapedSubject.substring(0, 100)}\n\n` +
                                     `*ကိုယ်ထည်အကျဉ်း:* ${escapedBodyText.substring(0, 300)}...`; 

                await sendTelegramMessage(env, chatIdNumber, notification);
                
                console.log(`Email successfully forwarded to Telegram Chat ID: ${chatIdNumber} for user: ${username}`);
                return;
            } else {
                console.log(`Rejecting expired email for user: ${username}`);
                return;
            }
        }


    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('Email Handler FATAL Error in try block:', errorMessage);
    }
  }
};
