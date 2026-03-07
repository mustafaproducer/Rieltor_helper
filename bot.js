const { Telegraf, Markup } = require('telegraf');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- SOZLAMALAR ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8735420503:AAFghhgFx6pxmTwxxP3eENYu4J-MTOUzg04';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Environmentdan oladi

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Xotira
const userSessions = {};

// --- MENYU ---
const mainMenu = Markup.keyboard([
    ['📄 PDF Katalog', '🎬 Reels Ssenariy (AI)'],
    ['💧 Watermark & Edit', '📊 Analitika']
]).resize();

const cancelMenu = Markup.keyboard([['❌ Bekor qilish']]).resize();
const pdfMenu = Markup.keyboard([['✅ Tayyor (PDF yasash)', '❌ Bekor qilish']]).resize();

// --- START ---
bot.start((ctx) => {
    ctx.reply(
        `👋 Assalomu alaykum, ${ctx.from.first_name}!\n\n` +
        `🏠 **Rieltor AI Yordamchisi**ga xush kelibsiz.\n\n` +
        `Men sizga:\n` +
        `• 🎬 Uylar uchun **Viral Reels Ssenariylar** yozib beraman (AI).\n` +
        `• 📄 Uylardan chiroyli **PDF Katalog** yasayman.\n\n` +
        `Tanlang: 👇`,
        mainMenu
    );
});

// --- 1. REELS SSENARIY (AI) ---
bot.hears('🎬 Reels Ssenariy (AI)', (ctx) => {
    userSessions[ctx.from.id] = { step: 'WAITING_FOR_AI_INPUT' };
    ctx.reply(
        `🤖 **AI Ssenariy Generator**\n\n` +
        `Menga uy haqidagi ma'lumotni yuboring (Text yoki Rasm+Caption).\n` +
        `Men sizga **30-45 sekundlik Viral Reels Ssenariysi** yozib beraman.`,
        cancelMenu
    );
});

async function generateScript(text) {
    // FIX: gemini-pro (Eng barqaror)
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
    ROLE: You are an expert Real Estate Video Scriptwriter & Viral Hook Generator.
    INPUT DATA: "${text}"
    
    TASK: Create ONE high-performing Instagram Reels script (30-45s) in UZBEK language.
    
    STRATEGY:
    1. Analyze the input data.
    2. Choose the SINGLE BEST Hook Formula for this specific property.
    
    OUTPUT FORMAT (Use emojis, make it engaging):
    
    🎣 **HOOK**
    (0-3 sec)
    [Visual]: ...
    [Audio]: ...
    
    😔 **PROBLEM / AGITATION**
    (3-15 sec)
    [Visual]: ...
    [Audio]: ...
    
    🏠 **SOLUTION / TOUR**
    (15-35 sec)
    [Visual]: ...
    [Audio]: ... (Highlight key features)
    
    💰 **OFFER & CTA**
    (35-45 sec)
    [Visual]: ...
    [Audio]: (Price & Call to action)
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
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

    if (session.step === 'WAITING_FOR_AI_INPUT') {
        if (!text) return ctx.reply('⚠️ Iltimos, uy haqida ma\'lumot (matn) ham yozing.');
        
        ctx.reply('⏳ **AI Ssenariy yozmoqda...** (Biroz kuting)');
        try {
            const script = await generateScript(text);
            ctx.reply(script, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error(e);
            ctx.reply(`❌ AI xatosi: ${e.message}`);
        }
    }

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
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 10000);

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
