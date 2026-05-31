import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { InstalledPackStore } from './installedPackStore'

export async function uninstallPack(packId: string): Promise<void> {
  const pack = await InstalledPackStore.get(packId)
  if (!pack) return
  for (const e of pack.entries) {
    await IdbAssetStore.delete(e.glbKey)
    await IdbAssetStore.delete(e.thumbKey)
  }
  await InstalledPackStore.delete(packId)
  useStore.getState().markPackUninstalled(packId)
  useStore.getState().notify.start({
    title: `Uninstalled ${packId}`,
    kind: 'success',
    message: `${pack.entries.length} items removed`,
  })
}
