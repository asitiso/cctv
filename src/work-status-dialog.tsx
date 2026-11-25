import { TableDialog } from './table-dialog.tsx'
import { koreaClock } from './schedule.ts'
import { parseWork } from './work-status.ts'
import type { WorkPeriod } from './work-status.ts'

type Props = {
  names: readonly string[]
  hasFile: boolean
  close: () => void
  back: () => void
  apply: (work: WorkPeriod[]) => void
}

export function WorkStatusDialog({ names, hasFile, close, back, apply }: Props) {
  return <TableDialog
    title="업무 상태 가져오기"
    hint="확인된 업무가 담긴 CSV를 열거나 엑셀 표를 붙여넣으세요."
    label="업무 상태 내용"
    placeholder={'이름,업무,시작,종료\n김한나,조제 중,10:00,10:20'}
    help={<>첫 줄에 <strong>이름 · 업무 · 시작 · 종료</strong> 열을 넣어 주세요. 이름은 근무표와 같아야 합니다.
      날짜를 생략하면 오늘 업무로 읽고, 종료 시각부터 미확인으로 표시합니다.</>}
    actions={<>
      <button className="staffing-reset" type="button" onClick={back}>근무표 관리</button>
      {hasFile && <button className="staffing-reset" type="button" onClick={() => apply([])}>업무 파일 지우기</button>}
    </>}
    close={close} apply={text => apply(parseWork(text, koreaClock().date, names))}
  />
}
