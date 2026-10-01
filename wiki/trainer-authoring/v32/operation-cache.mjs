// One ephemeral operation boundary also covers historical V31/V30 replay.
// The frozen implementation is pinned by V32 sourceDigests; no persistent cache.
export * from '../v31/operation-cache.mjs';
