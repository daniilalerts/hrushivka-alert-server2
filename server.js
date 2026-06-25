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
const TELEGRAM_ADMIN_PASSWORD =
  process.env.TELEGRAM_ADMIN_PASSWORD || "hrushivka_alerts_admin";
const BASE_URL = process.env.BASE_URL;

// Тимчасово зберігаємо тих, хто ввів пароль.
// Після перезапуску Render потрібно буде ввести пароль ще раз.
const telegramAdmins = new Set();

const buttons = [
  ["🚨 Загроза ФПВ Грушівка"],
  ["❗ Загроза БПЛА Грушівка"],
  ["⚠️ АртОбстріл Грушівка"],
  ["✅ Відбій загрози Грушівка"],
  ["🔒 Вийти з адмін-панелі"],
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
      title,
      body,
    },
    android: {
      priority: "high",
    },
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

async function telegramRemoveKeyboard(chatId, text) {
  const payload = {
    chat_id: chatId,
    text,
    reply_markup: {
      remove_keyboard: true,
    },
  };

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
    const text = (message.text || "").trim();
    const chatKey = String(chatId);

    // Старт бота
    if (text === "/start") {
      if (telegramAdmins.has(chatKey)) {
        await telegramSend(
          chatId,
          "✅ Ви вже увійшли в адмін-панель.\n\nОберіть тип сповіщення:",
          true
        );
      } else {
        await telegramRemoveKeyboard(
          chatId,
          "🛡 Hrushivka Alerts\n\nВведіть пароль адміністратора для доступу до панелі керування."
        );
      }

      return res.sendStatus(200);
    }

    // Вихід з адмін-панелі
    if (text === "/logout" || text === "🔒 Вийти з адмін-панелі") {
      telegramAdmins.delete(chatKey);

      await telegramRemoveKeyboard(
        chatId,
        "🔒 Ви вийшли з адмін-панелі.\n\nЩоб увійти знову — введіть пароль."
      );

      return res.sendStatus(200);
    }

    // Вхід по паролю
    if (text === TELEGRAM_ADMIN_PASSWORD) {
      telegramAdmins.add(chatKey);

      await telegramSend(
        chatId,
        "✅ Доступ дозволено.\n\nОберіть тип сповіщення:",
        true
      );

      return res.sendStatus(200);
    }

    // Якщо пароль ще не введений
    if (!telegramAdmins.has(chatKey)) {
      await telegramRemoveKeyboard(
        chatId,
        "⛔ Доступ закритий.\n\nВведіть правильний пароль адміністратора."
      );

      return res.sendStatus(200);
    }

    // Надсилання тривог після входу
    if (alerts[text]) {
      await sendPush(alerts[text].title, alerts[text].body);

      await telegramSend(
        chatId,
        `✅ Сповіщення відправлено:\n\n${alerts[text].title}\n${alerts[text].body}`,
        true
      );

      return res.sendStatus(200);
    }

    // Якщо авторизований користувач написав щось інше
    await telegramSend(
      chatId,
      "🔐 Адмін-панель активна.\n\nОберіть кнопку нижче або напишіть /logout для виходу.",
      true
    );

    return res.sendStatus(200);
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return res.sendStatus(500);
  }
});

app.post("/send-alert", async (req, res) => {
  try {
    const { title, body } = req.body;

    if (!title || !body) {
      return res.status(400).send("Missing title or body");
    }

    await sendPush(title, body);
    res.send("Alert sent");
  } catch (error) {
    console.error("Send alert error:", error);
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

    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`
    );

    console.log("Telegram webhook set: " + webhookUrl);
  } else {
    console.log("Telegram webhook not set: BOT_TOKEN or BASE_URL missing");
  }
});
