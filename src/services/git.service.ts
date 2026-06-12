import { execSync } from "child_process";

/**
 * Wrapper for git and gh CLI operations.
 */
export const gitService = {
  detectGitRepo(): string {
    return execSync("git rev-parse --show-toplevel", { stdio: "pipe" }).toString().trim();
  },

  verifyGhCli(): void {
    execSync("gh --version", { stdio: "pipe" });
  },

  verifyGhAuth(): void {
    execSync("gh auth status", { stdio: "pipe" });
  },

  createBranch(workingDir: string, branchName: string): string {
    try {
      execSync(`git -C "${workingDir}" checkout -b "${branchName}"`, { stdio: "pipe" });
      return `✅ Created and switched to branch: ${branchName}`;
    } catch (e: any) {
      const stderr = e.stderr?.toString() ?? "";
      if (stderr.includes("already exists")) {
        try {
          execSync(`git -C "${workingDir}" checkout "${branchName}"`, { stdio: "pipe" });
          return `✅ Branch already exists — switched to: ${branchName}`;
        } catch {
          throw new Error(`Branch exists but could not switch: ${stderr}`);
        }
      } else {
        throw new Error(`Git error: ${stderr || e.message}`);
      }
    }
  }
};
