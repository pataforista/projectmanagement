# Cloudflare D1 Setup Guide

## Overview
This guide documents the setup of Cloudflare D1 database integration with the backend Worker.

## Configuration Details

### Wrangler Configuration
- Root directory: `/backend`
- Build command: None (using direct deployment)
- Deploy command: `npx wrangler deploy`
- D1 Database ID: `ad306137-1205-4d00-8121-cfd408426d77`

### Environment Setup
1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Set CLOUDFLARE_API_TOKEN:
   ```bash
   export CLOUDFLARE_API_TOKEN=your_token_here
   ```

3. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

### Database Migrations
Apply migrations to the remote D1 database:
```bash
npx wrangler d1 migrations apply workspace-db --remote
```

### Required Environment Variables
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `JWT_SECRET`: Secret for JWT signing
- `GOOGLE_CLIENT_ID`: Google OAuth client ID

## Dependencies
- hono: ^4.1.0 (Web framework)
- jose: ^5.2.3 (JWT handling)
- google-auth-library: ^9.7.0 (Google authentication)
