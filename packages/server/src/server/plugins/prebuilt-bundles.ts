import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const PREBUILT_BUNDLES_FILENAME = "paseo-prebuilt-bundles.json";

const PrebuiltBundlesSchema = z.object({
  version: z.string(),
  fingerprint: z.string(),
  serverBundle: z.string().min(1).nullable(),
  clientBundle: z.string().min(1).nullable(),
});

export interface PrebuiltBundleContents {
  serverBundle: string | null;
  clientBundle: string | null;
}

export interface PrebuiltBundleExpectation {
  version: string;
  entries: { server: boolean; client: boolean };
}

async function collectSourceFiles(directory: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const info = entry.isSymbolicLink()
      ? await stat(path.join(directory, relativePath)).catch(() => null)
      : entry;
    if (info?.isDirectory()) files.push(...(await collectSourceFiles(directory, relativePath)));
    else if (info?.isFile() && relativePath !== PREBUILT_BUNDLES_FILENAME) {
      files.push(relativePath);
    }
  }
  return files;
}

export async function hashPluginSources(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const files = (await collectSourceFiles(directory, "")).sort();
  for (const file of files) {
    hash.update(file).update("\0");
    hash.update(await readFile(path.join(directory, file))).update("\0");
  }
  return hash.digest("hex");
}

export async function readPrebuiltBundles(
  directory: string,
  expectation: PrebuiltBundleExpectation,
): Promise<PrebuiltBundleContents | null> {
  const filePath = path.join(directory, PREBUILT_BUNDLES_FILENAME);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return null;
  const parsed = PrebuiltBundlesSchema.safeParse(
    await readFile(filePath, "utf8")
      .then((contents) => JSON.parse(contents) as unknown)
      .catch(() => null),
  );
  if (!parsed.success) return null;
  if (parsed.data.version !== expectation.version) return null;
  const fingerprint = await hashPluginSources(directory).catch(() => null);
  if (fingerprint === null || parsed.data.fingerprint !== fingerprint) return null;
  const { serverBundle, clientBundle } = parsed.data;
  if (Boolean(serverBundle) !== expectation.entries.server) return null;
  if (Boolean(clientBundle) !== expectation.entries.client) return null;
  return { serverBundle, clientBundle };
}

export async function writePrebuiltBundles(
  directory: string,
  version: string,
  bundles: PrebuiltBundleContents,
): Promise<void> {
  const payload = {
    version,
    fingerprint: await hashPluginSources(directory),
    serverBundle: bundles.serverBundle,
    clientBundle: bundles.clientBundle,
  };
  await writeFile(path.join(directory, PREBUILT_BUNDLES_FILENAME), `${JSON.stringify(payload)}\n`);
}
