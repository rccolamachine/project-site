This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Pager Telemetry Bridge (Pi-Star/MMDVM)

The Pager UI telemetry panel is fed by `POST /api/pager/telemetry`. The app does
not automatically connect to Pi-Star by itself; Pi-Star (or another bridge) must
push events into this endpoint.

A helper bridge script and systemd setup templates are included at:

`scripts/pager_telemetry_bridge.sh`
`scripts/pager_telemetry_bridge.service`
`scripts/pager_telemetry.env.example`
`scripts/install_pistar_pager_telemetry_bridge.sh`

### One-time install on Pi-Star (persistent service)

```bash
chmod +x scripts/install_pistar_pager_telemetry_bridge.sh
./scripts/install_pistar_pager_telemetry_bridge.sh
sudo nano /etc/pager-telemetry.env
sudo systemctl restart pager-telemetry-bridge
sudo systemctl --no-pager --full status pager-telemetry-bridge
journalctl -u pager-telemetry-bridge -f
```

`/etc/pager-telemetry.env` must contain:

```bash
# Recommended default (production only):
PAGER_TELEMETRY_URL="https://rccolamachine.com/api/pager/telemetry"

# Optional fan-out to local dev while testing:
# PAGER_TELEMETRY_URLS="https://rccolamachine.com/api/pager/telemetry,http://192.168.1.66:3000/api/pager/telemetry"
PAGER_TELEMETRY_SECRET="<your-secret>"
MMDVM_LOG_GLOB="/var/log/pi-star/MMDVM-*.log"
MMDVM_LOG_SWITCH_INTERVAL_SEC="30"
```

### Manual run (no systemd)

```bash
chmod +x scripts/pager_telemetry_bridge.sh

PAGER_TELEMETRY_URL="https://<your-site>/api/pager/telemetry" \
PAGER_TELEMETRY_SECRET="<your-secret>" \
MMDVM_LOG_GLOB="/var/log/pi-star/MMDVM-*.log" \
./scripts/pager_telemetry_bridge.sh
```

```bash
PAGER_TELEMETRY_URLS="https://rccolamachine.com/api/pager/telemetry,http://192.168.1.66:3000/api/pager/telemetry" \
PAGER_TELEMETRY_SECRET="<your-secret>" \
MMDVM_LOG_GLOB="/var/log/pi-star/MMDVM-*.log" \
./scripts/pager_telemetry_bridge.sh
```

Notes:

- Regexes are configurable with:
  - `GATEWAY_RECEIVED_REGEX`
  - `MMDVM_TX_STARTED_REGEX`
  - `MMDVM_TX_COMPLETED_REGEX`
- Telemetry destination can be set as:
  - `PAGER_TELEMETRY_URL` for one endpoint
  - `PAGER_TELEMETRY_URLS` for many endpoints (comma-separated fan-out)
- Log source can be set as:
  - `MMDVM_LOG_FILE` for one exact file
  - `MMDVM_LOG_GLOB` for rotating files (recommended)
  - `MMDVM_LOG_SWITCH_INTERVAL_SEC` to control how often newest-file checks run
- The telemetry endpoint accepts stage-only updates and can correlate to the most
  recent pending pager request.

### Quick ingest test

```bash
curl -i -X POST "https://<your-site>/api/pager/telemetry" \
  -H "Content-Type: application/json" \
  -H "x-pager-telemetry-secret: <your-secret>" \
  --data '{"stage":"gateway_received","detail":"manual test"}'
```
