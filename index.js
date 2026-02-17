import express from "express";
import axios from "axios";
import { Telegraf } from "telegraf";
import crypto from "crypto";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const AD_LINK = "https://omg10.com/4/10621000"; // ضع رابط Monetag هنا

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
  return Date.now() - session.lastAdView < FREE_PERIOD;
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
    userSessions.set(userId, { token });

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

// صفحة الإعلان
app.get("/ad", (req, res) => {
  const { user, token } = req.query;

  const session = userSessions.get(Number(user));
  if (!session || session.token !== token) {
    return res.send("Invalid session");
  }

  res.send(`
  <html>
  <head>
    <title>Advertisement</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        text-align:center;
        font-family: Arial, sans-serif;
        background:#f2f2f2;
        padding:40px;
      }
      .box {
        background:white;
        padding:30px;
        border-radius:10px;
        max-width:400px;
        margin:auto;
        box-shadow:0 4px 10px rgba(0,0,0,0.1);
      }
      button {
        padding:12px 20px;
        border:none;
        border-radius:6px;
        font-size:16px;
        cursor:pointer;
      }
      .adbtn {
        background:#ff9800;
        color:white;
      }
      .continue {
        background:#4CAF50;
        color:white;
        display:none;
        margin-top:15px;
      }
    </style>
    <script>
      let seconds = 5;

      function openAd(){
        window.open("https://omg10.com/4/10621000", "_blank");
      }

      function countdown() {
        if (seconds <= 0) {
          document.getElementById("continueBtn").style.display = "inline-block";
          return;
        }
        document.getElementById("timer").innerText = seconds;
        seconds--;
        setTimeout(countdown, 1000);
      }

      window.onload = countdown;
    </script>
  </head>
  <body>
    <div class="box">
      <h2>🔔 شاهد إعلان قصير</h2>
      <p>سيتم تفعيل التحميل بعد <span id="timer">5</span> ثواني</p>

      <button class="adbtn" onclick="openAd()">فتح الإعلان</button>

      <br><br>

      <a href="/verify?user=${user}&token=${token}">
        <button id="continueBtn" class="continue">
          متابعة التحميل
        </button>
      </a>
    </div>
  </body>
  </html>
  `);
});
// التحقق بعد الإعلان
app.get("/verify", async (req, res) => {
  const { user, token } = req.query;
  const userId = Number(user);

  const session = userSessions.get(userId);

  if (!session || session.token !== token) {
    return res.send("Verification failed");
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
