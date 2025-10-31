// ... (All Function Definitions: sendTelegramMessage, setWebhook, generateTempMail, handleTelegramWebhook are the same)

// 4. Router Binding (HTTP Request Entry Point)
router
  .post('/webhook', (request, env) => handleTelegramWebhook(env as Env, request))
  .get('/registerWebhook', (request, env) => setWebhook(env as Env, request))
  .all('*', () => new Response('Not Found', { status: 404 }));

// 5. Export Default (Entry Points)
// 🚨 FIX: email function ကို Object property syntax ဖြင့် ပြန်လည်ရေးသားခြင်း
export default {
  fetch: router.handle, 

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
        let username: string | null = null;
        let finalToEmail: string | null = null;
        
        const DOMAIN_PATTERN = `@${TEMP_MAIL_DOMAIN}`; 

        // Helper function to extract email from potential header values
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
        
        // 1. Check all possible standard and forwarded headers (Logic is the same)
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
        
        // 2 & 3. Fallbacks (Logic is the same)
        if (!finalToEmail && message.destination && message.destination.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = message.destination;
        }
        
        const messageWithRcptTo = message as unknown as { rcptTo?: string };
        if (!finalToEmail && messageWithRcptTo.rcptTo && messageWithRcptTo.rcptTo.endsWith(DOMAIN_PATTERN)) {
            finalToEmail = messageWithRcptTo.rcptTo;
        }
        
        // 4. Final Check and Username Extraction (Logic is the same)
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
                
                // Raw Body Extraction Logic (Logic is the same)
                let bodyText = message.text || "(Email Body is empty)";
                
                if (bodyText === "(Email Body is empty)") {
                   try {
                        const rawContent = await new Response(message.raw).text();
                        const bodyMatch = rawContent.match(/Content-Type: text\/plain;[\s\S]*?\r?\n\r?\n([\s\S]*)/i);
                        if (bodyMatch && bodyMatch[1]) {
                            bodyText = bodyMatch[1].trim();
                            bodyText = bodyText.split(/On\s+.*wrote:|\r?\n-{2,}\r?\n/i)[0].trim();
                        } else {
                            bodyText = "Could not parse email body from raw content.";
                        }
                    } catch (e) {
                        console.error("Error reading raw email body:", e);
                        bodyText = "(Error reading raw email body)";
                    }
                }
                
                // Notification Message (Logic is the same)
                const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                     `*To:* ${finalToEmail || 'Unknown'}\n` +
                                     `*From:* ${fromDisplay || 'Unknown Sender'}\n` + 
                                     `*Subject:* ${subject.substring(0, 100)}\n\n` +
                                     `*ကိုယ်ထည်အကျဉ်း:* ${bodyText.substring(0, 300)}...`; 

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
