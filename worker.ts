// worker.ts (FINAL & COMPLETE VERSION - Copyable Mono-Font Email Fix)

// ... (Imports and Configuration are the same)
import { Router } from 'itty-router';
const router = Router(); 
// ... (Env, Domain, API definitions are the same)

// 3. Function Definitions 

const sendTelegramMessage = async (env: Env, chatId: number, text: string): Promise<void> => {
  const url = `${TELEGRAM_API(env.BOT_TOKEN)}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      // 🚨 FIX: Markdown (Inline Code) ကို ပြန်လည် အသုံးပြုရန် parse_mode ပြန်ထည့်ပါ
      parse_mode: 'Markdown',
    }),
  });

  if (!response.ok) {
    console.error(`Failed to send Telegram message: ${response.status} ${response.statusText}`);
  }
};

// ... (setWebhook function is the same)
// ... (generateTempMail function is the same)

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
        // 🚨 FIX: Email Address ကို Markdown Inline Code (\`...\`) ဖြင့် ပြောင်းလဲ
        const message = `🎉 **Temp Mail Address:** \n\`${tempMail}\`\n\n` +
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


// ... (Router Binding is the same)
// ... (export default and email function starts here)

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
// ... (All Header & Username Extraction Logic remains the same)
// ...
        // 5. KV မှ chat ID ကို ပြန်ရှာပါ
        if (username) {
            const chatIdString = await env.MAIL_KV.get(username); 
            
            if (chatIdString) {
                const chatIdNumber = parseInt(chatIdString); 
                
                // Subject ကို Headers ကနေ တိုက်ရိုက် ဖတ်ယူခြင်း
                const subject = message.headers.get('Subject') || "(No Subject)";
                
                // Raw Body Extraction Logic (Remains the same as before)
                let bodyText = message.text || "(Email Body is empty)";
                
                if (bodyText === "(Email Body is empty)") {
                   // ... (Raw Content Logic)
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
                
                // 🚨 FIX: Notification Message ကို Markdown (Inline Code မသုံးပါ) ဖြင့် ပြန်ပြင်
                const notification = `📧 **Email အသစ် ဝင်လာပြီ**\n\n` + 
                                     `*To:* ${finalToEmail || 'Unknown'}\n` +
                                     `*From:* ${fromDisplay || 'Unknown Sender'}\n` + 
                                     `*Subject:* ${subject.substring(0, 100)}\n\n` +
                                     `*ကိုယ်ထည်အကျဉ်း:* ${bodyText.substring(0, 300)}...`; 

                await sendTelegramMessage(env, chatIdNumber, notification);
                
                // ... (Console Log is the same)
                return;
            } 
            // ... (else block and catch block remain the same)
// ...
