import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const windowsBashCandidates = [
	`${process.env.ProgramFiles ?? "C:\\Program Files"}\\Git\\bin\\bash.exe`,
	`${process.env.ProgramFiles ?? "C:\\Program Files"}\\Git\\usr\\bin\\bash.exe`,
];

const bash = process.platform === "win32" ? windowsBashCandidates.find((candidate) => existsSync(candidate)) : "bash";

if (!bash) {
	process.stderr.write("Audit requires Git Bash on Windows. Install Git for Windows and run this command again.\n");
	process.exit(1);
}

const result = spawnSync(bash, ["scripts/audit-rules.sh", "apps/web/src", ...process.argv.slice(2)], {
	stdio: "inherit",
});

if (result.error) {
	process.stderr.write(`Could not start the audit: ${result.error.message}\n`);
	process.exit(1);
}

process.exit(result.status ?? 1);
