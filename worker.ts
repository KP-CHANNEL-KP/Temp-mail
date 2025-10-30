// worker.ts (Final Structural Fix: message.to Array ကို တိုက်ရိုက် စီမံခြင်း)

// ... (Configuration, sendTelegramMessage, setWebhook, generateTempMail, handleTelegramWebhook functions များသည် ယခင်အတိုင်း ထားရှိပါမည်)

// 🚨 Syntax Error ဖြေရှင်းရန်: itty-router ကို ဤနေရာတွင် စတင်ထည့်သွင်းခြင်း
import { Router } from 'itty-router';

// ... (functions 2 မှ 5 အထိ ယခင်အတိုင်း ထားပါ)

// 6. Worker ရဲ့ Entry Point နှင့် Email Handler
const router = Router(); 

router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // 🚨 ပြင်ဆင်ထားသော အပိုင်း: message.to Array ကို စီမံခြင်း
        
        // 1. message.to object ကို ယူပြီး Array ဖြစ်နေရင် ပထမဆုံး Address ကို ရယူခြင်း
        const toList = (message.to instanceof Array ? message.to : [message.to]).filter(Boolean);
        let toEmail: string | null = null;
        
        if (toList.length > 0 && toList[0].address) {
            toEmail = toList[0].address;
        }

        // 2. message.to ကနေ မရရင် message.headers.get('Delivered-To') ကို ထပ်စစ်မယ်
        if (!toEmail) {
            const deliveredToHeader = message.headers.get('Delivered-To');
            if (deliveredToHeader) {
                // Delivered-To က email address သာ လာလေ့ရှိ
                toEmail = deliveredToHeader.trim();
            }
        }
        
        if (!toEmail) {
             console.error('Email Handler FATAL Error: Cannot determine valid To address after all attempts.');
             return message.setReject('Invalid destination email address received. (Final Address Cannot Be Resolved)'); 
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
            // ... (Telegram Message ပို့သောအပိုင်းသည် ယခင်အတိုင်း ထားရှိပါမည်)
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
