import { chromium } from "playwright";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const URL = "https://reserve.489ban.net/client/e-sakaeya/0/plan/availability/daily";
const TARGET_YMD = "2026-02-28";          // 監視したい日（class用）
const TARGET_DATE_PARAM = "2026/02/28";   // href用

// ===== SMS設定（Twilio）=====
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SMS_TO = process.env.SMS_TO;        // 送信先（例: +8190xxxxxxxx,複数可）
const SMS_FROM = process.env.SMS_FROM;    // 送信元（TwilioのFrom番号 例: +1313xxxxxxx）

function assertEnv(name, v) {
  if (!v) throw new Error(`Missing env: ${name}`);
}

function parseRecipients(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendSms(message) {
  assertEnv("TWILIO_ACCOUNT_SID", TWILIO_ACCOUNT_SID);
  assertEnv("TWILIO_AUTH_TOKEN", TWILIO_AUTH_TOKEN);
  assertEnv("SMS_TO", SMS_TO);
  assertEnv("SMS_FROM", SMS_FROM);

  const recipients = parseRecipients(SMS_TO);
  if (recipients.length === 0) throw new Error("No valid SMS_TO recipients");

  // 日本の携帯番号は +81 の後に 0 を入れない（例: 080... -> +8180...）
  // もし間違って +810... になってたらエラーになるので注意

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  for (const to of recipients) {
    const res = await client.messages.create({
      body: message,
      from: SMS_FROM,
      to,
    });
    console.log("sms sent:", to, res.sid);
  }

  console.log("all sms sent");
}

async function main() {
  const runAt = new Date().toISOString();
  console.log(`[runAt] ${runAt}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);

  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // ページ側の描画待ち（必要なら増やす）
  await page.waitForTimeout(5000);

  const result = await page.evaluate(({ ymd }) => {
    // クラスに日付文字列を含む <p> をゆるく検索
    const p = Array.from(document.querySelectorAll("p")).find((el) =>
      el.className.split(/\s+/).includes(ymd)
    );

    const iconClass = p?.querySelector("i")?.className ?? null;
    const hasX = iconClass ? iconClass.includes("fa-xmark") : false;

    // ルール: × があれば満室、それ以外（要素が見つからない場合も含む）は空きあり扱い
    if (hasX) {
      return {
        ok: true,
        status: "full",
        iconClass,
        debug: { pFound: Boolean(p) },
      };
    }

    return {
      ok: true,
      status: "available",
      iconClass,
      debug: { pFound: Boolean(p) },
    };
  }, { ymd: TARGET_YMD });

  console.log("result:", result);

  if (!result.ok) {
    console.log("判定失敗:", result.reason);
    const msg =
      `【さかえや】${TARGET_DATE_PARAM} 判定失敗\n` +
      `runAt: ${runAt}\n` +
      `reason: ${result.reason ?? "unknown"}\n` +
      `確認URL:\n${URL}\n` +
      (result.pClasses ? `pClasses(sample): ${result.pClasses.slice(0, 10).join(", ")}` : "");
    await sendSms(msg);
    await browser.close();
    return;
  }

  if (result.status === "available") {
    console.log("空き検知！");

    const msg =
      `【さかえや】${TARGET_DATE_PARAM} 空き出たかも\n` +
      `runAt: ${runAt}\n` +
      `確認URL:\n${URL}\n` +
      (result.href ? `\nリンク候補:\n${result.href}\n` : "");

    await sendSms(msg);
  } else if (result.status === "full") {
    console.log("満室（×）判定");
    const msg =
      `【さかえや】${TARGET_DATE_PARAM} 満席でした（×）\n` +
      `runAt: ${runAt}\n` +
      `確認URL:\n${URL}\n` +
      `icon: ${result.iconClass ?? "n/a"}`;
    // await sendSms(msg); // 満席時のSMS送信は停止中（必要ならコメントを外す）
  } else {
    console.log("空き状況不明:", result.status);
    const msg =
      `【さかえや】${TARGET_DATE_PARAM} 判定不明\n` +
      `runAt: ${runAt}\n` +
      `status: ${result.status}\n` +
      `確認URL:\n${URL}`;
    await sendSms(msg);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
