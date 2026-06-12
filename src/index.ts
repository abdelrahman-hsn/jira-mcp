import { config } from "./config.js";
import { launchSetupUi } from "./services/setup-ui.js";
import { startMcpServer } from "./mcp-server.js";
import { registerTools } from "./tools/index.js";

async function main() {
  // Register all tools onto the server instance
  registerTools();

  if (config.missing.length > 0) {
    await launchSetupUi(async () => {
      await startMcpServer();
    });
  } else {
    await startMcpServer();
  }
}

main().catch(console.error);
