import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Props = {
  title: string
  hint: string
  label: string
  placeholder: string
  help: ReactNode
  fields?: (text: string) => ReactNode
  actions: ReactNode
  close: () => void
  apply: (text: string) => void
}

export function TableDialog({ title, hint, label, placeholder, help, fields, actions, close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  useEffect(() => { dialog.current?.showModal() }, [])

  async function readFile(file: File) {
    setReading(true)
    setError('')
    try {
      const bytes = await file.arrayBuffer()
      const utf16 = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
      const marker = utf16[0] * 256 + utf16[1]
      let decoded: string
      if (marker === 0xfffe || marker === 0xfeff) {
        decoded = new TextDecoder(marker === 0xfffe ? 'utf-16le' : 'utf-16be').decode(bytes)
      } else {
        try {
          decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          decoded = new TextDecoder('euc-kr').decode(bytes)
        }
      }
      setText(decoded)
      setFileName(file.name)
    } catch {
      setError('파일을 열 수 없습니다. 표를 복사해 붙여넣을 수 있습니다.')
    } finally {
      setReading(false)
    }
  }

  function importTable() {
    try {
      apply(text)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '표를 읽을 수 없습니다.')
    }
  }

  return <dialog className="staffing-dialog schedule-dialog" ref={dialog} aria-labelledby="table-title" onClose={close}>
    <form onSubmit={event => { event.preventDefault(); importTable() }}>
      <header className="staffing-header">
        <div>
          <h2 id="table-title">{title}</h2>
          <p>{hint}</p>
        </div>
        <button className="staffing-close" type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <div className="schedule-file">
        <label className="schedule-file-button">
          <span>{reading ? '파일 읽는 중' : 'CSV 파일 선택'}</span>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={reading}
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              if (file) void readFile(file)
              event.currentTarget.value = ''
            }} />
        </label>
        {fileName && <span className="schedule-filename">{fileName}</span>}
      </div>
      <label className="schedule-label" htmlFor="roster-text">{label}</label>
      <textarea id="roster-text" rows={6} value={text} aria-describedby="schedule-help" readOnly={reading}
        aria-invalid={error ? true : undefined} placeholder={placeholder}
        onChange={event => { setText(event.target.value); setFileName(''); setError('') }} />
      <p id="schedule-help" className="schedule-help">{help}</p>
      {fields?.(text)}
      {error && <p className="schedule-error" role="alert">{error}</p>}
      <footer className="staffing-footer">
        <div className="staffing-secondary">{actions}</div>
        <button className="staffing-apply" type="submit" disabled={!text.trim() || reading}>가져오기</button>
      </footer>
    </form>
  </dialog>
}
