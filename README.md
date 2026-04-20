# Claude Usage Monitor

A lightweight Windows desktop widget that tracks your Claude AI usage limits in real time — always-on-top, dark theme, auto-syncs from claude.ai.

## Features

- Shows **Session**, **All Models**, and **Sonnet Only** usage bars
- **Per-bar dynamic reset times** — follows whatever Claude shows
- **Daily budget pace** indicator — tells you if you're over or under pace for today
- **Auto-syncs** every 15 minutes silently in the background
- **System tray** integration — minimize to tray, restore on click
- **Auto-updates** via GitHub Releases
- Persistent session — log into Claude once, stays logged in

## Install

Download the latest `Claude Usage Monitor Setup X.Y.Z.exe` from [Releases](https://github.com/itskaruza/claude-usage-monitor/releases), run it, done.

Windows will show a SmartScreen warning because the installer isn't code-signed — click **More info** → **Run anyway**.

## How it works

The widget opens a hidden Electron browser window, loads `claude.ai/settings/usage` using your saved session cookies, and scrapes the percentages and reset times. On first run (or after your Claude session expires) the browser window pops up so you can log in — subsequent syncs happen silently.

## Development

```bash
npm install
npm start        # run from source
npm run dist     # build NSIS installer locally
npm run publish  # build and publish to GitHub Releases (requires GH_TOKEN)
```

## License

Personal use. Not affiliated with Anthropic.
