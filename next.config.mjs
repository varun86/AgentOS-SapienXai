import os from "node:os";

const defaultAllowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  ...readLocalNetworkHosts()
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: defaultAllowedDevOrigins,
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./AGENTS.md",
      "./README.md",
      "./docs/**/*",
      "./eslint.config.mjs",
      "./next-env.d.ts",
      "./next.config.mjs",
      "./package-lock.json",
      "./pnpm-lock.yaml",
      "./pnpm-workspace.yaml",
      "./tailwind.config.ts",
      "./tests/**/*",
      "./tsconfig.json"
    ]
  }
};

export default nextConfig;

function readLocalNetworkHosts() {
  const hosts = [];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4" || !entry.address) {
        continue;
      }

      hosts.push(entry.address);
    }
  }

  return Array.from(new Set(hosts));
}
