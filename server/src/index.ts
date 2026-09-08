import "./lib/sentry-init.js";
import { createApp } from "./app.js";
import { startScheduler } from "./lib/scheduler.js";
import { validateStartupEnv } from "./lib/validate-startup-env.js";

validateStartupEnv();

const app = createApp();
const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`billa server listening on :${port}`);
});

startScheduler();
