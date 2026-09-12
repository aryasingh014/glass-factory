import serverless from "serverless-http";
import { createServer } from "../../server/index";

const app = createServer();

// Wrap the fully-built Express app with serverless-http for Netlify Functions.
// IMPORTANT: This file is bundled by vite.config.netlify.ts which resolves
// all TypeScript path aliases (@shared/*, etc.) before Netlify deploys it.
// The build output at netlify/functions-dist/api.mjs is what Netlify executes.
export const handler = serverless(app);
