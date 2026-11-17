import { loadConfig } from "./config.mjs";
import { createProxy } from "./server.mjs";
import { openStore } from "./store.mjs";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`demo-proxy: ${err.message}`);
  process.exit(1);
}

const store = await openStore(config.redisUrl);
const proxy = createProxy({ config, store });
const port = await proxy.listen(config.port, "0.0.0.0");
console.log(
  JSON.stringify({
    time: new Date().toISOString(),
    event: "listening",
    port,
    installBudgetUsd: config.installBudget / 1e6,
    dailyBudgetUsd: config.dailyBudget / 1e6,
    maxConversations: config.limits.conversations,
  }),
);

const stop = async () => {
  await proxy.close();
  await store.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
