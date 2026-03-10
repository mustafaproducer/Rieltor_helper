require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// --- SOZLAMALAR ---
const BOT_TOKEN = process.env.BOT_TOKEN || '7798199972:AAH0xSgL_RL2OGhG1RV0OHZnT53vNAlUFUc'; // Shu token vaqtincha task-monitordan olingan
const ADMIN_ID = process.env.ADMIN_ID || '5949913506'; 
const CHANNEL_ID = process.env.CHANNEL_ID || '-1002947739734'; // Yopiq kanalingiz ID si
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '@mustafaproducer'; // Yoki siz aytgan yangi username
const CARD_NUMBER = process.env.CARD_NUMBER || '4073 4200 8249 5759 (Avazxonov S)';

const bot = new Telegraf(BOT_TOKEN);
const DB_FILE = path.join(__dirname, 'database.json');

// --- BAZA (DATABASE) YUKLASH ---
let db = { users: {} };
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("Baza o'qishda xatolik:", e);
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// User obyekti olish/yaratish
function getUser(userId, from) {
    if (!db.users[userId]) {
        db.users[userId] = {
            id: userId,
            tgName: from.first_name || '',
            tgUsername: from.username || '',
            joinedAt: new Date().toISOString(),
            step: 'START', // Qaysi qadamda ekanligi
            fullName: null,
            phone: null,
            isPaid: false
        };
        saveDB();
    }
    return db.users[userId];
}

// --- /START (1-QADAM) ---
bot.start(async (ctx) => {
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'ASK_NAME';
    saveDB();

    // Bu yerda yumaloq videoning FILE_ID sini berasiz. Hozircha oddiy matn va video yuborgan degan joy bor.
    // ctx.replyWithVideoNote('FILE_ID_SHU_YERGA_YOZILADI').catch(e => console.log('Video note yoq'));
    
    await ctx.reply(
        "👋 Assalomu alaykum!\n\n" +
        "Siz bu yerda sun'iy intellekt uchun 50 ta eng sara Premium Promptlarni qo'lga kiritishingiz mumkin.\n\n" +
        "👇 Iltimos, **Ism familiyangizni kiriting** (Masalan: Alisher Valiyev):",
        Markup.removeKeyboard()
    );
});

// --- ADMIN UCHUN BUYRUQLAR ---
bot.command('export', async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    
    let csv = "ID,TgName,Username,FullName,Phone,JoinedAt,IsPaid\n";
    for (const id in db.users) {
        const u = db.users[id];
        csv += `${u.id},"${u.tgName}","${u.tgUsername}","${u.fullName || ''}","${u.phone || ''}",${u.joinedAt},${u.isPaid}\n`;
    }
    
    fs.writeFileSync('users_export.csv', csv);
    await ctx.replyWithDocument({ source: 'users_export.csv', filename: 'Foydalanuvchilar_Bazasi.csv' });
});

bot.command('admin', (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const usersCount = Object.keys(db.users).length;
    const paidCount = Object.values(db.users).filter(u => u.isPaid).length;
    ctx.reply(`📊 **Statistika**\n\n👥 Jami foydalanuvchilar: ${usersCount}\n✅ To'lov qilganlar: ${paidCount}\n\n📥 Bazani olish: /export`);
});

// --- BARCHA XABARLAR UCHUN LOGIKA (2, 3, 4 va 5-QADAMLAR) ---
bot.on('message', async (ctx) => {
    const userId = ctx.from.id;
    const user = getUser(userId, ctx.from);
    
    // Agar foydalanuvchi allaqachon kanalga qo'shilgan bo'lsa
    if (user.isPaid) {
        return ctx.reply("✅ Siz allaqachon premium promptlarni qo'lga kiritgansiz. Kanalimizda qoling!");
    }

    // Agar text yoki raqam emas, balki RASM bo'lsa (To'lov skrinshotini tashlagan bo'lsa)
    if (ctx.message.photo) {
        if (user.step !== 'ASK_PHOTO') {
            return ctx.reply("Siz hali to'lov bosqichiga yetib kelmadingiz. /start ni bosing.");
        }
        
        await ctx.reply("✅ Skrinshot qabul qilindi! Admin tasdiqlashini kuting. Tez orada javob beramiz.");
        
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        
        // Adminga jo'natish
        await ctx.telegram.sendPhoto(ADMIN_ID, photoId, {
            caption: `🔔 **YANGI TO'LOV KELDI!**\n\n` +
                     `👤 Mijoz: ${user.fullName} (@${user.tgUsername || 'yoq'})\n` +
                     `📞 Raqam: ${user.phone}\n` +
                     `🆔 ID: ${user.id}`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Tasdiqlash', callback_data: `approve_${userId}` }],
                    [{ text: '❌ Rad etish', callback_data: `reject_${userId}` }]
                ]
            }
        });
        return;
    }

    // Matnli javoblar logikasi
    const text = ctx.message.text;

    if (user.step === 'ASK_NAME' && text) {
        user.fullName = text;
        user.step = 'ASK_PHONE';
        saveDB();
        
        await ctx.reply(
            `Rahmat, ${user.fullName}!\n\n` +
            `Raqamingizni quyidagi tugma orqali yuboring 👇`,
            Markup.keyboard([
                Markup.button.contactRequest('📞 Raqamni yuborish')
            ]).resize().oneTime()
        );
    } 
    else if (user.step === 'ASK_PHONE' && (ctx.message.contact || text)) {
        user.phone = ctx.message.contact ? ctx.message.contact.phone_number : text;
        user.step = 'ASK_PHOTO';
        saveDB();
        
        await ctx.reply(
            `✅ Raqamingiz qabul qilindi.\n\n` +
            `🎁 **50 ta Premium Promptlarni qo'lga kiritish uchun:**\n\n` +
            `💳 Ushbu kartaga **349,000 so'm** o'tkazing:\n` +
            `\`${CARD_NUMBER}\`\n\n` +
            `📸 So'ngra to'lov skrinshotini (chekini) shu botga rasm qilib tashlang!`,
            { parse_mode: 'Markdown', ...Markup.removeKeyboard() }
        );
    }
});

// --- INLINE TUGMALAR (ADMIN TASDIQLASH/RAD ETISH) ---
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const msgId = ctx.callbackQuery.message.message_id;
    
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const action = data.split('_')[0];
        const targetUserId = data.split('_')[1];
        const targetUser = db.users[targetUserId];

        if (action === 'approve') {
            try {
                // Kanalga bir martalik va 24 soatlik link yaratish
                const expireDate = Math.floor(Date.now() / 1000) + 86400; // 24 soat
                const linkRes = await ctx.telegram.createChatInviteLink(CHANNEL_ID, {
                    member_limit: 1,
                    expire_date: expireDate
                });
                
                const inviteLink = linkRes.invite_link;
                
                // Mijozga xabar
                await ctx.telegram.sendMessage(targetUserId, 
                    `🎉 To'lovingiz tasdiqlandi, kutganingiz uchun rahmat!\n\n` +
                    `Mana sizga yopiq kanal uchun maxsus link:\n🔗 ${inviteLink}\n\n` +
                    `⚠️ Bu link faqat **"BIR MARTA"** ishlaydi va **"24 soat"** ichida kuyadi!`
                );
                
                // Bazani yangilash
                if(targetUser) {
                    targetUser.isPaid = true;
                    saveDB();
                }
                
                // Admindagi tugmani yo'q qilish va statusni o'zgartirish
                await ctx.editMessageCaption(`✅ **TASDIQLANDI**\nMijozga link yuborildi!`);
                
            } catch (err) {
                console.error("Link yaratishda xatolik:", err);
                await ctx.answerCbQuery("Link yaratishda xatolik! Bot kanalga to'liq adminmi?");
            }
        } 
        else if (action === 'reject') {
            // Mijozga xabar
            await ctx.telegram.sendMessage(targetUserId, 
                `❌ Kechirasiz, to'lovingiz tasdiqlanmadi.\n\n` +
                `Admin bilan bog'laning: ${ADMIN_USERNAME}`
            );
            
            // Admindagi tugmani yo'q qilish
            await ctx.editMessageCaption(`❌ **RAD ETILDI**\nMijozga xabar yuborildi.`);
        }
        await ctx.answerCbQuery();
    }
});

// Botni ishga tushirish
bot.launch().then(() => {
    console.log("🚀 Premium Prompt boti ishga tushdi!");
});

// Xatoliklarni ushlab qolish (qotib qolmasligi uchun)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
