import readline from "node:readline";

export const AGENTOS_BOOT_HEADER = ` █████╗  ██████╗ ███████╗███╗   ██╗████████╗ ██████╗ ███████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔═══██╗██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║   ██║███████╗
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║   ██║╚════██║
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ╚██████╔╝███████║
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚══════╝`;

export const TERMINAL_THEME = {
  primaryCyan: "#36D7E8",
  softCyan: "#8BE9FD",
  successGreen: "#39D353",
  warningAmber: "#D7BA2F",
  dangerRed: "#FF5C5C",
  mutedGray: "#8B949E",
  textWhite: "#F0F6FC",
  dividerGray: "#30363D"
};

const BOOT_TAGLINE = "Built on OpenClaw · Human operating layer for AI agents";
const COMPACT_HEADER = "AgentOS · Built on OpenClaw";
const MEDIUM_HEADER_MIN_COLUMNS = 48;
const LARGE_HEADER_MIN_COLUMNS = 82;
const MEDIUM_WORDMARK = [
  "▄▀█ █▀▀ █▀▀ █▄░█ ▀█▀ █▀█ █▀",
  "█▀█ █▄█ ██▄ █░▀█  █  █▄█ ▄█"
];

const STATE_META = {
  checking: { label: "CHECKING", color: "primary", symbol: "…", ascii: "..." },
  waiting: { label: "WAITING", color: "muted", symbol: "…", ascii: "..." },
  loading: { label: "LOADING", color: "primary", symbol: "…", ascii: "..." },
  starting: { label: "STARTING", color: "primary", symbol: "…", ascii: "..." },
  resolving: { label: "RESOLVING", color: "primary", symbol: "…", ascii: "..." },
  preparing: { label: "PREPARING", color: "primary", symbol: "…", ascii: "..." },
  connected: { label: "CONNECTED", color: "success", symbol: "✓", ascii: "OK" },
  active: { label: "ACTIVE", color: "success", symbol: "✓", ascii: "OK" },
  ready: { label: "READY", color: "success", symbol: "✓", ascii: "OK" },
  success: { label: "SUCCESS", color: "success", symbol: "✓", ascii: "OK" },
  ok: { label: "OK", color: "success", symbol: "✓", ascii: "OK" },
  warning: { label: "WARNING", color: "warning", symbol: "⚠", ascii: "!" },
  degraded: { label: "DEGRADED", color: "warning", symbol: "⚠", ascii: "!" },
  failed: { label: "FAILED", color: "danger", symbol: "✕", ascii: "x" },
  unreachable: { label: "UNREACHABLE", color: "danger", symbol: "✕", ascii: "x" },
  broken: { label: "BROKEN", color: "danger", symbol: "✕", ascii: "x" },
  disabled: { label: "DISABLED", color: "muted", symbol: "–", ascii: "-" },
  skipped: { label: "SKIPPED", color: "muted", symbol: "–", ascii: "-" },
  inactive: { label: "INACTIVE", color: "muted", symbol: "–", ascii: "-" },
  pending: { label: "PENDING", color: "muted", symbol: "–", ascii: "-" }
};

const VALID_STATES = new Set(Object.keys(STATE_META));

const STATUS_ROWS = [
  ["openclawGateway", "OpenClaw Gateway", "checking", ""],
  ["nativeGateway", "Native Gateway", "waiting", ""],
  ["workspaceEngine", "Workspace Engine", "loading", ""],
  ["agentRuntime", "Agent Runtime", "starting", ""],
  ["models", "Models", "resolving", ""],
  ["channels", "Channels", "preparing", ""],
  ["localServerUrl", "Local Server URL", "pending", ""]
];

const UNICODE_FRAMES = [
  "Workspace ▣──◆──▢ Agent ▢────▣ Channel",
  "Workspace ▣────▣ Agent ▢──◆──▢ Channel",
  "Workspace ▢────▣ Agent ▣──◆──▢ Channel",
  "Workspace ▢──◆──▢ Agent ▣────▣ Channel"
];

const ASCII_FRAMES = [
  "Workspace [#]--<>--[ ] Agent [ ]----[#] Channel",
  "Workspace [#]----[#] Agent [ ]--<>--[ ] Channel",
  "Workspace [ ]----[#] Agent [#]--<>--[ ] Channel",
  "Workspace [ ]--<>--[ ] Agent [#]----[#] Channel"
];

export function createTerminalBoot(options = {}) {
  return new TerminalBoot(options);
}

export function shouldUsePlainBoot(options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (options.plain) {
    return true;
  }

  if (env.CI || env.AGENTOS_BOOT_UI === "0") {
    return true;
  }

  if (env.AGENTOS_FORCE_BOOT_UI === "1") {
    return false;
  }

  return !stdout.isTTY || !stderr.isTTY;
}

export function supportsBootColor(options = {}) {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;

  if (env.NO_COLOR || env.FORCE_COLOR === "0") {
    return false;
  }

  return Boolean(stdout.isTTY || env.AGENTOS_FORCE_BOOT_UI === "1") && env.TERM !== "dumb";
}

export function supportsBootUnicode(env = process.env) {
  if (env.AGENTOS_ASCII_BOOT === "1") {
    return false;
  }

  if (process.platform !== "win32") {
    return true;
  }

  return Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI === "ON" || env.ANSICON);
}

export function renderBootFrame(options = {}) {
  const env = options.env ?? process.env;
  const columns = normalizeColumns(options.columns);
  const color = createColor(options.color);
  const unicode = options.unicode ?? supportsBootUnicode(env);
  const compact = !unicode || columns < MEDIUM_HEADER_MIN_COLUMNS;
  const forceLarge = env.AGENTOS_LARGE_BOOT_HEADER === "1";
  const large = !compact && (forceLarge || columns >= LARGE_HEADER_MIN_COLUMNS) && env.AGENTOS_MEDIUM_BOOT_HEADER !== "1";
  const statusRows = normalizeRows(options.statusRows);
  const complete = Boolean(options.complete);
  const frameIndex = options.frameIndex ?? 0;

  if (complete) {
    return renderCompleteFrame({
      color,
      columns,
      compact,
      large,
      unicode,
      statusRows,
      finalInfo: options.finalInfo
    });
  }

  const lines = [""];

  lines.push(...renderHeaderLines({
    color,
    columns,
    compact,
    large
  }));

  lines.push("");

  const frames = unicode ? UNICODE_FRAMES : ASCII_FRAMES;
  lines.push(color.muted(truncate(frames[frameIndex % frames.length], columns)));
  lines.push("");
  lines.push(...renderStatusSection({
    title: "SYSTEM CHECK",
    rows: statusRows,
    color,
    columns,
    unicode
  }));

  return lines.join("\n");
}

export function renderStatusDashboard(options = {}) {
  const env = options.env ?? process.env;
  const columns = normalizeColumns(options.columns ?? process.stdout.columns);
  const colorEnabled = options.color ?? supportsBootColor({ stdout: options.stdout, env });
  const color = createColor(colorEnabled);
  const unicode = options.unicode ?? supportsBootUnicode(env);
  const rows = normalizeRows(options.rows);
  const lines = [""];

  if (options.header !== false) {
    lines.push(...renderHeaderLines({
      color,
      columns,
      compact: !unicode || columns < MEDIUM_HEADER_MIN_COLUMNS,
      large: unicode && columns >= LARGE_HEADER_MIN_COLUMNS
    }));
    lines.push("");
  }

  lines.push(...renderStatusSection({
    title: options.title || "SYSTEM CHECK",
    rows,
    color,
    columns,
    unicode
  }));

  if (options.finalInfo) {
    lines.push("");
    lines.push(color.bold(color.success(`AgentOS ready · ${options.finalInfo}`)));
  } else if (options.footer) {
    lines.push("");
    lines.push(color.muted(options.footer));
  }

  return lines.join("\n");
}

export function renderDoctorReport(options = {}) {
  const env = options.env ?? process.env;
  const columns = normalizeColumns(options.columns ?? process.stdout.columns);
  const colorEnabled = options.color ?? supportsBootColor({ stdout: options.stdout, env });
  const color = createColor(colorEnabled);
  const unicode = options.unicode ?? supportsBootUnicode(env);
  const rows = normalizeRows(options.rows);
  const lines = [""];

  lines.push(color.bold(color.primary(options.title || "AGENTOS DOCTOR")));
  lines.push(color.muted(truncate(options.subtitle || BOOT_TAGLINE, columns)));
  lines.push(color.divider(divider(columns)));
  lines.push(...formatStatusRows(rows, {
    color,
    columns,
    unicode
  }));

  if (options.footer) {
    lines.push(color.divider(divider(columns)));
    lines.push(color.muted(truncate(options.footer, columns)));
  }

  return lines.join("\n");
}

export function formatStatusBadge(state, options = {}) {
  const color = options.color ?? createColor(false);
  const unicode = options.unicode ?? true;
  const meta = getStateMeta(state);
  const symbol = unicode ? meta.symbol : meta.ascii;
  const text = `${symbol} ${meta.label}`;
  const padded = text.padEnd(options.width ?? 15);

  return color[meta.color](padded);
}

class TerminalBoot {
  constructor(options = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.env = options.env ?? process.env;
    this.plain = shouldUsePlainBoot({
      plain: options.plain,
      stdout: this.stdout,
      stderr: this.stderr,
      env: this.env
    });
    this.colorEnabled = supportsBootColor({
      stdout: this.stdout,
      env: this.env
    });
    this.unicode = supportsBootUnicode(this.env);
    this.frameIndex = 0;
    this.lineCount = 0;
    this.timer = null;
    this.started = false;
    this.completed = false;
    this.statusRows = STATUS_ROWS.map(([key, label, state, message]) => ({
      key,
      label,
      state,
      message
    }));
  }

  isPlain() {
    return this.plain;
  }

  start() {
    if (this.plain || this.started) {
      return;
    }

    this.started = true;
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex += 1;
      this.render();
    }, 220);
    this.timer.unref?.();
  }

  updateStatus(key, state, message = "") {
    const row = this.statusRows.find((entry) => entry.key === key);

    if (!row) {
      return;
    }

    row.state = VALID_STATES.has(state) ? state : "warning";
    row.message = message;
    this.render();
  }

  log(message) {
    this.writeLog(message, this.stdout);
  }

  warn(message) {
    this.writeLog(message, this.stderr);
  }

  error(error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    this.writeLog(message, this.stderr);
  }

  complete(finalInfo = "") {
    if (this.plain || this.completed) {
      return;
    }

    this.completed = true;
    this.stopTimer();
    this.clear();
    this.stdout.write(`${this.renderFrame({
      complete: true,
      finalInfo
    })}\n\n`);
    this.lineCount = 0;
  }

  stop(options = {}) {
    if (this.plain) {
      return;
    }

    this.stopTimer();

    if (options.clear) {
      this.clear();
    }
  }

  render() {
    if (this.plain || !this.started || this.completed) {
      return;
    }

    this.clear();
    const output = this.renderFrame();
    this.stdout.write(output);
    this.lineCount = countTerminalLines(output, this.stdout.columns);
  }

  renderFrame(options = {}) {
    return renderBootFrame({
      ...options,
      color: this.colorEnabled,
      unicode: this.unicode,
      columns: this.stdout.columns,
      frameIndex: this.frameIndex,
      statusRows: this.statusRows
    });
  }

  writeLog(message, stream) {
    if (this.plain || !this.started || this.completed) {
      stream.write(ensureNewline(String(message)));
      return;
    }

    this.clear();
    stream.write(ensureNewline(String(message)));
    this.render();
  }

  clear() {
    if (!this.lineCount) {
      return;
    }

    readline.cursorTo(this.stdout, 0);
    readline.moveCursor(this.stdout, 0, -Math.max(0, this.lineCount - 1));
    readline.clearScreenDown(this.stdout);
    this.lineCount = 0;
  }

  stopTimer() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }
}

function normalizeRows(rows = []) {
  if (!rows.length) {
    return STATUS_ROWS.map(([key, label, state, message]) => ({
      key,
      label,
      state,
      message
    }));
  }

  return rows.map((row) => ({
    ...row,
    state: VALID_STATES.has(row.state) ? row.state : "warning"
  }));
}

function renderStatusSection(options) {
  const title = options.title || "SYSTEM CHECK";
  const lines = [
    options.color.bold(options.color.text(title)),
    options.color.divider(divider(options.columns))
  ];

  lines.push(...formatStatusRows(options.rows, options));
  lines.push(options.color.divider(divider(options.columns)));

  return lines;
}

function formatStatusRows(rows, options) {
  const compact = options.columns < 62;
  const labelWidth = compact ? 17 : Math.min(22, Math.max(17, ...rows.map((row) => row.label.length)));
  const badgeWidth = compact ? 14 : 15;

  return rows.map((row) => formatStatusRow(row, {
    ...options,
    compact,
    labelWidth,
    badgeWidth
  }));
}

function formatStatusRow(row, options) {
  const state = row.state || "pending";
  const detail = row.message || row.detail || "";
  const label = truncate(row.label, options.labelWidth).padEnd(options.labelWidth);
  const badge = formatStatusBadge(state, {
    color: options.color,
    unicode: options.unicode,
    width: options.badgeWidth
  });
  const availableDetailWidth = Math.max(0, options.columns - options.labelWidth - options.badgeWidth - 4);
  const detailText = truncate(String(detail), availableDetailWidth);
  const formattedDetail = formatDetail(detailText, options.color);

  return `${options.color.text(label)}  ${badge}  ${formattedDetail}`;
}

function renderMediumHeader(options) {
  const available = Math.max(0, options.columns - 4);

  return [
    ...MEDIUM_WORDMARK.map((line) => `  ${options.color.bold(options.color.primary(line))}`),
    `  ${options.color.muted(truncate(BOOT_TAGLINE, available))}`,
    `  ${options.color.divider(divider(Math.min(available, 72)))}`
  ];
}

function renderCompleteFrame(options) {
  const lines = [""];
  const message = options.finalInfo ? `AgentOS ready · ${options.finalInfo}` : "AgentOS ready";

  lines.push(...renderHeaderLines(options));
  lines.push("");
  lines.push(...renderStatusSection({
    title: "SYSTEM CHECK",
    rows: options.statusRows,
    color: options.color,
    columns: options.columns,
    unicode: options.unicode
  }));
  lines.push("");
  lines.push(options.color.bold(options.color.success(message)));

  return lines.join("\n");
}

function renderHeaderLines(options) {
  if (options.compact) {
    return [
      options.color.bold(options.color.primary(COMPACT_HEADER)),
      options.color.divider(divider(options.columns))
    ];
  }

  if (options.large) {
    return [
      ...AGENTOS_BOOT_HEADER.split("\n").map((line, index) => options.color.gradient(line, index)),
      options.color.muted(BOOT_TAGLINE),
      options.color.divider(divider(options.columns))
    ];
  }

  return renderMediumHeader(options);
}

function createColor(enabled) {
  const wrap = (code, value) => enabled ? `\u001B[${code}m${value}\u001B[0m` : value;
  const hex = (value, text) => {
    if (!enabled) {
      return text;
    }

    const [red, green, blue] = parseHex(value);
    return `\u001B[38;2;${red};${green};${blue}m${text}\u001B[0m`;
  };

  return {
    bold: (value) => wrap("1", value),
    dim: (value) => wrap("2", value),
    primary: (value) => hex(TERMINAL_THEME.primaryCyan, value),
    soft: (value) => hex(TERMINAL_THEME.softCyan, value),
    success: (value) => hex(TERMINAL_THEME.successGreen, value),
    warning: (value) => hex(TERMINAL_THEME.warningAmber, value),
    danger: (value) => hex(TERMINAL_THEME.dangerRed, value),
    muted: (value) => hex(TERMINAL_THEME.mutedGray, value),
    text: (value) => hex(TERMINAL_THEME.textWhite, value),
    divider: (value) => hex(TERMINAL_THEME.dividerGray, value),
    cyan: (value) => hex(TERMINAL_THEME.primaryCyan, value),
    green: (value) => hex(TERMINAL_THEME.successGreen, value),
    yellow: (value) => hex(TERMINAL_THEME.warningAmber, value),
    red: (value) => hex(TERMINAL_THEME.dangerRed, value),
    gradient: (value, index) => {
      const palette = [
        TERMINAL_THEME.softCyan,
        TERMINAL_THEME.primaryCyan,
        TERMINAL_THEME.softCyan,
        TERMINAL_THEME.primaryCyan,
        TERMINAL_THEME.softCyan,
        TERMINAL_THEME.primaryCyan
      ];
      return hex(palette[index % palette.length], value);
    }
  };
}

function getStateMeta(state) {
  return STATE_META[state] || STATE_META.warning;
}

function formatDetail(value, color) {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return color.soft(value);
  }

  return color.text(value);
}

function divider(columns) {
  return "─".repeat(Math.max(24, Math.min(normalizeColumns(columns), 96)));
}

function parseHex(value) {
  const normalized = value.replace(/^#/, "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}

function truncate(value, width) {
  if (width <= 0) {
    return "";
  }

  if (value.length <= width) {
    return value;
  }

  if (width <= 3) {
    return value.slice(0, width);
  }

  return `${value.slice(0, width - 3)}...`;
}

function normalizeColumns(columns) {
  return typeof columns === "number" && Number.isFinite(columns) && columns > 0 ? columns : 80;
}

function countTerminalLines(value, columns) {
  const normalized = value.endsWith("\n") ? value.slice(0, -1) : value;

  if (!normalized) {
    return 0;
  }

  const width = normalizeColumns(columns);

  return normalized.split("\n").reduce((total, line) => {
    const visibleLength = stripAnsi(line).length;
    return total + Math.max(1, Math.floor(Math.max(visibleLength - 1, 0) / width) + 1);
  }, 0);
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function ensureNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}
