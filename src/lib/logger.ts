const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";

function timestamp(): string {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export const log = {
  info(msg: string) {
    console.log(`${DIM}[${timestamp()}]${RESET} ${BLUE}ℹ${RESET}  ${msg}`);
  },
  success(msg: string) {
    console.log(`${DIM}[${timestamp()}]${RESET} ${GREEN}✓${RESET}  ${msg}`);
  },
  warn(msg: string) {
    console.log(`${DIM}[${timestamp()}]${RESET} ${YELLOW}⚠${RESET}  ${msg}`);
  },
  error(msg: string) {
    console.log(`${DIM}[${timestamp()}]${RESET} ${RED}✗${RESET}  ${msg}`);
  },
  step(n: number, total: number, msg: string) {
    const pct = Math.round((n / total) * 100);
    const bar = progressBar(n, total, 20);
    process.stdout.write(
      `\r${DIM}[${timestamp()}]${RESET} ${CYAN}${bar}${RESET} ${DIM}${n}/${total} (${pct}%)${RESET} ${msg.slice(0, 60).padEnd(60)}`
    );
    if (n === total) process.stdout.write("\n");
  },
  header(msg: string) {
    console.log(`\n${BOLD}${MAGENTA}▶ ${msg}${RESET}`);
    console.log(`${DIM}${"─".repeat(50)}${RESET}`);
  },
  summary(lines: [string, string | number][]) {
    console.log(`\n${DIM}${"─".repeat(50)}${RESET}`);
    for (const [label, value] of lines) {
      console.log(`  ${label.padEnd(24)} ${BOLD}${value}${RESET}`);
    }
  },
};

function progressBar(current: number, total: number, width: number): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
