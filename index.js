import express from "express";
import axios from "axios";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;

if (!BOT_TOKEN || !BASE_URL) {
  console.error("Missing BOT_TOKEN or BASE_URL");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// =========================
// 📊 نظام الإحصائيات
// =========================

const uniqueUsers = new Set(); // جميع المستخدمين
const ADMIN_ID = 8287143547; // ضع ايديك هنا

// =========================
// جلسات المستخدمين
// =========================

const userSessions = new Map();
const FREE_PERIOD = 30 * 60 * 1000;
const pendingDownloads = new Map();

function hasFreeAccess(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;
  return Date.now() - session.lastAdView < FREE_PERIOD;
}

// =========================
// أوامر البوت
// =========================

bot.start((ctx) => {
  ctx.reply("Your Telegram ID: " + ctx.from.id);
});

bot.on("text", async (ctx) => {

  uniqueUsers.add(ctx.from.id);

  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (!text.includes("tiktok.com")) {
    return ctx.reply("ارسل رابط تيك توك صحيح.");
  }

  if (hasFreeAccess(userId)) {
    return downloadVideo(ctx, text);
  }

  pendingDownloads.set(userId, text);

  return ctx.reply(
    "🔔 لمتابعة التحميل يرجى مشاهدة إعلان قصير.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎥 مشاهدة الإعلان",
              web_app: { url: `${BASE_URL}/app` }
            }
          ]
        ]
      }
    }
  );
});

// =========================
// 📊 أوامر الإحصائيات
// =========================

bot.command("stats", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  ctx.reply(
    `📊 احصائيات البوت:\n\n` +
    `👥 عدد المستخدمين الكلي: ${uniqueUsers.size}\n` +
    `🛡 عدد المستخدمين النشطين حالياً: ${getActiveUsers()}`
  );
});

bot.command("active", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply(`🛡 المستخدمين النشطين حالياً: ${getActiveUsers()}`);
});

function getActiveUsers(){
  let active = 0;
  const now = Date.now();

  for (const session of userSessions.values()) {
    if (now - session.lastAdView < FREE_PERIOD) active++;
  }

  return active;
}

// =========================
// تحميل الفيديو
// =========================

async function downloadVideo(ctx, url) {
  try {
    await ctx.reply("جاري التحميل ⏳");

    const response = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
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
}

// =========================
// Mini App
// =========================

app.get("/app", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src='//libtl.com/sdk.js' data-zone='10620995' data-sdk='show_10620995'></script>
</head>
<body>
<script>
const tg = Telegram.WebApp;
tg.expand();

show_10620995().then(() => {
    const userId = tg.initDataUnsafe.user.id;
    fetch("/activate-access?user_id=" + userId)
    .then(()=> tg.close());
});
</script>
</body>
</html>`);
});

// =========================
// تفعيل الحماية
// =========================

app.get("/activate-access", (req,res)=>{
  const userId = Number(req.query.user_id);
  if(!userId) return res.send("error");

  userSessions.set(userId, { lastAdView: Date.now() });
  res.send("ok");
});

// =========================
// Webhook
// =========================

app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log("Server running");
  await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
});
