const express = require("express");
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const app = express();
app.use(express.json());

const ADMIN_KEY = "1234";

app.post("/send-alert", async (req, res) => {
  try {
    const { adminKey, title, body } = req.body;

    if (adminKey !== ADMIN_KEY) {
      return res.status(403).send("Forbidden");
    }

    await getMessaging().send({
      topic: "hrushivka_alerts",
      notification: {
        title: title,
        body: body,
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "alerts_channel",
        },
      },
    });

    res.send("Alert sent");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});