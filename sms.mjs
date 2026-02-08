import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.SMS_FROM;
const toRaw = process.env.SMS_TO;

function parseRecipients(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const recipients = parseRecipients(toRaw ?? "");

if (!accountSid || !authToken || !from || recipients.length === 0) {
  throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SMS_FROM, SMS_TO are required in .env");
}

const client = twilio(accountSid, authToken);

async function send() {
  for (const to of recipients) {
    const res = await client.messages.create({
      body: "🔥テストSMS成功。空室通知ここに来る",
      from,
      to,
    });
    console.log("sent", to, res.sid);
  }
}

send();
