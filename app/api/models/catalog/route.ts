import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { listOpenClawModels } from "@/lib/openclaw/application/catalog-service";
import { getMissionControlSnapshot } from "@/lib/agentos/control-plane";
import { getOpenClawAdapter } from "@/lib/openclaw/adapter/openclaw-adapter";
import { resolveModelRecordProvider } from "@/lib/openclaw/domains/model-provider-connection";
import type { AddModelsCatalogModel, MissionControlSnapshot } from "@/lib/agentos/contracts";
import type { ModelsPayload, ModelsStatusPayload } from "@/lib/openclaw/client/gateway-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GlobalCatalogModel = Omit<AddModelsCatalogModel, "alreadyAdded">;
const openClawConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
const catalogAddSchema = z.object({
  provider: z.string().trim().min(1),
  modelIds: z.array(z.string().trim().min(1)).min(1)
});

type OpenClawConfigPayload = {
  meta?: {
    lastTouchedAt?: string;
  };
  plugins?: {
    entries?: Record<string, Record<string, unknown>>;
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
      agentRuntime?: {
        id?: string;
      };
      models?: Record<string, Record<string, never>>;
    };
  };
};

export async function GET() {
  try {
    const models = await readGlobalCatalog();
    return NextResponse.json({ models }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "OpenClaw catalog could not be loaded."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let input: z.infer<typeof catalogAddSchema>;

  try {
    input = catalogAddSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Catalog model selection is required."
      },
      { status: 400 }
    );
  }

  try {
    const provider = normalizeCatalogProvider(input.provider);
    const modelIds = input.modelIds.map((modelId) => normalizeCatalogModelId(provider, modelId));

    await addCatalogModelsToConfig(provider, modelIds);

    const snapshot = await getMissionControlSnapshot({ force: true });

    return NextResponse.json(
      {
        ok: true,
        provider,
        message: `Added ${modelIds.length} model${modelIds.length === 1 ? "" : "s"} to AgentOS.`,
        snapshot
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Catalog models could not be added."
      },
      { status: 500 }
    );
  }
}

async function readGlobalCatalog(): Promise<GlobalCatalogModel[]> {
  try {
    const [payload, modelStatus] = await Promise.all([
      listOpenClawModels({ all: true }),
      readModelStatus()
    ]);
    return normalizeCatalogModels(payload.models, modelStatus);
  } catch {
    const snapshot = await getMissionControlSnapshot();
    return normalizeSnapshotModels(snapshot);
  }
}

async function readModelStatus(): Promise<ModelsStatusPayload | null> {
  try {
    return await getOpenClawAdapter().getModelStatus({ timeoutMs: 8_000 });
  } catch {
    return null;
  }
}

function normalizeCatalogModels(
  models: ModelsPayload["models"],
  modelStatus: ModelsStatusPayload | null
): GlobalCatalogModel[] {
  const uniqueModels = new Map<string, ModelsPayload["models"][number]>();

  for (const model of models || []) {
    if (!uniqueModels.has(model.key)) {
      uniqueModels.set(model.key, model);
    }
  }

  return Array.from(uniqueModels.values()).map((model) => ({
    id: model.key,
    name: model.name,
    provider: resolveModelRecordProvider(model.key, modelStatus ?? undefined),
    input: model.input,
    contextWindow: model.contextWindow ?? null,
    local: Boolean(model.local),
    available: model.available !== false,
    missing: Boolean(model.missing),
    recommended: isRecommendedModel(resolveModelRecordProvider(model.key, modelStatus ?? undefined), model.key),
    supportsTools: model.input.includes("text"),
    isFree: /:free$/i.test(model.key) || /\(free\)/i.test(model.name),
    tags: Array.isArray(model.tags) ? model.tags : []
  }));
}

function normalizeSnapshotModels(
  snapshot: MissionControlSnapshot
): GlobalCatalogModel[] {
  return snapshot.models
    .map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      input: model.input,
      contextWindow: model.contextWindow,
      local: Boolean(model.local),
      available: model.available !== false,
      missing: Boolean(model.missing),
      recommended: isRecommendedModel(model.provider, model.id),
      supportsTools: model.input.includes("text"),
      isFree: /:free$/i.test(model.id) || /\(free\)/i.test(model.name),
      tags: Array.isArray(model.tags) ? model.tags : []
    }));
}

async function addCatalogModelsToConfig(provider: string, normalizedModelIds: string[]) {
  if (await addCatalogModelsToConfigViaGateway(provider, normalizedModelIds)) {
    return;
  }

  const config = await readJsonFile<OpenClawConfigPayload>(openClawConfigPath, {});

  config.meta = {
    ...config.meta,
    lastTouchedAt: new Date().toISOString()
  };
  config.agents = config.agents || {};
  config.agents.defaults = config.agents.defaults || {};
  config.agents.defaults.models = config.agents.defaults.models || {};

  if (provider === "openai-codex") {
    config.plugins = config.plugins || {};
    config.plugins.entries = config.plugins.entries || {};
    config.plugins.entries.codex = {
      ...config.plugins.entries.codex,
      enabled: true
    };
  }

  for (const modelId of normalizedModelIds) {
    config.agents.defaults.models[modelId] = config.agents.defaults.models[modelId] || {};
  }

  if (!config.agents.defaults.model?.primary && normalizedModelIds[0]) {
    config.agents.defaults.model = {
      ...(config.agents.defaults.model || {}),
      primary: normalizedModelIds[0]
    };
    applyRuntimeHint(config.agents.defaults, provider);
  }

  await writeJsonFile(openClawConfigPath, config);
}

async function addCatalogModelsToConfigViaGateway(provider: string, normalizedModelIds: string[]) {
  try {
    const snapshot = await getOpenClawAdapter().call<Record<string, unknown>>("config.get", {}, { timeoutMs: 5_000 });
    const config = isRecord(snapshot.config) ? snapshot.config : {};
    const patch: Record<string, unknown> = {
      agents: {
        defaults: {
          models: Object.fromEntries(normalizedModelIds.map((modelId) => [modelId, {}]))
        }
      }
    };
    const defaultsPatch = (patch.agents as { defaults: Record<string, unknown> }).defaults;

    if (!readConfigPath(config, "agents.defaults.model.primary") && normalizedModelIds[0]) {
      defaultsPatch.model = {
        primary: normalizedModelIds[0]
      };
      applyRuntimeHint(defaultsPatch, provider);
    }

    if (provider === "openai-codex") {
      patch.plugins = {
        entries: {
          codex: {
            enabled: true
          }
        }
      };
    }

    const params: Record<string, unknown> = {
      raw: JSON.stringify(patch)
    };
    const baseHash = typeof snapshot.hash === "string" && snapshot.hash.trim() ? snapshot.hash : null;

    if (baseHash) {
      params.baseHash = baseHash;
    }

    await getOpenClawAdapter().call("config.patch", params, { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function applyRuntimeHint(target: Record<string, unknown>, provider: string) {
  if (provider === "openai-codex") {
    target.agentRuntime = {
      ...(isRecord(target.agentRuntime) ? target.agentRuntime : {}),
      id: "codex"
    };
  } else if (provider === "openai") {
    target.agentRuntime = {
      ...(isRecord(target.agentRuntime) ? target.agentRuntime : {}),
      id: "pi"
    };
  }
}

function normalizeCatalogProvider(provider: string) {
  const normalized = provider.trim().toLowerCase();

  if (normalized === "gemini") {
    return "google";
  }

  return normalized;
}

function normalizeCatalogModelId(provider: string, modelId: string) {
  if (provider === "openai-codex" && modelId.startsWith("openai-codex/")) {
    return `openai/${modelId.slice("openai-codex/".length)}`;
  }

  if (modelId.startsWith("gemini/")) {
    return `google/${modelId.slice("gemini/".length)}`;
  }

  return modelId;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readConfigPath(source: unknown, configPath: string) {
  let current = source;

  for (const segment of configPath.split(".")) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRecommendedModel(provider: string, modelId: string) {
  const normalized = modelId.toLowerCase();

  if (provider === "openrouter") {
    return /gpt-5|claude-sonnet|gemini-2\.5|gemini-3|qwen3-coder|codestral|openrouter\/auto/.test(normalized);
  }

  if (provider === "openai-codex") {
    return /gpt-5\.4|gpt-5\.3-codex|codex/.test(normalized);
  }

  if (provider === "ollama") {
    return /qwen|llama3/.test(normalized);
  }

  if (provider === "anthropic") {
    return /claude-sonnet|claude-opus/.test(normalized);
  }

  if (provider === "openai") {
    return /gpt-5|o3|o4/.test(normalized);
  }

  if (provider === "xai") {
    return /grok-4|grok-code/.test(normalized);
  }

  if (provider === "google") {
    return /gemini-2\.|gemini-3/.test(normalized);
  }

  if (provider === "deepseek") {
    return /deepseek-(chat|reasoner|coder|r1|v3)/.test(normalized);
  }

  if (provider === "mistral") {
    return /mistral-(large|small|medium|tiny)|codestral|pixtral|ministral/.test(normalized);
  }

  return false;
}
