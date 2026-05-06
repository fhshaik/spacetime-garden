import { useMemo } from 'react'
import katex from 'katex'

interface Props {
  latex: string
  displayMode?: boolean
  className?: string
}

export function MetricLatex({ latex, displayMode = false, className }: Props) {
  const html = useMemo(
    () => katex.renderToString(latex, { displayMode, throwOnError: false }),
    [latex, displayMode],
  )
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
