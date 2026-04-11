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

## Fight Data Pipeline

Run the update pipeline with:

```bash
npm run update:fights
```

### Manual Fight Overrides

Use `data/manualFights.json` to force-include important fights when sources miss them.

Required fields per entry:

- `sport`
- `fighters.red`
- `fighters.blue`
- `dateUTC`

Optional fields:

- `eventName`
- `location`
- `broadcaster`
- `link`
- `isTitleFight`
- `titleLabel`
- `titleDetails`

Example:

```json
{
  "fights": [
    {
      "sport": "boxing",
      "eventName": "WBO Heavyweight World Title",
      "fighters": {
        "red": "Fabio Wardley",
        "blue": "Daniel Dubois"
      },
      "dateUTC": "2026-05-09T16:00:00Z",
      "location": "Manchester, England",
      "broadcaster": "DAZN",
      "isTitleFight": true,
      "titleLabel": "WBO Heavyweight Title",
      "titleDetails": "Wardley's WBO heavyweight title",
      "link": "https://www.tapology.com/fightcenter/events/139645-wardley-vs-dubois"
    }
  ]
}
```

### Manual Override Lifecycle

- Manual entries are merged on every pipeline run.
- Manual entries are auto-pruned from `data/manualFights.json` after they are older than fight time + 12h buffer + 24h.
- GitHub Actions now commits both `data/fights.json` and `data/manualFights.json`, so auto-pruned manual entries persist in the repo.

### Boxing Title Fights

The ESPN boxing scraper now extracts:

- `isTitleFight`
- `titleDetails` (full source phrase)
- `titleLabel` (compact UI label, e.g. `WBO Cruiserweight Title`)

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
