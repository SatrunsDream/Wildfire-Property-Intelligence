/** Modal that displays a PDF with its own URL hash. Supports download, scroll, and close. */

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui/button'

export type PdfModalTarget = 'poster' | 'paper' | null

const PDF_SOURCES: Record<Exclude<PdfModalTarget, null>, { path: string; title: string }> = {
  poster: {
    path: '/images/capstone_poster.pdf',
    title: 'Capstone Poster',
  },
  paper: {
    path: '/images/capstone_paper.pdf',
    title: 'Capstone Report',
  },
}

export function getPdfTargetFromHash(): PdfModalTarget {
  const hash = window.location.hash?.replace('#', '')
  if (hash === 'poster' || hash === 'paper') return hash
  return null
}

interface PdfViewerModalProps {
  target: PdfModalTarget
  onClose: () => void
}

export function PdfViewerModal({ target, onClose }: PdfViewerModalProps) {
  const source = target ? PDF_SOURCES[target] : null

  useEffect(() => {
    const handleHashChange = () => {
      if (!getPdfTargetFromHash()) onClose()
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [onClose])

  if (!source) return null

  const handleClose = () => {
    const url = new URL(window.location.href)
    url.hash = ''
    window.history.replaceState(null, '', url.toString())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={`View ${source.title}`}
      onClick={handleClose}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <h2 className="text-lg font-semibold">{source.title}</h2>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <iframe
            src={`${source.path}#view=FitH`}
            title={source.title}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  )
}
