export async function getArchiveMp4(movieTitle: string): Promise<string | null> {
  if (!movieTitle || typeof movieTitle !== 'string') return null;

  try {
    // Sanitize title for Archive.org Lucene query (strip punctuation like : - " ( ) [ ])
    const cleanTitle = movieTitle.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanTitle) return null;

    // Prefer English-language Internet Archive entries first, falling back to any matching title
    const fetchArchiveDocs = async (englishFiltered: boolean) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const langFilter = englishFiltered ? ' AND language:(eng OR English OR en)' : '';
        const searchUrl = `https://archive.org/advancedsearch.php?q=title:("${encodeURIComponent(cleanTitle)}") AND mediatype:(movies)${langFilter}&fl[]=identifier,title,language,downloads&sort[]=downloads+desc&output=json`;
        const searchResponse = await fetch(searchUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!searchResponse.ok) return [];
        const data = await searchResponse.json();
        return Array.isArray(data?.response?.docs) ? data.response.docs : [];
      } catch {
        clearTimeout(timeoutId);
        return [];
      }
    };

    let docs = await fetchArchiveDocs(true);
    if (!docs.length) {
      docs = await fetchArchiveDocs(false);
    }

    if (!docs.length) {
      // Expected for commercial or non-public-domain movies - not an error
      console.info(`[Archive] No public-domain video cataloged on Internet Archive for "${movieTitle}"`);
      return null;
    }

    const nonEnglishPattern = /\b(french|francais|spanish|espanol|hindi|german|deutsch|italian|italiano|russian|arabic|turkish|portuguese|vf|vostfr|latino|castellano)\b/i;

    // Inspect top 4 matching documents to find a valid English MP4
    const candidateDocs = docs.slice(0, 4);
    for (const doc of candidateDocs) {
      const identifier = doc.identifier;
      if (!identifier) continue;

      try {
        const fileController = new AbortController();
        const fileTimeoutId = setTimeout(() => fileController.abort(), 4000);

        const filesUrl = `https://archive.org/metadata/${identifier}/files`;
        const filesResponse = await fetch(filesUrl, { signal: fileController.signal });
        clearTimeout(fileTimeoutId);

        if (!filesResponse.ok) continue;

        const filesData = await filesResponse.json();
        if (!filesData?.result || !Array.isArray(filesData.result)) continue;

        // Find MP4 files that are full-length videos (at least 25 MB to skip tiny trailers/clips)
        const mp4Files = filesData.result.filter((file: any) => {
          const sizeBytes = parseInt(file.size || '0', 10);
          return (
            file.name &&
            typeof file.name === 'string' &&
            file.name.toLowerCase().endsWith('.mp4') &&
            sizeBytes >= 25 * 1024 * 1024
          );
        });

        if (mp4Files.length > 0) {
          // Prefer non-foreign-tagged MP4 files first, then largest size
          mp4Files.sort((a: any, b: any) => {
            const aForeign = nonEnglishPattern.test(a.name) ? 1 : 0;
            const bForeign = nonEnglishPattern.test(b.name) ? 1 : 0;
            if (aForeign !== bForeign) return aForeign - bForeign;
            const sizeA = parseInt(a.size || '0', 10);
            const sizeB = parseInt(b.size || '0', 10);
            return sizeB - sizeA;
          });

          const chosenFile = mp4Files[0];
          const directUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(chosenFile.name)}`;
          console.info(`[Archive] Direct MP4 stream found for "${movieTitle}":`, directUrl);
          return directUrl;
        }
      } catch {
        continue;
      }
    }

    console.info(`[Archive] No matching .mp4 video found in archive items for "${movieTitle}".`);
    return null;
  } catch (error) {
    console.info('[Archive] Archive lookup skipped or timed out:', error);
    return null;
  }
}

