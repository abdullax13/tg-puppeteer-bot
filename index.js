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
// 📊 الإحصائيات
// =========================

const uniqueUsers = new Set();
const ADMIN_ID = 8287143547;

// =========================
// الجلسات
// =========================

const userSessions = new Map();
const pendingDownloads = new Map();
const FREE_PERIOD = 30 * 60 * 1000;

function hasFreeAccess(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;
  return Date.now() - session.lastAdView < FREE_PERIOD;
}

// =========================
// أوامر
// =========================

bot.start((ctx) => {
  uniqueUsers.add(ctx.from.id);

  ctx.reply("👇 اضغط على زر تحميل الفيديو لفتح الصفحة", {
  reply_markup: {
    inline_keyboard: [
      [{ text: "تحميل الفيديو", web_app: { url: `${BASE_URL}/app` } }]
    ]
  }
});
});

// =========================
// 📊 إحصائيات
// =========================

bot.command("stats", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  ctx.reply(
    `📊 احصائيات البوت\n\n` +
      `👥 المستخدمين الكلي: ${uniqueUsers.size}\n` +
      `🛡 النشطين حالياً: ${getActiveUsers()}`
  );
});

bot.command("active", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply(`🛡 النشطين حالياً: ${getActiveUsers()}`);
});

function getActiveUsers() {
  let active = 0;
  const now = Date.now();
  for (const session of userSessions.values()) {
    if (now - session.lastAdView < FREE_PERIOD) active++;
  }
  return active;
}

// =========================
// استقبال الروابط في الدردشة
// =========================

bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  uniqueUsers.add(ctx.from.id);

  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (!text.includes("tiktok.com")) {
    return ctx.reply("ارسل رابط تيك توك صحيح.");
  }

  if (hasFreeAccess(userId)) {
    return downloadVideo(userId, text);
  }

  const msg = await ctx.reply(
    "🔔 لمتابعة التحميل يرجى مشاهدة إعلان قصير.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎥 مشاهدة الإعلان", web_app: { url: `${BASE_URL}/ad` } }],
        ],
      },
    }
  );

  pendingDownloads.set(userId, {
    url: text,
    messageId: msg.message_id,
  });
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
// صفحة التحميل (Mini App)
// =========================

app.get("/app", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src='//libtl.com/sdk.js' data-zone='10620995' data-sdk='show_10620995'></script>
<style>
body{
  background:#0f172a;
  color:white;
  font-family:Arial;
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
  height:100vh;
  margin:0;
}
input{
  width:85%;
  padding:15px;
  border-radius:10px;
  border:none;
  margin-bottom:15px;
  font-size:16px;
}
button{
  width:85%;
  padding:15px;
  border-radius:10px;
  border:none;
  font-size:16px;
  background:#3b82f6;
  color:white;
}
</style>
</head>
<body>

<h2>تنزيل فيديو من TikTok</h2>

<input id="url" placeholder="ألصق رابط TikTok هنا">
<button onclick="startProcess()">تحميل</button>

<script>
const tg = window.Telegram?.WebApp;

if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
  alert("يرجى فتح الصفحة من داخل البوت مباشرة.");
  throw new Error("WebApp not opened correctly");
}

tg.expand();

async function startProcess(){

  if(!tg.initDataUnsafe || !tg.initDataUnsafe.user){
    alert("يرجى فتح الصفحة من داخل البوت مباشرة.");
    return;
  }

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
// صفحة إعلان الرسائل
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

app.get("/check-access", (req, res) => {
  const userId = Number(req.query.user_id);
  res.json({ hasAccess: hasFreeAccess(userId) });
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

  userSessions.set(userId, { lastAdView: Date.now() });

  const data = pendingDownloads.get(userId);
  if (!data) return res.send("ok");

  await downloadVideo(userId, data.url);
  await bot.telegram.deleteMessage(userId, data.messageId).catch(()=>{});

  pendingDownloads.delete(userId);
  res.send("ok");
});

app.get("/activate-from-page", async (req, res) => {
  const userId = Number(req.query.user_id);
  const url = req.query.url;

  if (!userId || !url) return res.send("error");

  userSessions.set(userId, { lastAdView: Date.now() });
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
