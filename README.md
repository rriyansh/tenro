# Tenro

Personal AI agent workspace.

## Run locally

Requires Node.js 22.

```bash
npm install
npm run dev
```

Open http://localhost:8080 and create an account with email and password.

Grok replies need an xAI key:

```bash
XAI_API_KEY=your-key-here npm run dev
```

Without `DATABASE_URL`, Tenro uses a temporary database that resets when the server stops. Google and X sign-in work on the hosted app, not in this local copy.
