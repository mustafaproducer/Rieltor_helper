const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');

const BOT_TOKEN = process.env.BOT_TOKEN || '8735420503:AAFghhgFx6pxmTwxxP3eENYu4J-MTOUzg04';
// MENING KALITIM (Hardcoded)
const GEMINI_API_KEY = 'AIzaSyDV5XssWVFbwMwsxp7OE-d9Rqpeb8fbDBE';

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const userSessions = {};

// START
bot.start((ctx) => {
ctx.reply(
`👋 Assalomu alaykum, ${ctx.from.first_name}!\n🏠 **Rieltor AI**ga xush kelibsiz.\n\nTanlang: 👇`,
Markup.keyboard([['📄 PDF Katalog', '🎬 Reels Ssenariy (AI)'], ['❌ Bekor qilish']]).resize()
);
});

// AI SSENARIY
bot.hears('🎬 Reels Ssenariy (AI)', (ctx) => {
userSessions[ctx.from.id] = { step: 'WAITING_FOR_AI' };
ctx.reply('🤖 Menga uy haqidagi matnni yuboring.');
});

// PDF KATALOG
bot.hears('📄 PDF Katalog', (ctx) => {
userSessions[ctx.from.id] = { step: 'COLLECTING_PDF', items: [] };
ctx.reply('📂 Uylarni forward qiling. Tugatgach /done deb yozing.');
});

bot.command('done', async (ctx) => {
const session = userSessions[ctx.from.id];
if (!session || session.items.length === 0) return ctx.reply('⚠️ Hali hech narsa yubormadingiz.');
ctx.reply('⏳ PDF tayyorlanmoqda...');

try {
const doc = new PDFDocument();
const pdfPath = path.join(__dirname, `katalog_${ctx.from.id}.pdf`);
const writeStream = fs.createWriteStream(pdfPath);
doc.pipe(writeStream);
doc.fontSize(20).text('Uylar Katalogi', { align: 'center' });

for (const item of session.items) {
doc.addPage();
if (item.photoUrl) {
try {
const response = await axios.get(item.photoUrl, { responseType: 'arraybuffer' });
doc.image(Buffer.from(response.data, 'binary'), { fit: [500, 300], align: 'center' });
} catch(e){}
}
if (item.caption) doc.text(item.caption);
}
doc.end();

writeStream.on('finish', async () => {
await ctx.replyWithDocument({ source: pdfPath, filename: 'Katalog.pdf' });
fs.unlinkSync(pdfPath);
delete userSessions[ctx.from.id];
});
} catch (e) { ctx.reply('Xatolik'); }
});

bot.on(['text', 'photo'], async (ctx) => {
const userId = ctx.from.id;
const session = userSessions[userId];
if (!session) return;

const text = ctx.message.caption || ctx.message.text || '';

if (session.step === 'WAITING_FOR_AI') {
ctx.reply('⏳ Yozmoqda...');
try {
// MUHIM: Model nomi 1.5-flash
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const result = await model.generateContent(`Yozib ber ssenariy: ${text}`);
const response = await result.response;
ctx.reply(response.text(), { parse_mode: 'Markdown' });
} catch (e) {
ctx.reply(`Xato: ${e.message}`);
}
} else if (session.step === 'COLLECTING_PDF') {
const item = { caption: text };
if (ctx.message.photo) {
const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
const link = await ctx.telegram.getFileLink(photoId);
item.photoUrl = link.href;
}
session.items.push(item);
ctx.reply('Qo\'shildi. Yana yuboring yoki /done');
}
});

// Render Port
const http = require('http');http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 10000);
bot.launch();
