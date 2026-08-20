# Duck Hunt

PixelMug 上的飞鸭射击小游戏，由横屏 WebApp 手柄通过 BLE 控制。

## 目录

    duck-hunt/
      bot/      Bubble bot 与 WebApp 静态服务器
      webapp/   Vue 3 绝对定位触控手柄
      mpy/      MicroPython 游戏、精灵图与开火音效

## 控制协议

WebApp 通过 F160 Simple BLE 高速通道发送二进制控制包：`[0x01, x, y]` 将准星中心直接定位到原生 `32x16` 坐标，`[0x02]` 表示开火或在 Game Over 后重新开始。移动消息采用 latest-only 合并，BLE 忙时只保留最新坐标；开火包优先于等待中的移动包。MPY 仍兼容单字节 ASCII `U`、`D`、`L`、`R`、`F`，并保留同名 F150 实时/可靠命令，以及 `duckHuntControl` 和 `duckHuntGetState` 调试命令。

鸭子的完整 8px 宽精灵与命中动画始终限制在曲面屏中央 `x=4..27` 可视区域内；准星仍可在整个 32x16 屏幕上移动。

## 运行

先在 `bot/config.dev.js` 填写 bot token、API 地址、MPS ID 与版本；WebApp 也可以通过 `VITE_MPS_ID`、`VITE_MPS_VERSION` 或 URL 查询参数 `mps_id`、`mps_version` 获取 MPS 信息。

    npm --prefix webapp install
    npm run build
    npm run bot
