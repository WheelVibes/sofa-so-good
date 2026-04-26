import { indexAssets } from './asset-pipeline/index-assets';

const projectRoot = process.cwd();
indexAssets({ projectRoot }).catch((err) => {
  console.error(err);
  process.exit(1);
});
