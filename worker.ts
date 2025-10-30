// worker.ts (Original-To Header ကို အသုံးပြုထားသော Final Code)

// ... (Configuration, sendTelegramMessage, setWebhook, generateTempMail, handleTelegramWebhook functions များသည် ယခင်အတိုင်း ထားရှိပါမည်)

// 6. Worker ရဲ့ Entry Point နှင့် Email Handler
import { Router } from 'itty-router';
const router = Router();
// ... (router.post, router.get, router.all များသည် ယခင်အတိုင်း ထားရှိပါမည်)

export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // 🚨 ပြင်ဆင်ထားသော အပိုင်း: Original-To Header ကို အစားထိုး အသုံးပြုခြင်း
        const originalToHeader = message.headers.get('Original-To');

        if (!originalToHeader) {
             console.error('Email Handler FATAL Error: Original-To header is missing.');
             return message.setReject('Invalid destination email address received. (Missing Original-To Header)'); 
        }

        // 1. Header မှ Email Address ကို ခွဲထုတ်ခြင်း
        // "Name <user@domain.com>" သို့မဟုတ် "user@domain.com" ပုံစံရှိသောကြောင့်
        const toEmailMatch = originalToHeader.match(/<?([^>]+@[^>]+)>/) || originalToHeader.match(/([^ ]+@[^ ]+)/);
        
        let toEmail: string;
        if (toEmailMatch && toEmailMatch[1]) {
            toEmail = toEmailMatch[1].trim();
        } else {
             console.error('Email Handler FATAL Error: Could not parse toEmail from Original-To:', originalToHeader);
             return message.setReject(`Invalid Original-To Header format: ${originalToHeader}`); 
        }

        const fromDisplay = message.from; 

        // 2. Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        const usernameMatch = toEmail.match(/^([^@]+)@/);

        let username: string;
        if (usernameMatch && usernameMatch[1]) {
            username = usernameMatch[1];
        } else {
            console.error('Email Handler FATAL Error: Cannot extract username from:', toEmail);
            return message.setReject(`Invalid destination format or username not found in ${toEmail}.`); 
        }

        // 3. KV မှ chat ID ကို ပြန်ရှာပါ
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

// ... (ယခု code အသစ်ကို ပို့ပေးမည့်အတွက် အပေါ်က function body များကို လိုအပ်ပါက အပြည့်အစုံ ကူးထည့်ပေးနိုင်ပါသည်။)
