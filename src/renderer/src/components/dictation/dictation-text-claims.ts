type DictatedTextClaim = (text: string) => boolean

const claims = new Set<DictatedTextClaim>()

/** Lets a listener take a dictated phrase for itself, such as a spoken command, before it lands.
 *  The claim returns true for a phrase it took. */
export function claimDictatedText(claim: DictatedTextClaim): () => void {
  claims.add(claim)
  return () => {
    claims.delete(claim)
  }
}

/** Whether a listener took `text`; a phrase taken does not land. */
export function dictatedTextClaimed(text: string): boolean {
  for (const claim of claims) {
    if (claim(text)) {
      return true
    }
  }
  return false
}
