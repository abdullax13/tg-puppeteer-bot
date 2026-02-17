import express from "express";
import { Telegraf } from "telegraf";
import puppeteer from "puppeteer";

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN env var");
if (!BASE_URL) throw new Error("Missing BASE_URL env var");

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.post("/webhook", (req, res) => {
  bot.handleUpdate(req.body, res);
});

bot.start(async (ctx) => {
  await ctx.reply("شغال ✅\nاكتب /pp عشان نختبر Puppeteer.");
});

bot.command("pp", async (ctx) => {
  await ctx.reply("جاري اختبار Puppeteer...");

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--single-process"
      ],
    });

    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    const title = await page.title();
    await browser.close();

    await ctx.reply(`Puppeteer OK ✅\nTitle: ${title}`);
  } catch (e) {
    await ctx.reply(`Puppeteer FAILED ❌\n${String(e?.message || e)}`);
  }
});

app.listen(PORT, async () => {
  console.log(`Listening on ${PORT}`);

  const webhookUrl = `${BASE_URL}/webhook`;
  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log("Webhook set:", webhookUrl);
  } catch (e) {
    console.log("Failed to set webhook:", e);
  }
});
