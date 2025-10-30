// worker.ts (Full Code - ONLY the email function is modified for robust address parsing)

// ... (Router, Env, Functions အပိုင်းများ အားလုံး အရင်အတိုင်း ရှိနေပါမည်)
// ...

// 5. Export Default (Entry Points)
export default {
  fetch: router.handle,

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
