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

// 🔥 مدة السماح 30 دقيقة بدل 3 ساعات
const FREE_PERIOD = 30 * 60 * 1000;

// تخزين رابط آخر طلبه المستخدم
const pendingDownloads = new Map();

function hasFreeAccess(userId) {
  const session = userSessions.get(userId);
  if (!session) return false;
  return Date.now() - session.lastAdView < FREE_PERIOD;
}

bot.start((ctx) => {
  ctx.reply("ارسل رابط تيك توك لتحميل الفيديو 🎬");
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (!text.includes("tiktok.com")) {
    return ctx.reply("ارسل رابط تيك توك صحيح.");
  }

  // إذا لديه صلاحية
  if (hasFreeAccess(userId)) {
    return downloadVideo(ctx, text);
  }

  // حفظ الرابط مؤقتاً
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
<script src='//libtl.com/sdk.js' data-zone='10620995' data-sdk='show_10620995'></script>
<style>
body{
  margin:0;
  background:black;
}
</style>
</head>
<body>

<script>

window.onload = function() {

  const tg = window.Telegram.WebApp;
  tg.expand();

  // 🔥 تشغيل الإعلان مباشرة بدون زر
  show_10620995().then(() => {

    const userId = tg.initDataUnsafe.user.id;

    fetch("/postback?user_id=" + userId)
      .then(() => {
        tg.close(); // إغلاق تلقائي بعد انتهاء الإعلان
      });

  });

};

</script>

</body>
</html>
  `);
});

//
// ===== Postback =====
//

app.get("/postback", async (req, res) => {
  const userId = Number(req.query.user_id);

  if (!userId) return res.send("error");

  // تفعيل 30 دقيقة
  userSessions.set(userId, { lastAdView: Date.now() });

  const url = pendingDownloads.get(userId);

  if (url) {
    try {
      const response = await axios.get(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );

      const videoUrl = response.data?.data?.play;

      if (videoUrl) {
        await bot.telegram.sendVideo(userId, videoUrl);
      }

      pendingDownloads.delete(userId);

    } catch (err) {
      console.error(err.message);
    }
  }

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
  await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
});
