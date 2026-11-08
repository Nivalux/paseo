import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  builtinPlugins,
  resolveBuiltinPluginsRoot,
} from "../dist/server/server/plugins/builtin/index.js";
import { compileDirectoryPlugin } from "../dist/server/server/plugins/compiler-build.js";
import { writePrebuiltBundles } from "../dist/server/server/plugins/prebuilt-bundles.js";

const { version } = JSON.parse(
  await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

const root = resolveBuiltinPluginsRoot();
const startedAll = Date.now();
let totalBytes = 0;

for (const id of builtinPlugins) {
  const directory = path.join(root, id);
  const started = Date.now();
  const { clientBundle, serverBundle } = await compileDirectoryPlugin(directory, version, id);
  await writePrebuiltBundles(directory, version, { clientBundle, serverBundle });
  totalBytes += (clientBundle?.length ?? 0) + (serverBundle?.length ?? 0);
  process.stdout.write(
    `precompiled built-in plugin ${id}: server ${serverBundle?.length ?? 0}B, client ${
      clientBundle?.length ?? 0
    }B in ${Date.now() - started}ms\n`,
  );
}

process.stdout.write(
  `precompiled ${builtinPlugins.length} built-in plugins, ${totalBytes}B in ${
    Date.now() - startedAll
  }ms\n`,
);
