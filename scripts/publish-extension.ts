/**
 * Scripts to check unpublished version and run publish
 */
import { spawnSync } from 'child_process';
import { IExtensionInfo, getExtensionInfos } from './getExtensionInfos';
import extensionDepsInstall from './fn/extension-deps-install';

function publish(extension: string, directory: string, version: string): void {
  // npm install
  extensionDepsInstall();

  // vsce publish
  console.log('[VSCE] PUBLISH: ', `${extension}@${version}`);
  spawnSync('vsce', [
    'publish',
    '-p',
    process.env.VSCE_TOKEN
  ], {
    stdio: 'inherit',
    cwd: directory,
  });
}

// Entry
console.log('[PUBLISH] Start:');
getExtensionInfos().then((extensionInfos: IExtensionInfo[]) => {
  // Publish
  let publishedCount = 0;
  const publishedExtensions = [];
  for (let i = 0; i < extensionInfos.length; i++) {
    const { name, directory, localVersion, shouldPublish } = extensionInfos[i];
    if (shouldPublish) {
      publishedCount++;
      console.log(`--- ${name}@${localVersion} ---`);
      publish(name, directory, localVersion);
      publishedExtensions.push(`${name}:${localVersion}`);
    }
  }
  console.log(`[PUBLISH EXTENSION PRODUCTION] Complete (count=${publishedCount}):`);
  console.log(`${publishedExtensions.join('\n')}`);
});
