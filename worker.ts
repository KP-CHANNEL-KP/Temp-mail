// worker.ts (Email Handler တွင် ပြင်ဆင်ထားသော အပိုင်းသာ)

// ... (Functions 1 မှ 5 နှင့် router setup များသည် ယခင်အတိုင်း ထားရှိပါမည်)

// 4. Export Default (Worker ရဲ့ Entry Point များ)
export default {
  fetch: router.handle,

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        // 🚨 ပြင်ဆင်ထားသော အပိုင်း: message.to ကနေ Address ကို ရယူခြင်း
        
        let toEmail: string | null = null;
        
        // 1. message.to object (array of {address, name} or single {address, name}) ကို စီမံခြင်း
        const toList = Array.isArray(message.to) ? message.to : [message.to];
        
        // ပထမဆုံး to object ရဲ့ address ကို ရယူပါ
        if (toList.length > 0 && toList[0] && toList[0].address) {
            toEmail = toList[0].address;
        }

        // 2. To Address မရသေးရင် Delivered-To Header ကို fallback လုပ်ခြင်း
        if (!toEmail) {
            const deliveredToHeader = message.headers.get('Delivered-To');
            if (deliveredToHeader) {
                // Delivered-To က များသောအားဖြင့် email address သီးသန့် လာပါတယ်
                toEmail = deliveredToHeader.trim();
            }
        }
        
        // 3. Original-To Header ကို fallback လုပ်ခြင်း
        // Helper function (if needed, but let's assume direct extraction is safer for now)
        if (!toEmail) {
            const originalToHeader = message.headers.get('Original-To');
            if (originalToHeader) {
                // ... extractEmail logic from previous version should be here if needed for parsing "Name <email@domain>"
                // For simplicity, let's just use the header value if it exists
                toEmail = originalToHeader.trim();
            }
        }
        
        if (!toEmail) {
             console.error('Email Handler FATAL Error: Cannot determine valid To address after all attempts.');
             // အီးမေးလ်ကို Reject လုပ်ပါ
             return message.setReject('Invalid destination email address received. (Final Address Cannot Be Resolved)'); 
        }

        const fromDisplay = message.from; 

        // 4. Email address မှ username ကို ခိုင်မာစွာ ခွဲထုတ်ခြင်း
        // ဥပမာ: "lt4nmfjv@kponly.ggff.net" ထဲက "lt4nmfjv" ကို ယူပါ
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
        // ... (Telegram Message ပို့သောအပိုင်းသည် ယခင်အတိုင်း ထားရှိပါမည်)
        
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
