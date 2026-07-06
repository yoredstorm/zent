/** Extracts uploads folder + filename from relative or absolute Zent upload URLs. */
export function parseUploadLocation(
  url: string,
): { folder: 'pdf' | 'images'; filename: string } | null {
  const match = url.trim().match(/\/uploads\/(pdf|images)\/([^/?#]+)$/i);
  if (!match) return null;
  return {
    folder: match[1].toLowerCase() as 'pdf' | 'images',
    filename: match[2],
  };
}
