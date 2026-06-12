import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export const server = new McpServer({
  name: "jira-mcp",
  version: "1.8.0",
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
