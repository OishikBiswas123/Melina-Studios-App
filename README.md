# Melina Studio App

Expo React Native app shell for the Melina Studio mobile experience.

The app loads the production Melina Studio frontend at `https://melina.studio`, so it reuses the existing website UI, auth flow, boards, canvas, chat, and backend integration.

## Run locally

```bash
npm install
npm run start
```

Press `a` in the Expo terminal to run on an Android emulator, or scan the QR code with Expo Go.

Your phone must be on the same Wi-Fi network as this computer for the default QR code to work.
If Expo Go cannot connect, use:

```bash
npm run start:tunnel
```

If the app opens but shows an old error, restart with cache cleared:

```bash
npm run start:clear
```

## Configure target URL

Create `.env` from `.env.example` and set:

```bash
EXPO_PUBLIC_APP_URL=https://melina.studio
```

For local testing against the cloned web app, use a LAN URL instead of `localhost`, for example:

```bash
EXPO_PUBLIC_APP_URL=http://192.168.1.10:3000
```

## Android package

The current Android package is:

```text
studio.melina.app
```

Update `app.json` before Play Store submission if the company wants a different package name.
