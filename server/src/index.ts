import { createServer } from "node:http";
import { app } from "./app";
import { config } from "./config";
import { initRealtime } from "./realtime";

const httpServer = createServer(app);
initRealtime(httpServer);

httpServer.listen(config.port, () => {
  console.log(`API + realtime on http://localhost:${config.port}`);
});
