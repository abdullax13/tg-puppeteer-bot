import express from "express";
import axios from "axios";
import { Telegraf } from "telegraf";
import Redis from "ioredis";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const REDIS_URL = process.env.REDIS_URL;

if (!BOT_TOKEN || !BASE_URL || !REDIS_URL) {
  console.error("Missing environment variables");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const redis = new Redis(REDIS_URL);

const FREE_PERIOD = 30 * 60; // 30 دقيقة
const ADMIN_ID = 8287143547;

// =========================
// 📊 الإحصائيات
// =========================

bot.command("stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const total = await redis.scard("users");
  const active = await redis.keys("session:*");

  ctx.reply(
    `📊 احصائيات البوت\n\n` +
    `👥 المستخدمين الكلي: ${total}\n` +
    `🛡 النشطين حالياً: ${active.length}`
  );
});

bot.command("active", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const active = await redis.keys("session:*");
  ctx.reply(`🛡 النشطين حالياً: ${active.length}`);
});

// =========================
// /start + Referral System
// =========================

bot.start(async (ctx) => {
  const userId = ctx.from.id;

  const isNewUser = !(await redis.sismember("users", userId));
  await redis.sadd("users", userId);

  const referral = ctx.startPayload;

  if (isNewUser && referral && referral !== String(userId)) {
    const refUserId = Number(referral);

    if (!isNaN(refUserId)) {
      await redis.set(`session:${refUserId}`, "1", "EX", FREE_PERIOD);

      await bot.telegram.sendMessage(
        refUserId,
        `🎉 قام مستخدم جديد بالدخول عبر رابطك!\n` +
        `🛡 تم منحك 30 دقيقة حماية إضافية.`
      ).catch(()=>{});
    }
  }

  ctx.reply("👇 اضغط على زر تحميل الفيديو لفتح الصفحة", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "تحميل الفيديو", web_app: { url: `${BASE_URL}/app` } }]
      ]
    }
  });
});

// =========================
// استقبال الروابط
// =========================

bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  const userId = ctx.from.id;
  const text = ctx.message.text;

  await redis.sadd("users", userId);

  if (!text.includes("tiktok.com")) {
    return ctx.reply("ارسل رابط تيك توك صحيح.");
  }

  const hasAccess = await redis.get(`session:${userId}`);

  if (hasAccess) {
    return downloadVideo(userId, text);
  }

  const msg = await ctx.reply(
    "🔔 لمتابعة التحميل يرجى مشاهدة إعلان قصير.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎥 مشاهدة الإعلان", web_app: { url: `${BASE_URL}/ad` } }]
        ]
      }
    }
  );

  await redis.set(
    `pending:${userId}`,
    JSON.stringify({
      url: text,
      messageId: msg.message_id
    }),
    "EX",
    600
  );
});

// =========================
// تحميل الفيديو
// =========================

async function downloadVideo(userId, url) {
  try {
    const response = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    const videoUrl = response.data?.data?.play;

    if (videoUrl) {
      await bot.telegram.sendVideo(userId, videoUrl);
    }
  } catch (e) {
    console.log(e.message);
  }
}

// =========================
// صفحة التحميل
// =========================

app.get("/app", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src='//libtl.com/sdk.js' data-zone='10620995' data-sdk='show_10620995'></script>
</head>
<body style="background:#0f172a;color:white;font-family:Arial;text-align:center;padding-top:50px;">

<h2>تنزيل فيديو من TikTok</h2>

<input id="url" placeholder="ألصق رابط TikTok هنا" style="width:85%;padding:15px;border-radius:10px;border:none;margin-bottom:15px;font-size:16px;">
<br>
<button onclick="startProcess()" style="width:85%;padding:15px;border-radius:10px;border:none;font-size:16px;background:#3b82f6;color:white;">تحميل</button>

<script>
const tg = window.Telegram?.WebApp;
tg.expand();

async function startProcess(){
  const url = document.getElementById("url").value;
  if(!url.includes("tiktok.com")){
    alert("رابط غير صحيح");
    return;
  }

  const userId = tg.initDataUnsafe.user.id;
  const check = await fetch("/check-access?user_id=" + userId);
  const data = await check.json();

  if(data.hasAccess){
      await fetch("/direct-download?user_id=" + userId + "&url=" + encodeURIComponent(url));
      tg.close();
  }else{
      show_10620995().then(async () => {
          await fetch("/activate-from-page?user_id=" + userId + "&url=" + encodeURIComponent(url));
          tg.close();
      });
  }
}
</script>
</body>
</html>`);
});

// =========================
// صفحة الإعلان
// =========================

app.get("/ad", (req, res) => {
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
    fetch("/activate-from-message?user_id=" + userId)
    .then(()=> tg.close());
});
</script>
</body>
</html>`);
});

// =========================
// API
// =========================

app.get("/check-access", async (req, res) => {
  const userId = Number(req.query.user_id);
  const session = await redis.get(`session:${userId}`);
  res.json({ hasAccess: !!session });
});

app.get("/direct-download", async (req, res) => {
  const userId = Number(req.query.user_id);
  const url = req.query.url;
  await downloadVideo(userId, url);
  res.send("ok");
});

app.get("/activate-from-message", async (req, res) => {
  const userId = Number(req.query.user_id);
  if (!userId) return res.send("error");

  await redis.set(`session:${userId}`, "1", "EX", FREE_PERIOD);

  const referralLink = `https://t.me/ViroTik_bot?start=${userId}`;

  await bot.telegram.sendMessage(
    userId,
    `🎉 لديك حماية 30 دقيقة!\n\n` +
    `🚀 احصل على 30 دقيقة إضافية عند مشاركة البوت:\n${referralLink}`
  ).catch(()=>{});

  const pending = await redis.get(`pending:${userId}`);
  if (!pending) return res.send("ok");

  const data = JSON.parse(pending);

  await downloadVideo(userId, data.url);
  await bot.telegram.deleteMessage(userId, data.messageId).catch(()=>{});
  await redis.del(`pending:${userId}`);

  res.send("ok");
});

app.get("/activate-from-page", async (req, res) => {
  const userId = Number(req.query.user_id);
  const url = req.query.url;
  if (!userId || !url) return res.send("error");

  await redis.set(`session:${userId}`, "1", "EX", FREE_PERIOD);

  const referralLink = `https://t.me/ViroTik_bot?start=${userId}`;

  await bot.telegram.sendMessage(
    userId,
    `🎉 لديك حماية 30 دقيقة!\n\n` +
    `🚀 احصل على 30 دقيقة إضافية عند مشاركة البوت:\n${referralLink}`
  ).catch(()=>{});

  await downloadVideo(userId, url);
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
  await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
});
