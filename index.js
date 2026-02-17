import express from "express";
import { Telegraf } from "telegraf";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;

if (!BOT_TOKEN || !BASE_URL) {
  console.error("Missing BOT_TOKEN or BASE_URL");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---------- أوامر البوت ----------

bot.start((ctx) => {
  ctx.reply("شغال ✅\nاكتب /pp عشان نختبر Puppeteer.");
});

bot.command("pp", async (ctx) => {
  ctx.reply("...جاري اختبار Puppeteer");

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath:
        "/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });

    const title = await page.title();

    await ctx.reply(`Puppeteer OK ✅\nTitle: ${title}`);
  } catch (err) {
    console.error(err);
    await ctx.reply(`Puppeteer FAILED ❌\n${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// ---------- Webhook ----------

app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// ---------- Health check ----------

app.get("/", (req, res) => {
  res.send("OK");
});

// ---------- تشغيل السيرفر ----------

const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log(`Listening on ${PORT}`);

  try {
    await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
    console.log(`Webhook set: ${BASE_URL}/webhook`);
  } catch (err) {
    console.error("Failed to set webhook:", err.message);
  }
});
