const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Groq = require('groq-sdk');

// --- SOZLAMALAR ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8735420503:AAFghhgFx6pxmTwxxP3eENYu4J-MTOUzg04';
const GROQ_API_KEY = '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';

const bot = new Telegraf(BOT_TOKEN);
const groq = new Groq({ apiKey: GROQ_API_KEY });
const userSessions = {};

// --- MENYU ---
const mainMenu = Markup.keyboard([
    ['📄 PDF Katalog', '🎬 Reels Ssenariy (AI)'],
    ['💧 Watermark & Edit', '📊 Analitika']
]).resize();

const pdfMenu = Markup.keyboard([['✅ Tayyor (PDF yasash)', '❌ Bekor qilish']]).resize();
const cancelMenu = Markup.keyboard([['❌ Bekor qilish']]).resize();

// --- START ---
bot.start((ctx) => {
    ctx.reply(
        `👋 Assalomu alaykum, ${ctx.from.first_name}!\n\n` +
        `🏠 **Rieltor AI (Groq/Llama 3)**ga xush kelibsiz.\n\n` +
        `Men sizga:\n` +
        `• 🎬 Uylar uchun **Viral Reels Ssenariylar** yozib beraman (AI).\n` +
        `• 📄 Uylardan chiroyli **PDF Katalog** yasayman.\n\n` +
        `Tanlang: 👇`,
        mainMenu
    );
});

// --- 1. AI REELS SSENARIY (GROQ) ---
bot.hears('🎬 Reels Ssenariy (AI)', (ctx) => {
    userSessions[ctx.from.id] = { step: 'WAITING_FOR_AI' };
    ctx.reply(
        `🤖 **AI Ssenariy Generator (Llama 3)**\n\n` +
        `Menga uy haqidagi ma'lumotni yuboring (Text yoki Rasm+Caption).\n` +
        `Men sizga **30-45 sekundlik Viral Reels Ssenariysi** yozib beraman.`,
        cancelMenu
    );
});

async function generateScriptGroq(text) {
    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `You are an expert Real Estate Video Scriptwriter. 
                Task: Write a Viral Instagram Reels script (30-45s) in UZBEK language based on the property details.
                
                Structure:
                1. 🔥 HOOK (0-3s): Catchy opening.
                2. 🏠 TOUR/FEATURES: Highlight key rooms/benefits.
                3. 💰 PRICE & VALUE: Why it's a good deal.
                4. 📞 CTA: Call to action.
                
                Format: Use emojis. Be energetic. Output ONLY the script.`
            },
            {
                role: "user",
                content: text
            }
        ],
        // FIX: Model nomi yangilandi (llama3-70b-8192)
        model: "llama3-70b-8192", 
        temperature: 0.7,
        max_tokens: 1024,
    });
    return chatCompletion.choices[0]?.message?.content || "Xatolik yuz berdi.";
}

// --- 2. PDF KATALOG ---
bot.hears('📄 PDF Katalog', (ctx) => {
    userSessions[ctx.from.id] = { step: 'COLLECTING_PDF', items: [] };
    ctx.reply(`📂 **PDF Katalog rejimi.**\nUylarni forward qiling (Rasm+Matn). Tugatgach "✅ Tayyor" ni bosing.`, pdfMenu);
});

bot.hears('✅ Tayyor (PDF yasash)', async (ctx) => {
    const session = userSessions[ctx.from.id];
    if (!session || session.items.length === 0) return ctx.reply('⚠️ Hali hech narsa yubormadingiz.', pdfMenu);
    ctx.reply('⏳ PDF tayyorlanmoqda...');
    
    try {
        const doc = new PDFDocument();
        const pdfPath = path.join(__dirname, `katalog_${ctx.from.id}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        doc.fontSize(24).text('🏠 Haftalik Uylar Katalogi', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Rieltor: ${ctx.from.first_name}`, { align: 'center' });
        doc.moveDown(2);

        for (const item of session.items) {
            doc.addPage();
            if (item.photoUrl) {
                try {
                    const response = await axios.get(item.photoUrl, { responseType: 'arraybuffer' });
                    doc.image(Buffer.from(response.data, 'binary'), { fit: [500, 300], align: 'center' });
                    doc.moveDown(15);
                } catch (e) {}
            }
            if (item.caption) doc.fontSize(12).text(item.caption, { align: 'left' });
        }
        doc.end();

        writeStream.on('finish', async () => {
            await ctx.replyWithDocument({ source: pdfPath, filename: 'Katalog.pdf' });
            fs.unlinkSync(pdfPath);
            delete userSessions[ctx.from.id];
            ctx.reply('✅ Tayyor!', mainMenu);
        });
    } catch (e) {
        ctx.reply('❌ Xatolik.', mainMenu);
    }
});

bot.hears('❌ Bekor qilish', (ctx) => {
    delete userSessions[ctx.from.id];
    ctx.reply('Bekor qilindi.', mainMenu);
});

// --- MESSAGE HANDLER ---
bot.on(['text', 'photo'], async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (!session) return; 

    const text = ctx.message.caption || ctx.message.text || '';

    // AI GROQ
    if (session.step === 'WAITING_FOR_AI') {
        if (!text) return ctx.reply('⚠️ Matn yozing!');
        ctx.reply('⏳ **Yozmoqda (Groq Llama 3)...**');
        try {
            const script = await generateScriptGroq(text);
            ctx.reply(script, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error(e);
            ctx.reply(`❌ Xato: ${e.message}`);
        }
    }
    // PDF
    else if (session.step === 'COLLECTING_PDF') {
        const item = { caption: text };
        if (ctx.message.photo) {
            const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            const fileLink = await ctx.telegram.getFileLink(photoId);
            item.photoUrl = fileLink.href;
        }
        session.items.push(item);
        ctx.reply(`✅ Qo'shildi (${session.items.length}). Yana yuboring.`);
    }
});

// --- RENDER PORT ---
const http = require('http');
http.createServer((req, res) => res.end('Bot is Live')).listen(process.env.PORT || 10000);

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
