#!/usr/bin/env node
import { execSync } from "node:child_process";

/**
 * Pre-commit secret scanner.
 *
 * Scans the STAGED content (git index, not the working tree) of every staged
 * file for common secret patterns:
 *   - sk- style API keys (Anthropic/OpenAI style)
 *   - Slack tokens (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-)
 *   - Telegram bot tokens (<digits>:<35 alphanumeric chars>)
 *   - well-known env vars (ANTHROPIC_API_KEY, SLACK_WEBHOOK_URL,
 *     TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) assigned a non-empty value
 *
 * Files like .env.example are fine because their values are empty
 * (`KEY=`) - only a non-empty assignment triggers a finding.
 *
 * On any finding, prints "<file>:<line> [<rule>]" for every hit and exits
 * with code 1 so the commit is aborted. Exits 0 when nothing suspicious is
 * found (including when nothing is staged).
 */

const SECRET_PATTERNS = [
  {
    name: "Generic sk- style API key",
    regex: /\bsk-[A-Za-z0-9_-]{16,}\b/,
  },
  {
    name: "Google API key (AIzaSy...)",
    regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/,
  },
  {
    name: "Slack token (xoxb-/xoxp-/xoxa-/xoxr-/xoxs-)",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    name: "Telegram bot token",
    regex: /\b\d{6,10}:[A-Za-z0-9_-]{35}\b/,
  },
];

// env vars that must never carry a real value in tracked files
const SENSITIVE_ENV_KEYS = [
  "GEMINI_API_KEY",
  "SLACK_WEBHOOK_URL",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "KAKAO_REST_API_KEY",
  "KAKAO_CLIENT_SECRET",
  "KAKAO_REFRESH_TOKEN",
];

const ENV_ASSIGNMENT_REGEX = new RegExp(
  `^\\s*(${SENSITIVE_ENV_KEYS.join("|")})\\s*=\\s*(.+?)\\s*$`
);

function getStagedFiles() {
  const output = execSync(
    "git diff --cached --name-only --diff-filter=ACM",
    { encoding: "utf8" }
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getStagedContent(filePath) {
  try {
    // ":path" reads the staged (index) blob, not whatever is on disk.
    return execSync(`git show ":${filePath}"`, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch {
    // binary file git can't decode as utf8, or path no longer resolvable
    return null;
  }
}

function isProbablyBinary(content) {
  return content.includes("\u0000");
}

function stripQuotes(value) {
  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  if (isDoubleQuoted || isSingleQuoted) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function scanFile(filePath) {
  const content = getStagedContent(filePath);
  if (content === null || isProbablyBinary(content)) return [];

  const findings = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("#")) return; // comment lines never count

    const envMatch = line.match(ENV_ASSIGNMENT_REGEX);
    if (envMatch) {
      const key = envMatch[1];
      const value = stripQuotes(envMatch[2]);
      if (value.length > 0) {
        findings.push({
          file: filePath,
          line: lineNo,
          rule: `${key} has a non-empty value`,
          snippet: trimmedLine,
        });
      }
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          file: filePath,
          line: lineNo,
          rule: pattern.name,
          snippet: trimmedLine,
        });
      }
    }
  });

  return findings;
}

function main() {
  let stagedFiles;
  try {
    stagedFiles = getStagedFiles();
  } catch (err) {
    console.error("[check-secrets] failed to read staged files:", err.message);
    process.exit(1);
    return;
  }

  if (stagedFiles.length === 0) {
    process.exit(0);
    return;
  }

  const allFindings = stagedFiles.flatMap(scanFile);

  if (allFindings.length > 0) {
    console.error("\n[check-secrets] commit blocked - possible secret(s) found:\n");
    for (const finding of allFindings) {
      console.error(`  ${finding.file}:${finding.line}  [${finding.rule}]`);
      console.error(`    ${finding.snippet}`);
    }
    console.error(
      "\nIf this is a real secret: remove it from the commit, move it into your untracked .env, and rotate/revoke the token immediately."
    );
    console.error(
      "If this is a false positive: adjust the patterns in scripts/check-secrets.js.\n"
    );
    process.exit(1);
    return;
  }

  process.exit(0);
}

main();
