# Changelog

All notable changes to this project will be documented in this file.

## [1.7.0] - 2026-06-12

### Added
- **Interactive Web Setup UI**: Added a local web server (runs on port 9898) that launches automatically when Jira credentials are missing. It provides a beautiful, secure UI to input your Jira Email, API Token, Domain, and Project key.
- **Auto-Config Saver**: The Setup UI automatically detects configurations for VS Code, Cursor, Claude Desktop, and Antigravity, and securely saves your credentials directly into the respective local MCP configuration files.
- **Seamless Startup**: After submitting credentials via the Setup UI, the server seamlessly initializes the MCP transport and starts running without requiring a manual process restart, preventing client `EOF` initialization errors.
- **Preserve Custom Commands**: The configuration updater intelligently preserves existing custom run commands (e.g., local `node` execution vs global `npx`) and arguments, strictly updating the `env` block.

### Fixed
- Fixed an issue where automated configuration updates could overwrite custom `command` or `args` fields in `mcp.json` or `mcp_config.json` files.
