import { useState } from 'react'

export function ItemIcon({ src }: { src?: string }) {
  const [failed, setFailed] = useState<string>()
  if (!src) return null
  if (failed === src) {
    return <span className="icon-unavailable" role="img" aria-label="Icon unavailable" title="Icon could not be decoded; using text instead">?</span>
  }
  return <img className="item-icon" src={src} alt="" width="32" height="32" onError={() => setFailed(src)} />
}
