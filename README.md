# Duck Hunt

Duck Hunt is a complete PixelMug Studio application. The Bot opens a Vue WebApp, the WebApp installs and starts the device program, and the phone becomes a BLE controller for the PixelMug sight.

## Project layout

- `bot/` contains the Bubble Bot entry point.
- `webapp/` contains the Vue controller and BLE client.
- `mpy/` contains the MicroPython game, sprite sheet, and firing sound.

## Local development

Install dependencies from the project root and from the WebApp directory:

```sh
npm install
npm --prefix webapp install
npm run build
```

Run the Bot with the environment values supplied by PixelMug Studio:

- `BOT_TOKEN`
- `BOT_API_BASE_URL`
- `STUDIO_WEBAPP_URL`
- `STUDIO_MPS_ID`
- `STUDIO_MPS_VERSION`

The Bot adds `mps_id` and `mps_version` to the WebApp URL. When the WebApp opens in Studio, it automatically finds the bound PixelMug, installs the MPY app, starts it, and connects over BLE.

The BLE application ID is `DuckHunt` in both `webapp/src/template/bleSession.ts` and `mpy/__main__.py`.

## Controls

Move the pointer on the aim pad to move the sight. Press **FIRE** to start the game and shoot ducks. Three misses end the round. The sound toggle controls the firing effect on the device.

Open the project directory in PixelMug Studio to bind a device, build the WebApp, and run the MPY program.
