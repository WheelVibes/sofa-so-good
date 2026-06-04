declare module 'draco3dgltf' {
  // The gltf flavour of the Draco encoder/decoder modules. We only need the
  // factory functions; @gltf-transform consumes the returned modules directly.
  const draco3d: {
    createDecoderModule(opts?: unknown): Promise<unknown>
    createEncoderModule(opts?: unknown): Promise<unknown>
  }
  export default draco3d
}
