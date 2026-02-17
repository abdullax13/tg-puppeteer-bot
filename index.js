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

bot.start((ctx) => {
  ctx.reply("ارسل رابط تيك توك لتحميل الفيديو 🎬");
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (!text.includes("tiktok.com")) {
    return ctx.reply("ارسل رابط تيك توك صحيح.");
  }

  try {
    await ctx.reply("جاري التحميل ⏳");

    const response = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
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
