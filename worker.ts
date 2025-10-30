// worker.ts (Header သုံးခုလုံးကို စစ်ဆေးသော Final Code)

// ... (Configuration, sendTelegramMessage, setWebhook, generateTempMail, handleTelegramWebhook functions များသည် ယခင်အတိုင်း ထားရှိပါမည်)

// 6. Worker ရဲ့ Entry Point နှင့် Email Handler
// ... (router.post, router.get, router.all များသည် ယခင်အတိုင်း ထားရှိပါမည်)

export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // 🚨 ပြင်ဆင်ထားသော အပိုင်း: Header ၃ ခုလုံးကို စစ်ဆေးခြင်း (Ultimate Fallback)
        
        let toAddressSource: string | null = null;
        
        // Helper function to extract email from header string
        const extractEmail = (headerValue: string): string | null => {
            // "Name <user@domain.com>" or "user@domain.com"
            const match = headerValue.match(/<?([^>]+@[^>]+)>/) || headerValue.match(/([^ ]+@[^ ]+)/);
            return match && match[1] ? match[1].trim() : null;
        };

        // 1. message.to.address ကို အရင်စစ်ဆေးခြင်း
        if (message.to?.address) {
            toAddressSource = message.to.address;
        } 
        
        // 2. မပါလာလျှင် Original-To Header ကို စစ်ဆေးခြင်း
        if (!toAddressSource) {
            const originalToHeader = message.headers.get('Original-To');
            if (originalToHeader) {
                toAddressSource = extractEmail(originalToHeader);
            }
        }
        
        // 3. Original-To လဲမပါလာလျှင် Delivered-To Header ကို စစ်ဆေးခြင်း
        if (!toAddressSource) {
            const deliveredToHeader = message.headers.get('Delivered-To');
            if (deliveredToHeader) {
                // Delivered-To က email address သာ လာလေ့ရှိ
                toAddressSource = deliveredToHeader.trim();
            }
        }
        
        const toEmail = toAddressSource;

        if (!toEmail) {
             console.error('Email Handler FATAL Error: Cannot find a valid To address from any source (to, Original-To, Delivered-To).');
             return message.setReject('Invalid destination email address received. (To Address Cannot Be Resolved)'); 
        }

        const fromDisplay = message.from; 

        // 4. Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        // Note: The logic assumes the address ends with @kponly.ggff.net
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
