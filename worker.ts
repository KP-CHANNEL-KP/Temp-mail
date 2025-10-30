// worker.ts (Header နှစ်ခုလုံးကို စစ်ဆေးပြီး Email Address ရယူသော Final Code)

// ... (Configuration, sendTelegramMessage, setWebhook, generateTempMail, handleTelegramWebhook functions များသည် ယခင်အတိုင်း ထားရှိပါမည်)

// 6. Worker ရဲ့ Entry Point နှင့် Email Handler
// ... (router.post, router.get, router.all များသည် ယခင်အတိုင်း ထားရှိပါမည်)

export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // 🚨 ပြင်ဆင်ထားသော အပိုင်း: Fallback Mechanism ဖြင့် To Address ရယူခြင်း
        
        let toAddressSource: string | null = null;
        
        // 1. message.to.address ကို အရင်စစ်ဆေးခြင်း (ပိုမိုလုံခြုံသည်)
        if (message.to?.address) {
            toAddressSource = message.to.address;
        } 
        
        // 2. မပါလာလျှင် Original-To Header ကို အစားထိုးစစ်ဆေးခြင်း
        if (!toAddressSource) {
            const originalToHeader = message.headers.get('Original-To');
            if (originalToHeader) {
                // Header မှ Email Address ကို ခွဲထုတ်ခြင်း
                // "Name <user@domain.com>" သို့မဟုတ် "user@domain.com" ပုံစံရှိသောကြောင့်
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
