This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## URL parameters

The funnel reads a few parameters from the query string.

| Parameter | What it does |
| --- | --- |
| `?step=n` | Opens the funnel at step `n` (0–5). Kept in sync as the customer moves, so the phone back button steps backwards through the funnel instead of leaving the page — which, inside an iframe, means leaving the host site. |
| `?source=` | Recorded on the lead so you can tell which landing page it came from. Falls back to the brand domain. |
| `?zipcode=` | Geocoded on load, so a partner site can hand the customer straight to a located map. |
| `?state=` | Two-letter state on the lead. Defaults to `TX`. |
| `?reset=1` | **Clears the whole funnel** — store and saved progress — and lands on step 1 with a fresh lead id. The parameter is stripped afterwards, so refreshing does not wipe the new run as well. For demos and for testing on a phone, where clearing site data by hand is a nuisance. |

Once a lead has been filed to Airtable, the design steps are closed: the
progress bar, the back button and a hand-typed `?step=` all land on "Start over
to change your design". Use `?reset=1` or that link to begin again.

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
