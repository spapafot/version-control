import { Volume, createFsFromVolume } from "memfs";

/**
 * Filesystem behind the git engine. memfs today; the interface is the
 * swap-point for lightning-fs if a compatibility issue ever surfaces.
 */
export interface FsProvider {
  /** node-fs-shaped object accepted by isomorphic-git's `fs` parameter */
  fs: any;
  /** fs.promises for the engine's own reads/writes */
  promises: any;
  /** brand-new empty filesystem (challenge reset) */
  fresh(): FsProvider;
}

export function createMemFs(): FsProvider {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return {
    fs,
    promises: fs.promises,
    fresh: createMemFs,
  };
}
