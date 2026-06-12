# @abdelrahmanhsn/jira-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects your AI IDE to Jira. Query your tickets, active sprint, and issue details directly from GitHub Copilot, Cursor, Claude Desktop, or any MCP-compatible client.

## Tools

| Tool | Description |
|------|-------------|
| `get_my_tickets` | Get all Jira tickets assigned to you, ordered by last updated |
| `get_active_sprint_tickets` | Get your tickets in the currently active sprint |
| `get_issue_details` | Get full details (description + attachments) for a specific issue key |
| `add_comment` | Add a comment to any Jira issue |
| `get_my_standup` | Get a standup summary of tickets you updated since yesterday |
| `get_sprint_summary` | Get all sprint tickets grouped by status (Todo / In Progress / Done) |
| `search_tickets` | Search tickets with plain English or raw JQL |
| `get_context_for_pr` | Extract Jira ticket from a branch name and return a ready-to-use PR description block |

## Prerequisites

- Node.js 18 or later
- A Jira Cloud account
- A Jira API token ([generate one here](https://id.atlassian.com/manage-profile/security/api-tokens))

## Setup

### 1. Get your Jira API token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Copy the token — you'll need it below

### 2. Configure your MCP client

Pick your AI IDE below and add the config. Replace the `env` values with your own.

---

#### GitHub Copilot (VS Code)

Open **User Settings (JSON)** via `Cmd+Shift+P` → `Open User Settings (JSON)` and add:

```json
"mcp": {
  "servers": {
    "jira-mcp": {
      "command": "npx",
      "args": ["-y", "@abdelrahmanhsn/jira-mcp"],
      "env": {
        "JIRA_EMAIL": "you@company.com",
        "JIRA_TOKEN": "your-api-token",
        "JIRA_DOMAIN": "yourcompany.atlassian.net",
        "JIRA_PROJECT": "PROJ"
      }
    }
  }
}
```

---

#### Cursor

Open `~/.cursor/mcp.json` (or `Cursor Settings → MCP`) and add:

```json
{
  "mcpServers": {
    "jira-mcp": {
      "command": "npx",
      "args": ["-y", "@abdelrahmanhsn/jira-mcp"],
      "env": {
        "JIRA_EMAIL": "you@company.com",
        "JIRA_TOKEN": "your-api-token",
        "JIRA_DOMAIN": "yourcompany.atlassian.net",
        "JIRA_PROJECT": "PROJ"
      }
    }
  }
}
```

---

#### Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "jira-mcp": {
      "command": "npx",
      "args": ["-y", "@abdelrahmanhsn/jira-mcp"],
      "env": {
        "JIRA_EMAIL": "you@company.com",
        "JIRA_TOKEN": "your-api-token",
        "JIRA_DOMAIN": "yourcompany.atlassian.net",
        "JIRA_PROJECT": "PROJ"
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_EMAIL` | ✅ | Your Jira account email |
| `JIRA_TOKEN` | ✅ | Your Jira API token |
| `JIRA_DOMAIN` | ✅ | Your Jira domain, e.g. `yourcompany.atlassian.net` |
| `JIRA_PROJECT` | ✅ | Your Jira project key, e.g. `PROJ` |

## Usage Examples

Once configured, you can ask your AI assistant:

- *"Show me my current Jira tickets"*
- *"What's in my active sprint?"*
- *"Get me the details for PROJ-1234"*
- *"Summarize the description of PROJ-5678"*
- *"Add a comment to PROJ-123 saying the fix is deployed to staging"*
- *"Give me my standup for today"*
- *"Summarize the active sprint — how many tickets are done vs in progress?"*
- *"Search for open bugs related to login"*
- *"Get PR context for branch STUD-17891-add-email-icon"*

## Security

- Credentials are **never** stored in code — they are injected at runtime by your MCP client
- Each user provides their own credentials in their local MCP config
- Your API token is only sent to your own Jira domain over HTTPS

## License

ISC
