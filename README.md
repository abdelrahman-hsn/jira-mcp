# @abdelrahmanhsn/jira-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects your AI IDE to Jira. Query tickets, manage sprints, and let AI autonomously implement, test, and ship Jira tickets — all without leaving your editor.

Works with GitHub Copilot, Cursor, Claude Desktop, and any MCP-compatible client.

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
| `start_ticket` | **🤖 Autonomous mode** — assigns ticket, moves to In Progress, creates git branch, then drives AI to implement, test, commit, push, open PR, and comment on Jira — non-stop |

## Prerequisites

- Node.js 18 or later
- A Jira Cloud account
- A Jira API token ([generate one here](https://id.atlassian.com/manage-profile/security/api-tokens))
- **GitHub CLI** — required for `start_ticket` to create PRs automatically

### Install GitHub CLI

```bash
# macOS
brew install gh
gh auth login

# Windows
winget install --id GitHub.cli
gh auth login

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md
gh auth login
```

> If `gh` is not installed or not authenticated, `start_ticket` will return clear instructions instead of silently failing.

## Setup

### 1. Get your Jira API token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Copy the token — you'll need it below

### 2. Configure your MCP client

**✨ The easiest way (Web Setup UI):** 
Simply add the server to your MCP config without any environment variables. When the MCP server starts, it will automatically launch an interactive web UI in your browser (`http://localhost:9898`). You can enter your Jira credentials there, and it will securely save them directly into your AI IDE's local configuration file and seamlessly start the MCP server!

*Supported auto-save clients: VS Code, Cursor, Claude Desktop, and Antigravity.*

**Or, configure it manually:**

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

### Everyday queries

- *"Show me my current Jira tickets"*
- *"What's in my active sprint?"*
- *"Get me the details for PROJ-1234"*
- *"Add a comment to PROJ-123 saying the fix is deployed to staging"*
- *"Give me my standup for today"*
- *"Summarize the active sprint — how many tickets are done vs in progress?"*
- *"Search for open bugs related to login"*

### PR workflow

- *"Get PR context for branch STUD-17891-add-email-icon"*
  → Extracts the ticket key from the branch, fetches description + comments, returns a formatted PR description block ready to paste or expand.

### Autonomous mode — `start_ticket`

The most powerful tool. One prompt and AI does everything:

```
"Start working on STUD-17931"
```

**What happens automatically, with no stops:**
1. ✅ Self-assigns the Jira ticket to you
2. ✅ Moves it to **In Progress**
3. ✅ Creates and switches to a git branch (e.g. `stud-17931-content-preview-bug`)
4. ✅ AI reads description, acceptance criteria, and comments
5. ✅ Implements the feature/fix
6. ✅ Runs the test suite — fixes failures automatically
7. ✅ Commits and pushes the branch
8. ✅ Opens a PR via `gh pr create`
9. ✅ Posts the PR link as a comment on the Jira ticket

You can optionally pass the repo path:

```
"Start working on STUD-17931 in /Users/you/code/my-project"
```

If omitted, the tool auto-detects the git repo from the current working directory.

## Security

- Credentials are **never** stored in code — they are injected at runtime by your MCP client
- Each user provides their own credentials in their local MCP config
- Your API token is only sent to your own Jira domain over HTTPS

## License

ISC
