// worker.ts (Full Code - FINAL CONTENT FIX)
// ... (All functions before export default remain the same as the FINAL TWEAK version)

// ... (sendTelegramMessage function should be the plain text version from the previous step)
const sendTelegramMessage = async (env: Env, chatId: number, text: string): Promise<void> => {
  const url = `${TELEGRAM_API(env.BOT_TOKEN)}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      // Markdown Mode ကို ဖျက်ထားသည်
    }),
  });
  // ... (error handling remains the same)
};

// ... (fetch and router binding remain the same)

export default {
  fetch: router.handle, 

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        let username: string | null = null;
        let finalToEmail: string | null = null;
        
        const DOMAIN_PATTERN = `@${TEMP_MAIL_DOMAIN}`; 

        // Helper function to extract address (remains the same as FINAL TWEAK)
        const extractAddress = (headerValue: string | null): string | null => {
            if (!headerValue) return null;
            // ... (extraction logic remains the same)
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
        
        // 1. Check all possible standard and forwarded headers (remains the same)
        const headerNames = [
            'to', 'cc', 'bcc', 'delivered-to', 
            'x-forwarded-to', 'x-original-to', 'original-recipient', 'envelope-to' // envelope-to ကို ထပ်ထည့်လိုက်သည်
        ];
        
        for (const name of headerNames) {
            const headerValue = message.headers.get(name);
            const extracted = extractAddress(headerValue);
            if (extracted) {
                finalToEmail = extracted;
                console.log(`Found address in header: ${name} -> ${finalToEmail}`);
                break; 
            }
        }
        
        // 2. Fallback: message.destination and 3. rcptTo (remains the same)
        if (!finalToEmail && message.destination && message.destination.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = message.destination;
            console.log(`Found address in message.destination: ${finalToEmail}`);
        }
        
        const messageWithRcptTo = message as unknown as { rcptTo?: string };
        if (!finalToEmail && messageWithRcptTo.rcptTo && messageWithRcptTo.rcptTo.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = messageWithRcptTo.rcptTo;
            console.log(`Found address in rcptTo: ${finalToEmail}`);
        }
        
        // 4. Final Check and Username Extraction (remains the same)
        if (finalToEmail) {
            if (finalToEmail === `bot10temp@${TEMP_MAIL_DOMAIN}`) {
                 // Static bot address ဖြစ်နေရင် reject လုပ်မယ့်အစား၊ error ပေးပြီး ကျော်သွားပါမယ်။
                 console.error('Email Handler Warning: finalToEmail is the static bot address, cannot find original recipient.');
                 return; // KV key မရှိလို့ စာမပို့ပဲ ရပ်လိုက်ပါမယ်
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
             // FinalToEmail မတွေ့ရင် Reject လုပ်စရာ မလိုတော့ပါ
             return;
        }

        const fromDisplay = message.from; 

        // 5. KV မှ chat ID ကို ပြန်ရှာပါ
        if (username) {
            const chatIdString = await env.MAIL_KV.get(username); 
            
            if (chatIdString) {
                const chatIdNumber = parseInt(chatIdString); 
                
                // 🚨 Message Subject ကို message.headers.get('Subject') ဖြင့် တိုက်ရိုက်ဖတ်ခြင်း
                const subject = message.headers.get('Subject') || "(No Subject)";
                
                // 🚨 message.text မရရင် message.raw ကို Stream ဖြင့် ဖတ်ခြင်း (Cloudflare Limitations ကြောင့် ရှောင်ပါမည်)
                // ယာယီအားဖြင့် message.text ကိုပဲ အားကိုးပါမယ်။
                const bodyText = message.text || "(Email Body is empty)";
                
                // 🚨 Plain Text Message Format (Markdown မပါဝင်ပါ)
                const notification = `📧 Email အသစ် ဝင်လာပြီ\n\n` + 
                                     `To: ${finalToEmail || 'Unknown'}\n` +
                                     `From: ${fromDisplay || 'Unknown Sender'}\n` + 
                                     `Subject: ${subject.substring(0, 100)}\n\n` +
                                     `ကိုယ်ထည်အကျဉ်း: ${bodyText.substring(0, 300)}...`; 

                await sendTelegramMessage(env, chatIdNumber, notification);
                
                console.log(`Email successfully forwarded to Telegram Chat ID: ${chatIdNumber} for user: ${username}`);
                return;
            } else {
                // Address တွေ့တယ်၊ KV ထဲမှာ သက်တမ်းကုန်နေပြီ
                console.log(`Rejecting expired email for user: ${username}`);
                // Reject မလုပ်ဘဲ ဖျောက်လိုက်ပါမည်။
                return;
            }
        }


    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('Email Handler FATAL Error in try block:', errorMessage);
        // Catch block ထဲမှာ Reject မလုပ်တော့ပါ
    }
  }
};
