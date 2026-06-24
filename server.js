const express = require("express");
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
});

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = Number(process.env.TELEGRAM_ADMIN_ID);
const BASE_URL = process.env.BASE_URL;

const buttons = [
  ["🚨 Загроза ФПВ Грушівка"],
  ["❗ Загроза БПЛА Грушівка"],
  ["⚠️ АртОбстріл Грушівка"],
  ["✅ Відбій загрози Грушівка"],
];

const alerts = {
  "🚨 Загроза ФПВ Грушівка": {
    title: "🚨 Загроза ФПВ",
    body: "У районі Грушівки зафіксована загроза ФПВ-дронів.",
  },
  "❗ Загроза БПЛА Грушівка": {
    title: "❗ Загроза БПЛА",
    body: "У районі Грушівки зафіксована загроза БПЛА.",
  },
  "⚠️ АртОбстріл Грушівка": {
    title: "⚠️ АртОбстріл",
    body: "У районі Грушівки зафіксовано загрозу артилерійського обстрілу.",
  },
  "✅ Відбій загрози Грушівка": {
    title: "✅ Відбій загрози",
    body: "Загроз у районі Грушівки не зафіксовано.",
  },
};

async function sendPush(title, body) {
  await getMessaging().send({
    topic: "hrushivka_alerts",
    data: {
      title: title,
      body: body
    },
    android: {
      priority: "high"
    }
  });
}

async function telegramSend(chatId, text, keyboard = false) {
  const payload = {
    chat_id: chatId,
    text,
  };

  if (keyboard) {
    payload.reply_markup = {
      keyboard: buttons,
      resize_keyboard: true,
    };
  }

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

app.post("/telegram-webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text;

    if (userId !== ADMIN_ID) {
      await telegramSend(chatId, "⛔ У вас немає доступу.");
      return res.sendStatus(200);
    }

    if (text === "/start") {
      await telegramSend(chatId, "Панель керування сповіщеннями:", true);
      return res.sendStatus(200);
    }

    if (alerts[text]) {
      await sendPush(alerts[text].title, alerts[text].body);
      await telegramSend(chatId, "✅ Сповіщення відправлено.");
      return res.sendStatus(200);
    }

    await telegramSend(chatId, "Натисніть кнопку нижче або напишіть /start", true);
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.post("/send-alert", async (req, res) => {
  try {
    const { title, body } = req.body;
    await sendPush(title, body);
    res.send("Alert sent");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.get("/", (req, res) => {
  res.send("Hrushivka alert server is running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("Server started on port " + PORT);

  if (BOT_TOKEN && BASE_URL) {
    const webhookUrl = `${BASE_URL}/telegram-webhook`;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
    console.log("Telegram webhook set: " + webhookUrl);
  }
});
