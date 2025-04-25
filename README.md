# Solar Panel Installation Calculator

A web application that helps users visualize and calculate solar panel installations based on their property's satellite imagery and electricity usage.

## Features

- Address search with satellite map view
- Draw tool for marking installation areas
- Electricity usage input
- Solar offset calculator
- Installation summary with estimated savings
- Email quotation system

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Shadcn UI
- MapBox for mapping
- Recharts for data visualization
- Resend for email

## Prerequisites

Before you begin, ensure you have:
- Node.js 18+ installed
- pnpm installed
- A MapBox API key
- A Resend API key

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd <project-directory>
```

2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env.local` file in the root directory with the following variables:
```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
RESEND_API_KEY=your_resend_api_key_here
```

4. Start the development server:
```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

The project follows a component-based architecture with the following structure:

```
src/
  components/     # React components
  pages/          # Next.js pages
  lib/            # Utility functions
  styles/         # Global styles
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

MIT
// trigger redeploy
# groundmounts-app
