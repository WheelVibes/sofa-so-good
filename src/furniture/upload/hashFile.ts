/** SHA-256 of an ArrayBuffer, lowercase hex. */
export async function hashBuffer(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** SHA-256 of a file's bytes, lowercase hex. Used to detect re-uploads of the
 *  same model regardless of filename (identical bytes → identical hash). */
export async function hashFile(file: File): Promise<string> {
  return hashBuffer(await file.arrayBuffer())
}
