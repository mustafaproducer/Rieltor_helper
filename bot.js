const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// --- SOZLAMALAR ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8735420503:AAFghhgFx6pxmTwxxP3eENYu4J-MTOUzg04';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Environmentdan oladi

const bot = new Telegraf(BOT_TOKEN);
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
        `🏠 **Rieltor AI (Gemini Pro)**ga xush kelibsiz.\n\n` +
        `Men sizga:\n` +
        `• 🎬 Uylar uchun **Viral Reels Ssenariylar** yozib beraman (AI).\n` +
        `• 📄 Uylardan chiroyli **PDF Katalog** yasayman.\n\n` +
        `Tanlang: 👇`,
        mainMenu
    );
});

// --- 1. REELS SSENARIY (AI - REST API) ---
bot.hears('🎬 Reels Ssenariy (AI)', (ctx) => {
    userSessions[ctx.from.id] = { step: 'WAITING_FOR_AI_INPUT' };
    ctx.reply(
        `🤖 **AI Ssenariy Generator (Gemini)**\n\n` +
        `Menga uy haqidagi ma'lumotni yuboring (Text yoki Rasm+Caption).\n` +
        `Men sizga **30-45 sekundlik Viral Reels Ssenariysi** yozib beraman.`,
        cancelMenu
    );
});

async function generateScript(text) {
    const prompt = `
    ROLE: Professional Real Estate Video Scriptwriter & Viral Content Creator.
    TASK: Write a 30-45s Instagram Reels script in engaging UZBEK language based on the input below.
    
    INPUT: "${text}"
    
    OUTPUT FORMAT:
    
    🔥 **HOOK (0-3s)**
    [Visual]: (Describe camera shot)
    [Audio]: (Catchy opening phrase)
    
    🏠 **TOUR & FEATURES (3-20s)**
    [Visual]: (Show rooms/yard)
    [Audio]: (Describe benefits enthusiastically)
    
    💰 **VALUE & PRICE (20-35s)**
    [Visual]: (Show text overlay)
    [Audio]: (Mention price and why it's worth it)
    
    📞 **CALL TO ACTION (35-45s)**
    [Visual]: (Show contact info)
    [Audio]: (Tell them to call now)
    
    TONE: Energetic, Professional, Persuasive. USE EMOJIS!
    `;

    try {
        // FIX: gemini-pro modeli ishlatiladi
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        if (response.data.candidates && response.data.candidates.length > 0) {
             return response.data.candidates[0].content.parts[0].text;
        } else {
             return "❌ AI javob bermadi (Bo'sh javob).";
        }

    } catch (error) {
        console.error("Gemini Error:", error.response ? error.response.data : error.message);
        return `❌ AI Xatosi: ${error.message}`;
    }
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

    // 1. AI REJIMI
    if (session.step === 'WAITING_FOR_AI_INPUT') {
        if (!text) return ctx.reply('⚠️ Iltimos, uy haqida ma\'lumot (matn) ham yozing.');
        
        ctx.reply('⏳ **AI Ssenariy yozmoqda (Gemini)...**');
        try {
            const script = await generateScript(text);
            ctx.reply(script); // Markdown siz yuboriladi
        } catch (e) {
            console.error(e);
            ctx.reply(`❌ Xato: ${e.message}`);
        }
    }

    // 2. PDF REJIMI
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
