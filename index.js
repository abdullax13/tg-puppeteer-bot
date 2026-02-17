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

// جلسات المستخدمين
const userSessions = new Map();

// مدة الحماية 30 دقيقة
const FREE_PERIOD = 30 * 60 * 1000;

function hasFreeAccess(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;
  return Date.now() - session.lastAdView < FREE_PERIOD;
}

bot.start((ctx) => {
  ctx.reply("اضغط على زر تحميل الفيديو لفتح الصفحة 👇", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "تحميل الفيديو",
            web_app: { url: BASE_URL + "/app" }
          }
        ]
      ]
    }
  });
});

// تحميل مباشر عند إرسال رابط في الدردشة
bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (!text.includes("tiktok.com")) return;

  if (hasFreeAccess(userId)) {
    return downloadVideo(userId, text);
  }

  ctx.reply(
    "🔔 لمتابعة التحميل يرجى مشاهدة إعلان قصير.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎥 مشاهدة الإعلان",
              web_app: { url: BASE_URL + "/app?url=" + encodeURIComponent(text) }
            }
          ]
        ]
      }
    }
  );
});

async function downloadVideo(userId, url) {
  try {
    await bot.telegram.sendMessage(userId, "جاري التحميل ⏳");

    const response = await axios.get(
      "https://www.tikwm.com/api/?url=" + encodeURIComponent(url),
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    const videoUrl = response.data?.data?.play;

    if (!videoUrl) {
      return bot.telegram.sendMessage(userId, "تعذر تحميل الفيديو.");
    }

    await bot.telegram.sendVideo(userId, videoUrl);

  } catch (error) {
    console.error(error.message);
    bot.telegram.sendMessage(userId, "حدث خطأ أثناء التحميل.");
  }
}

//
// ===== صفحة Mini App =====
//

app.get("/app", (req, res) => {

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="//libtl.com/sdk.js" data-zone="10620995" data-sdk="show_10620995"></script>

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

const tg = window.Telegram.WebApp;
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
          await fetch("/activate-access?user_id=" + userId + "&url=" + encodeURIComponent(url));
          tg.close();
      });
  }
}

</script>

</body>
</html>
  `);
});

//
// ===== فحص الحماية =====
//

app.get("/check-access", (req,res)=>{
  const userId = Number(req.query.user_id);
  res.json({ hasAccess: hasFreeAccess(userId) });
});

//
// ===== تحميل مباشر =====
//

app.get("/direct-download", async (req,res)=>{
  const userId = Number(req.query.user_id);
  const url = req.query.url;

  if(!userId || !url) return res.send("error");

  await downloadVideo(userId, url);
  res.send("ok");
});

//
// ===== تفعيل بعد الإعلان =====
//

app.get("/activate-access", async (req,res)=>{
  const userId = Number(req.query.user_id);
  const url = req.query.url;

  if(!userId || !url) return res.send("error");

  userSessions.set(userId, { lastAdView: Date.now() });

  await downloadVideo(userId, url);

  res.send("ok");
});

//
// ===== Webhook =====
//

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
  await bot.telegram.setWebhook(BASE_URL + "/webhook");
});
