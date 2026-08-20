import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BubbleBot, InlineKeyboard } from "../../jeejio-bubble/sdk/BubbleSDK.js";
import PixelMugS1 from "../../jeejio-bubble/devices/ext/PixelMugS1_1.0.ext.js";
import { apiBaseUrl, token, mpsID, mpsVersion } from "./config.dev.js";

const staticPort = Number(process.env.WEBAPP_PORT || 8809);
const webAppHost = process.env.WEBAPP_HOST || localAddressHint();
const generatedWebAppUrl = `http://${webAppHost}:${staticPort}/index.html`;
const mpsLaunchConfig = {
  id: mpsID, 
  version: mpsVersion,
};
const webAppUrl = withMpsLaunchConfig(process.env.WEBAPP_URL || generatedWebAppUrl);
const shouldServeStatic = !process.env.WEBAPP_URL;

const messages = {
  "zh-CN": {
    bindContent: "绑定 PixelMug 后即可运行 Duck Hunt。",
    bindButton: "绑定 PixelMug",
    openButton: "打开 Duck Hunt",
    intro: "**Duck Hunt**\n\n用手机摇杆移动 PixelMug 准星，对准飞鸭后按 FIRE 开火。漏掉三只鸭子，游戏结束。\n\n点击下方按钮开始游戏。",
    commands: "命令：/bindDevice，/duckHunt",
    commandBind: "绑定 PixelMug",
    commandDuckHunt: "打开 Duck Hunt",
  },
  "en-US": {
    bindContent: "Bind a PixelMug before running Duck Hunt.",
    bindButton: "Bind PixelMug",
    openButton: "Open Duck Hunt",
    intro: "**Duck Hunt**\n\nMove the PixelMug sight with the phone joystick and press FIRE when it is lined up with the duck. Three misses ends the game.\n\nTap below to start.",
    commands: "Commands: /bindDevice, /duckHunt",
    commandBind: "Bind PixelMug",
    commandDuckHunt: "Open Duck Hunt",
  },
};

const pixelMug = new PixelMugS1();
const bot = new BubbleBot(token, {
  apiBaseUrl,
  debug: process.env.DEBUG !== "false",
  observeWebAppDeviceCalls: true,
  webAppDeviceAccess: "any",
});

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

bot.on("web_app_device_call", async (ctx) => {
  const call = ctx.webAppDeviceCall || {};
  console.log("[duck-hunt-bot] WebApp device call", {
    direction: call.direction,
    method: call.method,
    slotId: call.slotId,
    deviceId: call.deviceId,
    result: call.result,
  });
});

bot.on("device_notify", async (ctx) => {
  const rawEvents = ctx.tal?.notify || [];
  const parsedEvents = pixelMug.parseNotify(rawEvents);
  console.log("[duck-hunt-bot] Device notify", {
    deviceId: ctx.from?.id,
    rawEvents,
    parsedEvents,
  });
});

bot.on("message", async (ctx) => {
  const locale = localeFromContext(ctx);
  const command = extractCommand(ctx.message?.content || ctx.message?.text || "");

  if (command === "/bindDevice") {
    await ctx.sendBindDevice({
      content: text(locale, "bindContent"),
      actionButtonTitle: text(locale, "bindButton"),
    });
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

if (shouldServeStatic) {
  await startStaticServer();
}

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

function startStaticServer() {
  const distRoot = fileURLToPath(new URL("../webapp/dist", import.meta.url));

  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const filePath = normalize(join(distRoot, decodeURIComponent(pathname)));
      const rel = relative(distRoot, filePath);

      if (rel.startsWith("..")) {
        sendStatus(res, 403, "Forbidden");
        return;
      }

      const info = await stat(filePath);
      if (!info.isFile()) {
        sendStatus(res, 404, "Not found");
        return;
      }

      res.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store",
      });
      createReadStream(filePath).pipe(res);
    } catch (error) {
      const message = String(error?.code || error?.message || error);
      if (message.includes("ENOENT")) {
        sendStatus(res, 404, "Build not found. Run npm run build first.");
        return;
      }
      sendStatus(res, 404, "Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(staticPort, "0.0.0.0", () => {
      server.off("error", reject);
      console.log(`Static WebApp server listening on http://0.0.0.0:${staticPort}`);
      resolve(server);
    });
  });
}

function sendStatus(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function withMpsLaunchConfig(url) {
  const next = new URL(url);
  next.searchParams.set("mps_id", mpsLaunchConfig.id);
  next.searchParams.set("mps_version", mpsLaunchConfig.version);
  return next.toString();
}

function withLocale(url, locale) {
  const next = new URL(url);
  next.searchParams.set("lang", locale);
  return next.toString();
}

function localAddressHint() {
  return process.env.HOST || "127.0.0.1";
}
