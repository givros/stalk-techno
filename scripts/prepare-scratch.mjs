import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(
  root,
  'scratch/node_modules/@scratch/scratch-gui-standalone',
);
const destination = path.join(root, 'public/scratch/vendor');

try {
  const { version } = JSON.parse(
    await readFile(path.join(source, 'package.json'), 'utf8'),
  );
  const marker = path.join(destination, 'version.json');
  const prepared = await readFile(marker, 'utf8').catch(() => 'null');
  if (
    !process.argv.includes('--force') &&
    JSON.parse(prepared)?.version === version &&
    JSON.parse(prepared)?.assetPathsVersion === 1 &&
    (await stat(path.join(destination, 'scratch-gui-standalone.js')).catch(
      () => null,
    ))
  ) {
    console.log(`Scratch ${version} is ready.`);
  } else {
    await mkdir(destination, { recursive: true });
    await cp(path.join(source, 'dist'), destination, {
      recursive: true,
      filter: (entry) =>
        !entry.endsWith('.map') &&
        !['scratch-gui.js', 'scratch-gui.js.LICENSE.txt', 'types'].includes(
          path.basename(entry),
        ),
    });
    // The standalone distribution pins both webpack asset roots to "/".
    // Configure only those URLs so all official chunks and media stay under
    // this editor's vendor directory, including when hosted in a subdirectory.
    const bundlePath = path.join(destination, 'scratch-gui-standalone.js');
    const bundle = await readFile(bundlePath, 'utf8');
    if (bundle.split('.p="/"').length - 1 !== 2) {
      throw new Error(
        'Unexpected Scratch asset-path format; review the pinned runtime version.',
      );
    }
    await writeFile(
      bundlePath,
      bundle.replaceAll('.p="/"', '.p=globalThis.STALK_SCRATCH_ASSET_BASE'),
    );
    await cp(
      path.join(source, 'LICENSE'),
      path.join(destination, 'LICENSE'),
    ).catch(() => {});
    await writeFile(marker, JSON.stringify({ version, assetPathsVersion: 1 }));
    console.log(
      `Scratch ${version}: official GUI, VM and assets prepared locally.`,
    );
  }
} catch (error) {
  console.error('Scratch is not installed. Run npm run scratch:install first.');
  console.error(error.message);
  process.exitCode = 1;
}
