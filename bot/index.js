import { BubbleBot, InlineKeyboard } from "@jeejio-bubble/bot/sdk";
import PixelMugS1 from "@jeejio-bubble/bot/devices/pixelmug-s1";

const token = requiredEnv("BOT_TOKEN");
const webAppUrl = launchUrl(requiredEnv("STUDIO_WEBAPP_URL"));
const bot = new BubbleBot(token, {
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  webAppDeviceAccess: "any",
});

const messages = {
  "zh-CN": {
    bindContent: "绑定 PixelMug 后即可运行 Duck Hunt。",
    bindButton: "绑定 PixelMug",
    addedIntro: "你好，我是 Duck Hunt 游戏智能体。我的主要功能是让你用手机摇杆控制 PixelMug 上的准星，瞄准飞鸭并开火，挑战更高命中数。在使用之前，请先绑定你的 PixelMug。",
    openButton: "打开 Duck Hunt",
    intro: "**Duck Hunt**\n\n用手机摇杆移动 PixelMug 准星，对准飞鸭后按 FIRE 开火。漏掉三只鸭子，游戏结束。\n\n点击下方按钮开始游戏。",
    commands: "命令：/bindDevice，/duckHunt",
    commandBind: "绑定 PixelMug",
    commandDuckHunt: "打开 Duck Hunt",
  },
  "en-US": {
    bindContent: "Bind a PixelMug before running Duck Hunt.",
    bindButton: "Bind PixelMug",
    addedIntro: "Hello, I am the Duck Hunt game agent. I let you use your phone joystick to control the sight on PixelMug, aim at flying ducks, fire, and chase a higher hit count. Before you start, please bind your PixelMug.",
    openButton: "Open Duck Hunt",
    intro: "**Duck Hunt**\n\nMove the PixelMug sight with the phone joystick and press FIRE when it is lined up with the duck. Three misses ends the game.\n\nTap below to start.",
    commands: "Commands: /bindDevice, /duckHunt",
    commandBind: "Bind PixelMug",
    commandDuckHunt: "Open Duck Hunt",
  },
};

const pixelMug = new PixelMugS1();
bot.registerDevices([pixelMug]);

bot.on("error", async (ctx) => {
  console.error("[duck-hunt-bot]", ctx.error || ctx);
});

bot.on("web_app_data", async (ctx) => {
  const data = ctx.webAppData || {};
  if (data.type !== "app.duckHuntResult") return;

  const payload = data.payload || {};
  const user = userInfoFromContext(ctx);
  console.log(`[duck-hunt-bot] user ${user.username || user.userId || "unknown"} hit ${Number(payload.hits || 0)} ducks`, {
    userId: user.userId,
    username: user.username,
    hits: Number(payload.hits || 0),
    misses: Number(payload.misses || 0),
    reportedAt: payload.reportedAt,
  });
});


bot.on("contact_added", async (ctx) => {
  await sendAddedIntro(ctx);
});

bot.on("joined_group", async (ctx) => {
  await sendAddedIntro(ctx, { mentionOnly: false });
});

bot.on("message", async (ctx) => {
  const locale = localeFromContext(ctx);
  const command = extractCommand(ctx.message?.content || ctx.message?.text || "");

  if (command === "/bindDevice") {
    await sendBindDevice(ctx, locale);
    return;
  }

  if (command === "/duckHunt" || command === "/webapp" || command === "/start") {
    const keyboard = new InlineKeyboard().url(text(locale, "openButton"), withLocale(webAppUrl, locale));
    await ctx.sendKeyboard(
      text(locale, "intro"),
      keyboard,
      {
        mentionOnly: ctx.chat?.type === "group" ? true : undefined,
      }
    );
    return;
  }

  await ctx.sendText(text(locale, "commands"));
});

await bot.setCommands([
  {
    command: "bindDevice",
    description: messages["en-US"].commandBind,
    descTranslations: {
      "zh-CN": messages["zh-CN"].commandBind,
      en: messages["en-US"].commandBind,
    },
  },
  {
    command: "duckHunt",
    description: messages["en-US"].commandDuckHunt,
    descTranslations: {
      "zh-CN": messages["zh-CN"].commandDuckHunt,
      en: messages["en-US"].commandDuckHunt,
    },
  },
]);

await bot.start();

console.log("mps-duck-hunt bot is running.");
console.log(`WebApp URL: ${webAppUrl}`);

function userInfoFromContext(ctx) {
  const from = ctx.from || {};
  return {
    userId: from.id || from.userId || (typeof ctx.from === "string" ? ctx.from : undefined),
    username: from.username || from.userName || from.name || from.nickName || from.nickname,
  };
}

function extractCommand(text) {
  const match = String(text || "").trim().match(/\/[a-zA-Z0-9_-]+(?:@[a-zA-Z0-9_-]+)?/);
  if (!match) return "";
  return match[0].split("@")[0];
}

function localeFromContext(ctx) {
  const value = ctx.chat?.language || ctx.from?.language || process.env.APP_LOCALE;
  return normalizeLocale(value);
}

function normalizeLocale(value) {
  const source = String(value || "").toLowerCase();
  return source.startsWith("zh") ? "zh-CN" : "en-US";
}

function text(locale, key) {
  return messages[locale]?.[key] || messages["en-US"][key] || key;
}

function sendAddedIntro(ctx, options = {}) {
  const locale = localeFromContext(ctx);
  return ctx.sendBindDevice({
    content: text(locale, "addedIntro"),
    actionButtonTitle: text(locale, "bindButton"),
    ...options,
  });
}

function sendBindDevice(ctx, locale = localeFromContext(ctx)) {
  return ctx.sendBindDevice({
    content: text(locale, "bindContent"),
    actionButtonTitle: text(locale, "bindButton"),
  });
}

function launchUrl(value) {
  const next = new URL(value);
  next.searchParams.set("mps_id", requiredEnv("STUDIO_MPS_ID"));
  next.searchParams.set("mps_version", requiredEnv("STUDIO_MPS_VERSION"));
  return next.toString();
}

function withLocale(url, locale) {
  const next = new URL(url);
  next.searchParams.set("lang", locale);
  return next.toString();
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
