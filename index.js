import express from "express";
import axios from "axios";
import { Telegraf } from "telegraf";
import crypto from "crypto";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const AD_LINK = "https://omg10.com/4/10621000"; 

if (!BOT_TOKEN || !BASE_URL) {
  console.error("Missing BOT_TOKEN or BASE_URL");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// تخزين مؤقت للجلسات
const userSessions = new Map();

// مدة السماح بدون إعلان (3 ساعات)
const FREE_PERIOD = 3 * 60 * 60 * 1000;

function hasFreeAccess(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;
  return session.lastAdView && (Date.now() - session.lastAdView < FREE_PERIOD);
}

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

// رسالة البداية
bot.start((ctx) => {
  ctx.reply("ارسل رابط تيك توك لتحميل الفيديو 🎬");
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (!text.includes("tiktok.com")) {
    return ctx.reply("ارسل رابط تيك توك صحيح.");
  }

  // تحقق من صلاحية المستخدم
  if (!hasFreeAccess(userId)) {
    const token = generateToken();

    userSessions.set(userId, {
      token,
      requestedAt: Date.now()
    });

    return ctx.reply(
      "🔔 لمتابعة التحميل يرجى مشاهدة إعلان قصير.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎥 مشاهدة الإعلان",
                url: `${BASE_URL}/ad?user=${userId}&token=${token}`
              }
            ]
          ]
        }
      }
    );
  }

  try {
    await ctx.reply("جاري التحميل ⏳");

    const response = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" }
      }
    );

    const videoUrl = response.data?.data?.play;

    if (!videoUrl) {
      return ctx.reply("تعذر تحميل الفيديو.");
    }

    await ctx.replyWithVideo(videoUrl);

  } catch (error) {
    console.error(error.message);
    ctx.reply("حدث خطأ أثناء التحميل.");
  }
});


// ===============================
// صفحة الإعلان (Redirect مباشر)
// ===============================
app.get("/ad", (req, res) => {
  const { user, token } = req.query;
  const userId = Number(user);

  const session = userSessions.get(userId);

  if (!session || session.token !== token) {
    return res.send("Invalid session");
  }

  // تسجيل وقت بدء مشاهدة الإعلان
  session.adStart = Date.now();
  userSessions.set(userId, session);

  // تحويل مباشر لرابط Monetag
  return res.redirect(AD_LINK);
});


// ===============================
// التحقق بعد الإعلان
// ===============================
app.get("/verify", async (req, res) => {
  const { user, token } = req.query;
  const userId = Number(user);

  const session = userSessions.get(userId);

  if (!session || session.token !== token) {
    return res.send("Verification failed");
  }

  // تحقق أن المستخدم قضى 8 ثواني على الأقل
  if (!session.adStart || (Date.now() - session.adStart < 8000)) {
    return res.send("يجب مشاهدة الإعلان أولاً.");
  }

  session.lastAdView = Date.now();
  userSessions.set(userId, session);

  await bot.telegram.sendMessage(
    userId,
    "✅ تم تفعيل التحميل لمدة 3 ساعات. يمكنك الآن إرسال الروابط."
  );

  res.send("يمكنك العودة للبوت الآن.");
});


// Webhook
app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log(`Server running on ${PORT}`);
  await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
  console.log("Webhook set");
});
