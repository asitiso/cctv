import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { applyBoardChange, currentSharedBoard, newSharedBoard, parseBoardChange } from '../src/shared-board.ts'

const app = process.env.BOARD_URL ?? pathToFileURL(fileURLToPath(new URL('../약국 CCTV.html', import.meta.url))).href
const output = resolve(process.env.BOARD_SCREENSHOT_DIR ?? fileURLToPath(new URL('./', import.meta.url))) + sep
const allStaff = JSON.parse(await readFile(new URL('../src/demo.json', import.meta.url), 'utf8')).people.map(person => person.id)
const duration = Number(process.env.BOARD_ENDURANCE_MS ?? 0)
const browser = await chromium.launch({ channel: process.env.BOARD_BROWSER ?? 'chrome' })
const errors = []
const status = page => page.evaluate(() => JSON.parse(window.render_game_to_text()))
const milliseconds = page => page.evaluate(() => JSON.parse(window.render_game_to_text()).elapsed)
const tick = (page, amount) => page.evaluate(ms => window.advanceTime(ms), amount)

await mkdir(output, { recursive: true })

async function open(viewport, extras = {}, clockTime, fullRoster = true, background = 'pharmacy') {
  const page = await browser.newPage({ viewport, offline: app.startsWith('file:'), ...extras })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  if (app.startsWith('file:')) {
    page.on('request', request => {
      if (/^https?:/.test(request.url())) errors.push('Offline bundle made a network request: ' + request.url())
    })
  }
  if (clockTime) await page.clock.install({ time: clockTime })
  if (fullRoster) await page.addInitScript(ids => {
    const key = 'pharmacy-cctv:active-roster:v1'
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(ids))
  }, allStaff)
  if (background) await page.addInitScript(value => {
    const key = 'pharmacy-cctv:background:v1'
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
  }, background)
  await page.goto(app)
  await page.waitForFunction(() => document.querySelector('.scene[data-ready=true]') && window.render_game_to_text)
  await page.evaluate(() => document.fonts.ready)
  return page
}

async function checkActiveRoster() {
  const page = await open({ width: 1440, height: 900 }, {}, undefined, false)
  const rows = page.locator('.roster li')
  const switchFor = name => page.getByRole('switch', { name: name + ' 현황 표시', exact: true })
  try {
    await tick(page, 0)
    assert.deepEqual((await status(page)).activeRoster, allStaff.slice(0, 10))
    assert.equal(await page.locator('.working-count strong').textContent(), '9명')
    await page.locator('.roster summary').click()
    assert.equal(await rows.count(), 10)
    await switchFor('서연').click()
    assert.equal(await rows.count(), 9)
    assert.equal((await status(page)).actors.find(actor => actor.name === '서연').present, false)
    await page.getByRole('button', { name: /예비 직원 7명/ }).click()
    assert.equal(await switchFor('서연').getAttribute('aria-checked'), 'false')
    await switchFor('소라').click()
    assert.equal(await rows.count(), 10)
    assert.equal((await status(page)).actors.find(actor => actor.name === '소라').present, true)
    await checkLayout(page)
    await page.screenshot({ path: output + 'active-staff-and-reserves.png' })

    const count = page.getByLabel('현황 인원', { exact: true })
    await count.selectOption('4')
    assert.equal(await rows.count(), 4)
    await count.selectOption('0')
    assert.equal(await rows.count(), 0)
    assert.equal(await page.locator('.working-count strong').textContent(), '0명')
    assert.equal(await page.getByRole('switch').count(), 16)
    await count.selectOption('12')
    assert.equal(await rows.count(), 12)
    await page.reload()
    await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).activeRoster.length === 12)
  } finally {
    await page.close()
  }
}

async function checkStaffPlacement() {
  const board = await open({ width: 1440, height: 900 })
  const employee = page => status(page).then(board => board.actors.find(actor => actor.id === 'seoyeon'))
  const center = ({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 })
  const move = (page, point) => page.mouse.move(point.x, point.y, { steps: 8 })
  try {
    await tick(board, 0)
    const piece = board.getByRole('button', { name: '서연 상태 옮기기', exact: true })
    assert.equal(await board.getByRole('button', { name: '유나 상태 옮기기' }).count(), 0)
    await move(board, center(await piece.boundingBox()))
    await board.mouse.down()
    const scene = await board.locator('.scene').boundingBox()
    await move(board, { x: scene.x + scene.width / 2, y: scene.y + scene.height - 13 })
    await board.mouse.up()
    assert.equal((await employee(board)).target, 'dispense')
    assert.equal(await board.locator('.placement-zone').count(), 0)
    await move(board, center(await piece.boundingBox()))
    await board.mouse.down()
    const checkout = board.locator('.placement-zone[data-activity=checkout]')
    await checkout.waitFor()
    await move(board, center(await checkout.boundingBox()))
    await board.locator('.placement-zone[data-activity=checkout][data-target=true]').waitFor()
    await board.screenshot({ path: output + 'staff-dragging.png' })
    await board.mouse.up()
    assert.deepEqual(await employee(board).then(({ target, moving }) => [target, moving]), ['checkout', true])
    await tick(board, 10_000)
    assert.deepEqual(await employee(board).then(({ activity, zone }) => [activity, zone]), ['checkout', '계산'])
    await board.screenshot({ path: output + 'staff-placed.png' })
    await piece.focus()
    await piece.press('Enter')
    await board.locator('.placement-zone[data-activity=dispense]:focus').waitFor()
    await board.getByRole('button', { name: '서연 · 잠시 휴식 중' }).press('Enter')
    await tick(board, 18_000)
    assert.equal((await employee(board)).duty, 'break')
    await tick(board, 41_975)
    assert.match(await board.locator('.mode-chip').textContent(), /직접 배치/)
    await move(board, center(await piece.boundingBox()))
    await board.mouse.down()
    await tick(board, 5000)
    assert.equal((await employee(board)).activity, 'coffee')
    await move(board, { x: scene.x + scene.width / 2, y: scene.y + scene.height - 13 })
    await board.mouse.up()
    await tick(board, 59_975)
    assert.equal((await employee(board)).target, 'coffee')
    await tick(board, 25)
    await board.getByText('시뮬레이션 · 자율 이동', { exact: true }).waitFor()
    const resumed = await employee(board)
    assert.equal(resumed.target, 'wander')
    assert.ok(resumed.moving)
    assert.equal(resumed.label, '둘러보는 중')
    await board.locator('.placement-notice.visible').waitFor({ state: 'hidden' })
    await board.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await tick(board, 1500)
    await board.screenshot({ path: output + 'staff-free-walking.png' })
  } finally {
    await board.close()
  }

  const mobile = await open({ width: 430, height: 932 }, { isMobile: true, hasTouch: true })
  try {
    await tick(mobile, 0)
    const touch = await mobile.context().newCDPSession(mobile)
    const start = center(await mobile.getByRole('button', { name: '서연 상태 옮기기', exact: true }).boundingBox())
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    const checkout = mobile.locator('.placement-zone[data-activity=checkout]')
    await checkout.waitFor()
    const destination = center(await checkout.boundingBox())
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [destination] })
    await mobile.locator('.placement-zone[data-target=true]').waitFor()
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await tick(mobile, 10_000)
    assert.equal((await employee(mobile)).activity, 'checkout')
  } finally {
    await mobile.close()
  }
}

function sampleCharacter(page, point) {
  return page.locator('canvas').evaluate((node, screen) => {
    const x = Math.round(screen.x * node.width / 1586) - 10
    const y = Math.round((screen.y - 75) * node.height / 992)
    const pixels = node.getContext('2d').getImageData(x, y, 20, 45).data
    return pixels.reduce((hash, value) => (Math.imul(hash, 33) + value) | 0, 0)
  }, point)
}

async function checkCottagePlacementAndKoreanClock() {
  const page = await open({ width: 1440, height: 900 }, { timezoneId: 'America/Los_Angeles' }, new Date('2026-11-25T14:51:00Z'))
  const team = async () => Object.fromEntries((await status(page)).actors.map(actor => [actor.name, actor]))
  const center = async locator => {
    const { x, y, width, height } = await locator.boundingBox()
    return { x: x + width / 2, y: y + height / 2 }
  }
  const move = point => page.mouse.move(point.x, point.y, { steps: 8 })
  try {
    await tick(page, 0)
    assert.equal(await page.locator('.clock-time').getAttribute('datetime'), '23:51')
    assert.match(await page.locator('.clock-date').textContent(), /11월 25일/)
    const seoyeon = page.getByRole('button', { name: '서연 상태 옮기기', exact: true })
    await move(await center(seoyeon))
    await page.mouse.down()
    const target = page.getByRole('button', { name: '서연 · 오늘은 휴무!', exact: true })
    await target.waitFor()
    await move(await center(target))
    await page.locator('.placement-zone[data-activity=dayoff][data-target=true]').waitFor()
    await page.mouse.up()
    let employee = (await team())['서연']
    assert.deepEqual([employee.duty, employee.zone, employee.label, employee.present], ['off', '휴무 별장', '오늘은 휴무!', true])
    assert.equal(await page.locator('.working-count strong').textContent(), '13명')
    await tick(page, 65_000)
    assert.equal((await team())['서연'].duty, 'off')
    assert.equal(await page.locator('.clock-time').getAttribute('datetime'), '23:51')

    await page.getByRole('button', { name: '휴무 별장, 쉬는 직원 3명' }).click()
    const list = page.getByRole('region', { name: '휴무 별장 직원' })
    assert.deepEqual((await list.locator('.cottage-people button').allTextContents()).sort(), ['서연', '유나', '태호'])
    await page.screenshot({ path: output + 'cottage-dayoff-picker.png' })
    await move(await center(list.getByRole('button', { name: '유나 약국으로 옮기기' })))
    await page.mouse.down()
    const scene = await page.locator('.scene').boundingBox()
    await move({ x: scene.x + scene.width * .47, y: scene.y + scene.height * .89 })
    await page.mouse.up()
    employee = (await team())['유나']
    assert.ok(employee.duty === 'working' && employee.zone !== '휴무 별장')
    assert.equal(await page.locator('.working-count strong').textContent(), '14명')
    await checkLayout(page)
    await page.screenshot({ path: output + 'cottage-back-to-work.png' })

    await page.reload()
    await page.waitForFunction(() => document.querySelector('.scene[data-ready=true]') && window.render_game_to_text)
    assert.equal((await team())['서연'].duty, 'off')
    assert.ok(['working', 'break'].includes((await team())['유나'].duty))
    await page.clock.setSystemTime(new Date('2026-11-25T15:00:00Z'))
    await page.clock.runFor(600)
    assert.equal(await page.locator('.clock-time').getAttribute('datetime'), '00:00')
    assert.match(await page.locator('.clock-date').textContent(), /11월 26일/)
    assert.equal((await team())['서연'].duty, 'working')
    assert.equal((await team())['유나'].duty, 'off')
  } finally {
    await page.close()
  }
}

async function checkLayout(page) {
  // ResizeObserver updates canvas and overlay geometry during the render cycle.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const horizontalOverflow = document.documentElement.scrollWidth > width
    const bubbles = Array.from(document.querySelectorAll('.bubble:not([hidden]), .pet-bubble:not([hidden])'),
      node => node.getBoundingClientRect())
    const collisions = bubbles.flatMap((a, i) => bubbles.slice(i + 1).filter(b =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)).length
    const outOfBounds = bubbles.some(box => box.left < 0 || box.right > width || box.top < 0)
    return { horizontalOverflow, collisions, outOfBounds }
  })
  assert.deepEqual(problems, { horizontalOverflow: false, collisions: 0, outOfBounds: false })
}

async function checkMascots() {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await open(viewport)
    try {
      await tick(page, 0)
      const initial = await status(page)
      assert.deepEqual(initial.pets.map(pet => [pet.id, pet.name]), [['dog', '모카'], ['cat', '코코']])
      await tick(page, 2950)
      const dogBubble = page.locator('.pet-bubble[data-pet=dog]:visible')
      assert.equal(await dogBubble.locator('.pet-name').textContent(), '모카')
      assert.equal(await dogBubble.locator('.pet-message').textContent(), '오늘도 힘내요!')
      assert.equal(await page.locator('.pet-bubble:visible').count(), 1)
      assert.notDeepEqual((await status(page)).pets[0].screen, initial.pets[0].screen)
      await checkLayout(page)
      if (viewport.width === 1440) await page.screenshot({ path: output + 'pet-dog-encouragement.png' })

      await tick(page, 9300)
      const catBubble = page.locator('.pet-bubble[data-pet=cat]:visible')
      assert.equal(await catBubble.locator('.pet-name').textContent(), '코코')
      assert.equal(await catBubble.locator('.pet-message').textContent(), '오늘도 고생 많아요!')
      assert.equal(await page.locator('.pet-bubble:visible').count(), 1)
      assert.notDeepEqual((await status(page)).pets[1].screen, initial.pets[1].screen)
      assert.ok(await catBubble.locator('.pet-message').evaluate(label =>
        Number.parseFloat(getComputedStyle(label).fontSize) * label.getBoundingClientRect().height / label.offsetHeight >= 11))
      await checkLayout(page)
      if (viewport.width === 1440) await page.screenshot({ path: output + 'pet-cat-encouragement.png' })

      await tick(page, 5000)
      assert.equal(await page.locator('.pet-bubble:visible').count(), 0)
      assert.equal(await page.locator('.working-count strong').textContent(), '14명')
    } finally {
      await page.close()
    }
  }
}

async function checkSnackBreaks() {
  const page = await open({ width: 1440, height: 900 })
  const staff = async () => {
    const { actors } = await status(page)
    return [actors.find(actor => actor.name === '정민'), actors.find(actor => actor.name === '현우')]
  }
  try {
    await tick(page, 0)
    await page.locator('.roster summary').click()
    await page.getByRole('button', { name: '보라 이름·캐릭터 설정', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
    await settings.getByLabel('표시 이름', { exact: true }).fill('정민')
    await settings.getByRole('button', { name: '적용', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors.some(actor => actor.name === '정민'))
    await page.locator('.roster summary').click()
    const [before] = await staff()
    await tick(page, 3650)
    const bubble = page.locator('.bubble:visible').filter({ hasText: '정민' })
    assert.equal(await bubble.locator('.bubble-task').textContent(), '다과 먹는 중')
    await checkLayout(page)
    await page.screenshot({ path: output + 'jeongmin-snack.png' })
    await tick(page, 575)
    const [after] = await staff()
    assert.equal(after.zone, '휴게')
    assert.equal(after.snacksEaten, before.snacksEaten + 1)
    assert.equal(after.stamina, before.stamina + 8)
    assert.equal(await bubble.locator('.bubble-task').textContent(), '체력 회복')
    await page.screenshot({ path: output + 'jeongmin-stamina.png' })
    await tick(page, 24_000 - await milliseconds(page))
    assert.deepEqual((await staff()).map(actor => actor.snacksEaten), [3, 2])
  } finally {
    await page.close()
  }
}

async function checkCocoFollowing() {
  const page = await open({ width: 1440, height: 900 })
  const pair = async () => {
    const state = await status(page)
    const yunhui = state.actors.find(actor => actor.name === '윤희')
    const coco = state.pets.find(pet => pet.id === 'cat')
    return { yunhui, coco, distance: Math.hypot(coco.screen.x - yunhui.screen.x, coco.screen.y - yunhui.screen.y) }
  }
  try {
    await tick(page, 0)
    await page.evaluate(() => { Math.random = () => .2 })
    await page.locator('.roster summary').click()
    await page.getByRole('button', { name: '서연 이름·캐릭터 설정', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
    await settings.getByLabel('표시 이름', { exact: true }).fill('윤희')
    await settings.getByRole('button', { name: '적용', exact: true }).click()
    await page.getByRole('button', { name: '윤희 상태 옮기기', exact: true }).waitFor()
    await page.locator('.roster summary').click()
    await tick(page, 14_800)
    const byCounter = await pair()
    assert.equal(byCounter.coco.following, byCounter.yunhui.id)
    assert.ok(byCounter.distance < 155)
    await checkLayout(page)
    await page.screenshot({ path: output + 'coco-following.png' })

    await page.getByRole('button', { name: '윤희 상태 옮기기', exact: true }).press('Enter')
    await page.getByRole('button', { name: '윤희 · 잠시 휴식 중', exact: true }).press('Enter')
    await tick(page, 19_000)
    const lounge = await pair()
    assert.equal(lounge.yunhui.activity, 'coffee')
    assert.equal(lounge.coco.following, lounge.yunhui.id)
    assert.ok(lounge.distance < 155)
    assert.ok(lounge.coco.screen.x - byCounter.coco.screen.x > 350)

    await page.evaluate(() => { Math.random = () => .9 })
    await tick(page, 9500)
    assert.equal((await pair()).coco.following, null)
  } finally {
    await page.close()
  }
}

async function checkPersonalitiesAndPastry() {
  const page = await open({ width: 1440, height: 900 })
  const seek = async time => tick(page, time - await milliseconds(page))
  const employees = async () => Object.fromEntries((await status(page)).actors.map(actor => [actor.name, actor]))
  try {
    await tick(page, 0)
    await page.evaluate(() => { Math.random = () => .2 })
    await page.locator('.roster summary').click()
    for (const [original, name, appearance] of [
      ['서연', '실장님'], ['준호', '혜미', '여성 약사 · 금테 안경'],
      ['수빈', '혜빈', '여성 약사 · 살구색 블라우스'], ['소라', '윤희'],
      ['다희', '정민'], ['도윤', '국장님'],
    ]) {
      await page.getByRole('button', { name: original + ' 이름·캐릭터 설정', exact: true }).click()
      const settings = page.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
      await settings.getByLabel('표시 이름', { exact: true }).fill(name)
      if (appearance) await settings.getByRole('radio', { name: appearance, exact: true }).check()
      await settings.getByRole('button', { name: '적용', exact: true }).click()
      await page.getByRole('button', { name: name + ' 상태 옮기기', exact: true }).waitFor()
    }
    await page.locator('.roster summary').click()

    await seek(1_400)
    let team = await employees()
    assert.equal(team['실장님'].label, '업무 살피는 중')
    assert.equal(team['혜빈'].workRate, 1.2)
    assert.equal(team['윤희'].checkoutBag, true)

    await seek(6_000)
    team = await employees()
    for (const name of ['혜미', '혜빈']) {
      assert.equal(team[name].zone, '조제')
      assert.equal(team[name].label, '협업 조제 중')
      assert.equal(team[name].workRate, 1.5)
      assert.equal(team[name].workAccuracy, .9)
    }
    await checkLayout(page)
    await page.screenshot({ path: output + 'staff-personalities.png' })

    for (let time = 29_500; time <= 35_000; time += 250) {
      await seek(time)
      team = await employees()
      if (team['국장님'].label === '재고 공간, 일을 좀 나눠요!') break
    }
    assert.equal(team['국장님'].zone, '사무')
    assert.equal(team['국장님'].label, '재고 공간, 일을 좀 나눠요!')
    assert.ok(['혜미', '혜빈'].every(name => team[name].zone === '조제' && team[name].workAccuracy === .9))
    await tick(page, 250)
    team = await employees()
    const helper = team['현우']
    assert.deepEqual([helper.zone, helper.target, helper.moving, helper.label],
      ['재고', 'office', true, '사무 공간 지원하러 가는 중'])
    await checkLayout(page)
    await page.screenshot({ path: output + 'director-crowd-reminder.png' })

    for (let time = 33_000; time <= 41_000; time += 250) {
      await seek(time)
      team = await employees()
      if (team['현우'].zone === '사무') break
    }
    assert.deepEqual([team['현우'].zone, team['현우'].activity, team['현우'].label],
      ['사무', 'office', '발주 확인 중'])
    assert.equal(Object.values(team).filter(actor => actor.zone === '재고' && !actor.moving).length, 2)
    await checkLayout(page)
    await page.screenshot({ path: output + 'director-work-sharing.png' })

    await seek(69_500)
    assert.notEqual((await employees())['실장님'].target, 'refill')
    let reminded = false
    let headedForSnack = false
    let restocked = false
    let recovered = false
    for (let time = 70_000; time <= 105_000; time += 250) {
      await seek(time)
      team = await employees()
      reminded ||= /쉬고|간식 먹고|휴식 끝나면/.test(team['실장님'].label)
      headedForSnack ||= team['정민'].label === '간식 먹으러 가는 중' && team['정민'].target === 'coffee'
      if (!restocked && team['실장님'].label === '간식 채우는 중') {
        assert.equal(team['실장님'].zone, '휴게')
        await checkLayout(page)
        await page.screenshot({ path: output + 'manager-restocking.png' })
        restocked = true
      }
      if (!recovered && team['정민'].label === '체력 회복') {
        assert.equal(team['정민'].zone, '휴게')
        assert.equal(team['정민'].snacksEaten, 1)
        await checkLayout(page)
        await page.screenshot({ path: output + 'jeongmin-after-refill.png' })
        recovered = true
      }
      if (reminded && headedForSnack && restocked && recovered) break
    }
    assert.deepEqual({ reminded, headedForSnack, restocked, recovered },
      { reminded: true, headedForSnack: true, restocked: true, recovered: true })
    await seek(124_000)
    team = await employees()
    assert.equal(team['정민'].activity, 'syrup')
    assert.equal(team['윤희'].checkoutBag, true)

    const piece = page.getByRole('button', { name: '윤희 상태 옮기기', exact: true })
    const start = await piece.boundingBox()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    const stall = page.getByRole('button', { name: '윤희 · 붕어빵 판매 중', exact: true })
    await stall.waitFor()
    const target = await stall.boundingBox()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
    await page.mouse.up()
    assert.equal((await employees())['윤희'].target, 'pastry')
    await tick(page, 17_000)
    const { label, activity, zone, checkoutBag } = (await employees())['윤희']
    assert.deepEqual({ label, activity, zone, checkoutBag }, {
      label: '붕어빵 판매 중', activity: 'pastry', zone: '붕어빵', checkoutBag: false,
    })
    await piece.evaluate(button => button.blur())
    await checkLayout(page)
    await page.screenshot({ path: output + 'bungeoppang-stand.png' })
  } finally {
    await page.close()
  }
}

const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

function sampleRegions(page, patches) {
  return page.locator('canvas').evaluate((canvas, areas) => {
    const g = canvas.getContext('2d')
    const sx = canvas.width / 1586
    const sy = canvas.height / 992
    return areas.map(([x, y, w, h]) => {
      const pixels = g.getImageData(Math.round(x * sx), Math.round(y * sy), Math.round(w * sx), Math.round(h * sy)).data
      return btoa(String.fromCharCode(...pixels))
    })
  }, patches)
}

function difference(before, after) {
  return before.map((patch, index) => {
    const a = Buffer.from(patch, 'base64')
    const b = Buffer.from(after[index], 'base64')
    assert.equal(a.length, b.length)
    let changed = 0
    for (let i = 0; i < a.length; i += 4) {
      if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) changed++
    }
    return changed * 4 / a.length
  })
}

async function checkBackgrounds() {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await open(viewport, {}, undefined, false, null)
    try {
      await tick(page, 0)
      await page.getByRole('button', { name: '일시정지', exact: true }).click()
      const picker = page.getByRole('combobox', { name: '배경', exact: true })
      const before = await status(page)
      assert.equal(before.background, 'santa')
      assert.equal(await picker.inputValue(), 'santa')
      assert.deepEqual(before.pets.map(pet => pet.id), ['dog', 'cat', 'rudolph'])
      const area = [[465, 125, 53, 52], [280, 615, 54, 55]]
      const santaPixels = await sampleRegions(page, area)
      await picker.selectOption('pharmacy')
      await settled(page)
      const pharmacy = await status(page)
      assert.equal(pharmacy.background, 'pharmacy')
      assert.equal(pharmacy.elapsed, before.elapsed)
      assert.deepEqual(pharmacy.actors.map(actor => actor.screen), before.actors.map(actor => actor.screen))
      assert.deepEqual(pharmacy.pets.map(pet => pet.id), ['dog', 'cat'])
      assert.ok(difference(santaPixels, await sampleRegions(page, area)).every(amount => amount > .65))
      await page.reload()
      await page.waitForFunction(() => document.querySelector('.scene[data-ready=true]') && window.render_game_to_text)
      assert.equal(await picker.inputValue(), 'pharmacy')
      await tick(page, 0)
      await picker.selectOption('santa')
      const start = (await status(page)).pets.find(pet => pet.id === 'rudolph')
      await tick(page, 16_350)
      const later = (await status(page)).pets.find(pet => pet.id === 'rudolph')
      assert.notDeepEqual(later.screen, start.screen)
      assert.equal(later.message, '루돌프 출발!')
      await checkLayout(page)
      await page.screenshot({ path: output + 'santa-house-' + viewport.width + '.png', fullPage: true })
      await picker.selectOption('pharmacy')
      await settled(page)
      assert.ok(await page.locator('[data-pet="rudolph"]').isHidden())
    } finally {
      await page.close()
    }
  }
}

async function checkSharedSettings() {
  const html = await readFile(new URL('../약국 CCTV.html', import.meta.url))
  let saved = newSharedBoard(Date.now())
  let refuseWrites = false
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(html)
      return
    }
    if (request.url !== '/api/board-state') {
      response.writeHead(404).end()
      return
    }
    if (request.method === 'PATCH') {
      if (refuseWrites) {
        response.writeHead(503).end()
        return
      }
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const change = parseBoardChange(JSON.parse(Buffer.concat(chunks).toString()))
      assert.ok(change)
      saved = applyBoardChange(saved, change, Date.now())
    }
    const { receipts, ...state } = currentSharedBoard(saved, Date.now())
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(state))
  })
  await new Promise(resolve => server.listen(0, resolve))
  const url = 'http://localhost:' + server.address().port
  const editor = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const viewer = await browser.newPage({ viewport: { width: 390, height: 844 } })
  for (const page of [editor, viewer]) page.on('pageerror', error => errors.push(error.message))
  const saveStatus = page => page.locator('.shared-status').getByText('공유 저장됨', { exact: false })
  const background = page => page.getByRole('combobox', { name: '배경', exact: true })
  const nameButton = (page, name) => page.getByRole('button', { name: name + ' 이름·캐릭터 설정', exact: true })
  const saveName = async (page, oldName, newName) => {
    await nameButton(page, oldName).click()
    const settings = page.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
    await settings.getByLabel('표시 이름', { exact: true }).fill(newName)
    await settings.getByRole('button', { name: '적용', exact: true }).click()
  }

  try {
    await viewer.addInitScript(() => {
      if (!localStorage.getItem('pharmacy-cctv:staff-names:v1')) {
        localStorage.setItem('pharmacy-cctv:staff-names:v1', JSON.stringify({ 'demo:seoyeon': '브라우저이름' }))
      }
    })
    await Promise.all([editor.goto(url), viewer.goto(url)])
    await Promise.all([saveStatus(editor).waitFor(), saveStatus(viewer).waitFor()])
    assert.equal(saved.revision, 0)
    await nameButton(viewer, '서연').waitFor()
    await editor.locator('.roster summary').click()

    await background(editor).selectOption('pharmacy')
    await saveStatus(editor).waitFor()
    assert.equal(saved.background, 'pharmacy')
    await viewer.evaluate(() => window.dispatchEvent(new Event('focus')))
    await viewer.waitForFunction(() => document.querySelector('select[aria-label="배경"]')?.value === 'pharmacy')

    refuseWrites = true
    await saveName(editor, '서연', '김서연')
    await editor.locator('.shared-status').getByText(/다시 연결 중/).waitFor()
    assert.deepEqual(saved.names, [])
    await nameButton(editor, '김서연').waitFor()
    refuseWrites = false
    await editor.reload()
    await saveStatus(editor).waitFor()
    assert.deepEqual(saved.names, [['seoyeon', '김서연']])
    await viewer.reload()
    await saveStatus(viewer).waitFor()
    await nameButton(viewer, '김서연').waitFor()
    assert.equal(await background(viewer).inputValue(), 'pharmacy')

    await saveName(viewer, '김서연', '')
    await saveStatus(viewer).waitFor()
    await nameButton(viewer, '서연').waitFor()
    assert.deepEqual(saved.names, [])
    assert.equal(saved.background, 'pharmacy')
  } finally {
    await Promise.all([editor.close(), viewer.close()])
    await new Promise(resolve => server.close(resolve))
  }
}

async function checkBreeze() {
  const page = await open({ width: 1440, height: 900 }, { reducedMotion: 'reduce' })
  try {
    await page.getByRole('button', { name: '일시정지', exact: true }).click()
    await tick(page, 0)
    await settled(page)
    const patches = [[284, 150, 66, 79], [6, 745, 95, 141], [1488, 705, 83, 154], [727, 911, 97, 45]]
    const sample = () => sampleRegions(page, patches)
    const still = await sample()
    await tick(page, 1900)
    let change = difference(still, await sample())
    assert.ok(change.every(amount => amount < .004), 'Reduced motion should keep the selected areas still: ' + change)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await settled(page)
    const animated = await sample()
    change = difference(still, animated)
    assert.ok(change.slice(0, 3).every(amount => amount > .006), 'Curtain and foreground plants should each move: ' + change)
    assert.ok(change[3] < .004, 'The entrance rug should stay fixed: ' + change)
    await tick(page, 2000)
    const next = await sample()
    change = difference(animated, next)
    assert.ok(change.slice(0, 3).every(amount => amount > .006), 'Each area should continue moving through the next phase: ' + change)
    await page.screenshot({ path: output + 'ambient-breeze.png' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await settled(page)
    change = difference(still, await sample())
    assert.ok(change.every(amount => amount < .004), 'Changing the motion preference should repaint the fixed background: ' + change)
  } finally {
    await page.close()
  }
}

async function checkFixtureEffects() {
  const page = await open({ width: 1440, height: 900 }, { reducedMotion: 'reduce' })
  try {
    await tick(page, 0)
    await settled(page)
    const patches = [[677, 347, 27, 21], [1340, 378, 39, 22], [1326, 630, 17, 28], [1392, 601, 16, 24]]
    const sample = () => sampleRegions(page, patches)
    // Warm up Chrome's canvas readback before comparing the screen's fine lines.
    for (let i = 0; i < 2; i++) {
      await sample()
      await tick(page, 25)
    }
    const still = await sample()
    await tick(page, 1200)
    const reduced = difference(still, await sample())
    assert.ok(reduced.every(amount => amount < .012), 'Reduced motion keeps fixture effects static: ' + reduced)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await settled(page)
    const first = await sample()
    await tick(page, 1800)
    const next = await sample()
    const moved = difference(first, next)
    assert.ok(moved.slice(0, 3).every(amount => amount > .015), 'Liquids, display and steam each move inside the intended areas: ' + moved)
    assert.ok(moved[3] < .012, 'The space above the coffee machine stays still: ' + moved)
    await page.screenshot({ path: output + 'fixture-effects.png' })
  } finally {
    await page.close()
  }
}

async function checkRoomLighting() {
  const page = await open({ width: 1440, height: 900 }, { reducedMotion: 'reduce' })
  try {
    const areas = [[1254, 103, 41, 32], [764, 74, 51, 57], [68, 584, 44, 48]]
    const initialMinute = 624
    async function frameAt(minute) {
      await tick(page, (minute - initialMinute) * 5000 - await milliseconds(page))
      assert.equal((await status(page)).minute, minute % 1440)
      return sampleRegions(page, areas)
    }
    await settled(page)
    const day = await frameAt(initialMinute)
    await page.screenshot({ path: output + 'lighting-day.png' })
    const sunset = await frameAt(1065)
    await page.screenshot({ path: output + 'lighting-sunset.png' })
    const before = await frameAt(1115)
    const after = await frameAt(1116)
    assert.ok(difference(before, after).every(amount => amount < .018), 'The cottage and room should not jump in a single minute.')
    const night = await frameAt(1200)
    await page.screenshot({ path: output + 'lighting-night.png' })
    const changesToSunset = difference(day, sunset)
    const changesToNight = difference(sunset, night)
    assert.ok(changesToSunset.every(amount => amount > .15), 'The cottage, window and room change at sunset: ' + changesToSunset)
    assert.ok(changesToNight.every(amount => amount > .19), 'Each area continues changing towards night: ' + changesToNight)
    const late = await frameAt(1439)
    const midnight = await frameAt(1440)
    assert.ok(difference(late, midnight).every(amount => amount < .018), 'Midnight should keep the same lighting.')
    const dawn = await frameAt(1440 + 412)
    assert.ok(difference(midnight, dawn).every(amount => amount > .14), 'Each area gradually lights up again at dawn.')
  } finally {
    await page.close()
  }
}

async function checkZoneSigns() {
  const page = await open({ width: 1440, height: 900 }, { reducedMotion: 'reduce' })
  try {
    const drawOrder = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      const g = canvas.getContext('2d')
      const sx = canvas.width / 1586
      const sy = canvas.height / 992
      const images = g.drawImage
      const text = g.fillText
      const draws = []
      g.drawImage = function (...args) {
        const transform = this.getTransform()
        draws.push({ x: transform.e / sx, y: transform.f / sy })
        return images.apply(this, args)
      }
      g.fillText = function (label, ...args) {
        draws.push({ label, y: args[1] })
        return text.call(this, label, ...args)
      }
      try {
        const snapshot = () => JSON.parse(window.render_game_to_text())
        window.advanceTime(19_350 - snapshot().elapsed)
        const walker = snapshot().actors.find(actor => actor.id === 'junho')
        const actorIndex = draws.findIndex(draw => !draw.label
          && Math.abs(draw.x - walker.screen.x) < 2 && Math.abs(draw.y - walker.screen.y) < 2)
        const signIndex = draws.findIndex(draw => draw.label === '휴게 공간')
        return { moving: walker.moving, actorIndex, signIndex }
      } finally {
        g.drawImage = images
        g.fillText = text
      }
    })
    assert.ok(drawOrder.moving)
    assert.ok(drawOrder.signIndex >= 0 && drawOrder.actorIndex > drawOrder.signIndex,
      'An employee crossing the lounge sign should appear in front of it: ' + JSON.stringify(drawOrder))
    await checkLayout(page)
    await page.screenshot({ path: output + 'zone-signs-walk.png' })
    await tick(page, 35_600 - await milliseconds(page))
    await checkLayout(page)
    await page.screenshot({ path: output + 'zone-signs-overview.png' })
  } finally {
    await page.close()
  }
}

async function checkInternalFeed() {
  const start = '2026-11-25T01:20:00.000Z'
  const base = {
    version: 1, generatedAt: start,
    rosterCsv: '날짜,이름,출근,퇴근,상태\n2026-11-25,김한나,09:00,18:00,\n2026-11-25,박별,,,휴무',
    workCsv: '날짜,이름,업무,시작,종료\n2026-11-25,김한나,조제,10:00,12:00',
  }
  let payload = { ...base }
  let unavailable = false
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET')
    assert.equal(request.url, '/status.json')
    response.writeHead(unavailable ? 503 : 200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    response.end(JSON.stringify(payload))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/status.json'
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !(unavailable && message.text().includes('503'))) errors.push(message.text())
  })
  const targetIs = label => page.waitForFunction(expected => {
    const actor = JSON.parse(window.render_game_to_text?.() ?? '{}').actors?.find(person => person.name === '김한나')
    return actor?.target === expected
  }, label)
  const mode = page.locator('.mode-chip')
  try {
    await page.clock.install({ time: new Date(start) })
    await page.goto(app)
    await page.getByRole('button', { name: /^근무 인원 설정/ }).click()
    await page.getByRole('button', { name: '근무표 가져오기', exact: true }).click()
    await page.getByRole('button', { name: '내부 시스템 연동', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '내부 시스템 연동' })
    const address = settings.getByLabel('연동 주소')
    await address.fill('http://office.example/status.json')
    await settings.getByRole('button', { name: '연결', exact: true }).click()
    await settings.getByRole('alert').getByText(/HTTPS/).waitFor()
    await address.fill(endpoint)
    await settings.getByRole('button', { name: '연결', exact: true }).click()
    await settings.getByRole('status').getByText(/연결됨/).waitFor()
    await targetIs('dispense')
    assert.deepEqual((await status(page)).actors.map(actor => actor.name), ['김한나', '박별'])
    await page.screenshot({ path: output + 'internal-feed-settings.png' })
    await settings.getByRole('button', { name: '닫기' }).click()
    await checkLayout(page)
    await page.locator('.bubble:visible').filter({ hasText: '조제 중' }).waitFor()
    await page.screenshot({ path: output + 'internal-feed-board.png' })

    payload = { ...base, generatedAt: '2026-11-25T01:20:30Z', workCsv: base.workCsv.replace('조제', '상담') }
    await page.clock.fastForward(31_000)
    await targetIs('counsel')
    assert.equal((await status(page)).actors.length, 2)
    await page.clock.fastForward(91_000)
    await mode.getByText(/연동 끊김/).waitFor()
    await targetIs('unknown')
    assert.equal((await status(page)).actors.find(actor => actor.name === '김한나').activity, 'unknown')
    await page.locator('.bubble:visible').filter({ hasText: '업무 상태 미확인' }).waitFor()
    await page.screenshot({ path: output + 'internal-feed-stale.png' })

    const time = await page.evaluate(() => new Date().toISOString())
    payload = { ...base, generatedAt: time, workCsv: base.workCsv.replace('조제', '계산') }
    await mode.click()
    await settings.getByRole('button', { name: '지금 새로고침' }).click()
    await targetIs('checkout')
    await page.reload()
    await targetIs('checkout')
    await mode.click()
    unavailable = true
    await settings.getByRole('button', { name: '지금 새로고침' }).click()
    await settings.getByRole('status').getByText(/503/).waitFor()
    await targetIs('unknown')
    await page.locator('.bubble:visible').filter({ hasText: '업무 상태 미확인' }).waitFor()
    await settings.getByRole('button', { name: '연결 해제' }).click()
    await mode.getByText('시뮬레이션 모드').waitFor()
    assert.equal(await page.evaluate(() => localStorage.getItem('pharmacy-cctv:internal-feed:v1')), null)
  } finally {
    await page.close()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

async function checkCalendarRoster() {
  const calendar = [
    '일 (Sun)\t월 (Mon)\t화 (Tue)\t수 (Wed)\t목 (Thu)\t금 (Fri)\t토 (Sat)',
    '1\t2테스트가\t3\t4테스트나\t5\t6\t7',
    '8\t9\t10\t11\t12\t13\t14',
    '15테스트다\t16\t17\t18\t19\t20\t21',
    '22\t23\t24\t25테스트가, 테스트나\t26테스트나\t27휴무\t28',
    '29\t30\t1다음달직원\t2\t3\t4\t5',
  ].join('\n')
  const page = await open({ width: 1440, height: 900 }, {}, new Date('2026-11-25T01:15:00Z'))
  try {
    await page.getByRole('button', { name: /^근무 인원 설정/ }).click()
    await page.getByRole('button', { name: '근무표 가져오기', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '근무표 가져오기' })
    await dialog.getByLabel('근무표 내용').fill(calendar)
    const month = dialog.getByLabel('달력의 연도와 월')
    const submit = dialog.getByRole('button', { name: '가져오기', exact: true })
    await submit.click()
    await dialog.getByRole('alert').getByText(/연도와 월/).waitFor()
    await month.fill('2026-12')
    await submit.click()
    await dialog.getByRole('alert').getByText(/날짜 배치/).waitFor()
    await month.fill('2026-11')
    await submit.click()
    const count = page.locator('.working-count')
    await count.getByText('오늘 예정 2명').waitFor()
    await page.waitForFunction(() => window.render_game_to_text?.().includes('"calendar"'))
    assert.equal(await page.locator('.bubble:visible').count(), 0)
    assert.match(await page.locator('.mode-chip').innerText(), /현재 인원 미확인/)
    assert.match(await page.locator('.roster summary').innerText(), /달력 명단 3명/)
    assert.equal(await page.locator('.roster-task').getByText('근무시간 미확인').count(), 2)
    assert.equal(await page.locator('.roster-duty').getByText('근무 예정').count(), 2)
    assert.deepEqual((await status(page)).actors.map(actor => actor.name), ['테스트가', '테스트나', '테스트다'])
    await checkLayout(page)
    await page.screenshot({ path: output + 'calendar-roster-board.png' })

    const openHours = () => page.getByRole('button', { name: /^달력 근무시간 설정/ }).click()
    await openHours()
    const hours = page.getByRole('dialog', { name: '달력 근무시간 설정' })
    const start = hours.getByLabel('테스트가 출근 시간')
    const end = hours.getByLabel('테스트가 퇴근 시간')
    const applyHours = hours.getByRole('button', { name: '이 달에 적용' })
    await start.fill('09:00')
    await applyHours.click()
    await hours.getByRole('alert').getByText(/출근과 퇴근/).waitFor()
    await end.fill('18:00')
    await hours.getByRole('heading').click()
    await page.screenshot({ path: output + 'calendar-hours-settings.png' })
    await applyHours.click()
    await hours.waitFor({ state: 'hidden' })
    await count.getByText('근무표상 1명', { exact: true }).waitFor()
    assert.match(await page.locator('.mode-chip').innerText(), /일부 시간 미확인/)
    await page.locator('.bubble:visible').filter({ hasText: '업무 상태 미확인' }).waitFor()
    assert.equal(await page.locator('.roster-duty').getByText('근무 예정').count(), 1)
    await checkLayout(page)
    await page.screenshot({ path: output + 'calendar-hours-board.png' })

    await page.reload()
    await count.getByText('근무표상 1명', { exact: true }).waitFor()
    await openHours()
    assert.equal(await start.inputValue(), '09:00')
    assert.equal(await end.inputValue(), '18:00')
    await start.fill('08:00')
    await hours.getByRole('button', { name: '취소', exact: true }).click()
    await openHours()
    assert.equal(await start.inputValue(), '09:00')

    const byDate = hours.getByRole('button', { name: '날짜별 예외' })
    const date = hours.getByLabel('근무 날짜')
    const applyDate = hours.getByRole('button', { name: '선택한 날에 적용' })
    await byDate.click()
    assert.equal(await date.inputValue(), '2026-11-25')
    await hours.getByText('기본 09:00–18:00').waitFor()
    await start.fill('13:00')
    await end.fill('18:00')
    await hours.getByRole('heading').click()
    await page.screenshot({ path: output + 'calendar-date-hours.png' })
    await applyDate.click()
    await count.getByText('근무표상 0명', { exact: true }).waitFor()
    await page.locator('.roster li').filter({ hasText: '테스트가' }).getByText('근무시간 전', { exact: true }).first().waitFor()

    await page.reload()
    await count.getByText('근무표상 0명', { exact: true }).waitFor()
    await openHours()
    assert.equal(await start.inputValue(), '09:00')
    await byDate.click()
    assert.equal(await start.inputValue(), '13:00')
    assert.match(await date.locator('option:checked').innerText(), /예외 있음/)
    await date.selectOption('2026-11-26')
    assert.equal(await start.count(), 0)
    await date.selectOption('2026-11-25')
    assert.equal(await start.inputValue(), '13:00')
    await hours.getByRole('button', { name: '테스트가 기본 시간으로' }).click()
    assert.equal(await start.inputValue(), '')
    await applyDate.click()
    await count.getByText('근무표상 1명', { exact: true }).waitFor()

    await openHours()
    await start.fill('')
    await end.fill('')
    await applyHours.click()
    await count.getByText('오늘 예정 2명').waitFor()

    await page.reload()
    await count.getByText('오늘 예정 2명').waitFor()
    await page.clock.fastForward(86_400_000)
    await count.getByText('오늘 예정 1명').waitFor()
    await page.clock.fastForward(86_400_000)
    await count.getByText('오늘 예정 0명').waitFor()
    await page.clock.fastForward(4 * 86_400_000)
    await count.getByText('오늘 예정 미확인').waitFor()
    await count.click()
    const manage = page.getByRole('dialog', { name: '근무표 관리' })
    await manage.getByLabel('근무표 내용').fill('날짜,이름,출근,퇴근\n2026-12-01,테스트나,09:00,18:00')
    await manage.getByRole('button', { name: '가져오기', exact: true }).click()
    await count.getByText('1명').waitFor()
    assert.match(await count.innerText(), /근무표상/)
    assert.equal(await page.locator('#calendar-month').count(), 0)
  } finally {
    await page.close()
  }

  const phone = await open({ width: 390, height: 844 }, { isMobile: true, deviceScaleFactor: 2 })
  try {
    await phone.getByRole('button', { name: /^근무 인원 설정/ }).click()
    await phone.getByRole('button', { name: '근무표 가져오기', exact: true }).click()
    const dialog = phone.getByRole('dialog', { name: '근무표 가져오기' })
    await dialog.getByLabel('근무표 내용').fill(calendar)
    await dialog.getByLabel('달력의 연도와 월').fill('2026-11')
    assert.ok(await dialog.evaluate(node => {
      const rect = node.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
    }))
    await phone.screenshot({ path: output + 'calendar-roster-import.png' })
    await dialog.getByRole('button', { name: '가져오기', exact: true }).click()
    await phone.getByRole('button', { name: /^달력 근무시간 설정/ }).click()
    const hours = phone.getByRole('dialog', { name: '달력 근무시간 설정' })
    await hours.getByRole('button', { name: '날짜별 예외' }).click()
    assert.ok(await hours.evaluate(node => {
      const rect = node.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && node.scrollWidth <= node.clientWidth
    }))
  } finally {
    await phone.close()
  }
}

try {
  await checkSharedSettings()
  await checkBackgrounds()
  await checkActiveRoster()
  await checkMascots()
  await checkSnackBreaks()
  await checkCocoFollowing()
  await checkPersonalitiesAndPastry()
  await checkStaffPlacement()
  await checkCottagePlacementAndKoreanClock()
  const desktop = await open({ width: 1440, height: 900 })
  assert.equal(await desktop.title(), '약국 CCTV')
  assert.equal(await desktop.locator('.working-count strong').textContent(), '14명')
  assert.match(await desktop.locator('.mode-chip').textContent(), /시뮬레이션/)
  assert.equal(await desktop.locator('.bubble:visible').count(), 16)
  assert.equal(await desktop.locator('.in-cottage:visible').count(), 2)
  const completeImage = await desktop.locator('canvas').evaluate(surface => {
    const { width, height } = surface
    const g = surface.getContext('2d')
    const sample = (x, y) => [...g.getImageData(x, y, 1, 1).data]
    const edge = [sample(2, 2), sample(width - 3, 2), sample(2, height - 3), sample(width - 3, height - 3)]
    return edge.every(color => color[3] === 255 && color[0] + color[1] + color[2] > 45)
      && new Set(edge.map(color => color.join(','))).size === edge.length
  })
  assert.ok(completeImage, 'The scene artwork should reach all four corners.')
  assert.equal(await desktop.locator('.roster li:visible').count(), 0)
  await desktop.locator('.roster summary').click()
  assert.equal(await desktop.locator('.roster li:visible').count(), 16)
  for (const name of ['수빈', '도윤', '나은', '현우', '소라', '태호', '은서', '다희', '채원', '보라']) {
    assert.equal(await desktop.locator('.roster-name').getByText(name, { exact: false }).count(), 1)
  }
  await desktop.screenshot({ path: output + 'roster.png' })
  await desktop.locator('.roster summary').click()
  assert.equal(await desktop.locator('.roster li:visible').count(), 0)
  const initial = await status(desktop)
  assert.equal(initial.actors.filter(actor => actor.duty === 'working').length, 12)
  assert.equal(initial.actors.filter(actor => actor.duty === 'break').length, 2)
  assert.equal(initial.actors.filter(actor => actor.duty === 'off').length, 2)
  assert.ok(await desktop.locator('.viewer').evaluate(node => node.clientWidth * node.clientHeight / (innerWidth * innerHeight) >= .85))
  await checkLayout(desktop)

  await desktop.getByRole('button', { name: '일시정지' }).click()
  await desktop.getByRole('button', { name: '재생' }).waitFor()
  await desktop.waitForTimeout(80)
  const stoppedAt = await milliseconds(desktop)
  await desktop.waitForTimeout(220)
  assert.equal(await milliseconds(desktop), stoppedAt)
  await desktop.getByRole('button', { name: '재생' }).click()
  await desktop.waitForFunction(at => JSON.parse(window.render_game_to_text()).elapsed > at, stoppedAt)

  await desktop.getByRole('button', { name: '전체 화면', exact: true }).click()
  await desktop.getByRole('button', { name: '전체 화면 닫기' }).waitFor()
  assert.equal(await desktop.evaluate(() => Boolean(document.fullscreenElement)), true)
  await desktop.getByRole('button', { name: '전체 화면 닫기' }).click()
  await desktop.getByRole('button', { name: '전체 화면', exact: true }).waitFor()
  assert.equal(await desktop.evaluate(() => Boolean(document.fullscreenElement)), false)

  await tick(desktop, Math.max(0, 1100 - await milliseconds(desktop)))
  await desktop.mouse.move(21, 76)
  await desktop.screenshot({ path: output + 'desktop.png' })

  await tick(desktop, 16_250 - await milliseconds(desktop))
  const moving = (await status(desktop)).actors.find(actor => actor.id === 'junho')
  assert.equal(moving.moving, true)
  assert.equal(moving.activity, 'syrup')
  assert.equal(moving.target, 'office')
  assert.equal(await desktop.locator('.roster li').nth(1).locator('.roster-task').textContent(), '이동 중')
  await checkLayout(desktop)

  for (const elapsed of [19_000, 24_000, 42_000, 55_000, 61_500, 74_000, 110_000, 250_000]) {
    await tick(desktop, elapsed - await milliseconds(desktop))
    await checkLayout(desktop)
    if (elapsed === 24_000) {
      assert.equal((await status(desktop)).actors.find(actor => actor.id === 'junho').activity, 'office')
    }
    if (elapsed === 61_500) {
      const arrival = (await status(desktop)).actors.find(actor => actor.id === 'jieun')
      assert.equal(arrival.activity, 'coffee')
      assert.equal(arrival.duty, 'break')
      await desktop.waitForTimeout(360)
      await desktop.screenshot({ path: output + 'activity.png' })
    }
  }

  const beforeClose = (1065 - 624) * 5000
  await tick(desktop, beforeClose - await milliseconds(desktop))
  let opening = 0
  for (let sample = 0; sample < 25; sample++) {
    await tick(desktop, 330)
    opening = Math.max(opening, (await status(desktop)).door)
  }
  assert.ok(opening > .5, 'The exit door should open while a worker leaves.')
  await tick(desktop, (1150 - 624) * 5000 - await milliseconds(desktop))
  assert.equal(await desktop.locator('.working-count strong').textContent(), '0명')
  assert.equal(await desktop.locator('.roster [data-duty=departed]').count(), 14)
  assert.equal(await desktop.locator('.bubble:visible').count(), 2)
  await desktop.waitForTimeout(360)
  await desktop.screenshot({ path: output + 'night.png' })
  await desktop.close()

  const staffing = await open({ width: 1440, height: 900 })
  const picker = staffing.getByRole('button', { name: /근무 인원 설정/ })
  const dialog = staffing.getByRole('dialog', { name: '근무 인원 설정' })
  const count = dialog.getByLabel('근무 인원', { exact: true })
  await staffing.getByRole('button', { name: '일시정지' }).click()
  const pausedAt = await milliseconds(staffing)
  await picker.click()
  assert.equal(await count.inputValue(), '14')
  await count.selectOption('6')
  assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 6)
  await dialog.getByRole('checkbox', { name: /서연/ }).uncheck()
  await dialog.getByRole('checkbox', { name: /보라/ }).check()
  assert.equal(await count.inputValue(), '6')
  await staffing.screenshot({ path: output + 'settings.png' })
  await dialog.getByRole('button', { name: '적용', exact: true }).click()
  assert.equal(await staffing.locator('.working-count strong').textContent(), '6명')
  let selected = await status(staffing)
  assert.equal(selected.elapsed, pausedAt)
  assert.equal(selected.staffing.length, 6)
  assert.ok(selected.staffing.includes('bora'))
  assert.ok(!selected.staffing.includes('seoyeon'))
  assert.equal(selected.actors.filter(actor => actor.duty === 'off' && actor.present).length, 2)
  await checkLayout(staffing)

  await picker.click()
  await count.selectOption('0')
  await staffing.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await staffing.locator('.working-count strong').textContent(), '6명')

  await staffing.reload()
  await staffing.waitForFunction(() => document.querySelector('.scene[data-ready=true]') && window.render_game_to_text)
  assert.equal(await staffing.locator('.working-count strong').textContent(), '6명')
  assert.ok((await status(staffing)).staffing.includes('bora'))

  await picker.click()
  await count.selectOption('0')
  await dialog.getByRole('button', { name: '적용', exact: true }).click()
  assert.equal(await staffing.locator('.working-count strong').textContent(), '0명')
  await staffing.waitForFunction(() => document.querySelectorAll('.bubble:not([hidden])').length === 2)
  assert.equal((await status(staffing)).actors.filter(actor => actor.duty === 'off').length, 16)

  await picker.click()
  await count.selectOption('16')
  await dialog.getByRole('button', { name: '적용', exact: true }).click()
  assert.equal(await staffing.locator('.working-count strong').textContent(), '16명')
  await staffing.waitForFunction(() => document.querySelectorAll('.bubble:not([hidden])').length === 16)
  assert.equal(await staffing.locator('.in-cottage:visible').count(), 0)
  await checkLayout(staffing)

  await picker.click()
  await dialog.getByRole('button', { name: '기본 근무표 적용' }).click()
  assert.equal(await staffing.locator('.working-count strong').textContent(), '14명')
  assert.equal((await status(staffing)).staffing, null)
  await staffing.close()

  const appearance = await open({ width: 1440, height: 900 })
  await appearance.getByRole('button', { name: '일시정지' }).click()
  await appearance.locator('.roster summary').click()
  const beforeAppearance = await status(appearance)
  const beforePixels = await sampleCharacter(appearance, beforeAppearance.actors[0].screen)
  const appearanceDialog = appearance.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
  const openAppearance = appearance.getByRole('button', { name: '직원 이름·캐릭터 설정', exact: true })
  await openAppearance.click()
  assert.equal(await appearanceDialog.getByRole('radio').count(), 19)
  assert.equal(await appearanceDialog.getByLabel('직원', { exact: true }).inputValue(), 'seoyeon')
  await appearanceDialog.getByRole('radio', { name: '연보라 니트', exact: true }).check()
  assert.equal(await appearanceDialog.getByText('유나의 외형과 서로 바뀝니다.').isVisible(), true)
  await appearanceDialog.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await appearance.screenshot({ path: output + 'appearance-settings.png' })
  await appearanceDialog.getByRole('button', { name: '적용', exact: true }).click()
  await appearance.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors[0].sprite === 'staff-6')
  const afterAppearance = await status(appearance)
  assert.equal(afterAppearance.elapsed, beforeAppearance.elapsed)
  assert.deepEqual(afterAppearance.actors.map(({ id, x, y, label }) => [id, x, y, label]),
    beforeAppearance.actors.map(({ id, x, y, label }) => [id, x, y, label]))
  assert.equal(afterAppearance.actors.find(actor => actor.id === 'yuna').sprite, 'staff-1')
  // The simulation may report the sprite change before the canvas paints the next frame.
  await appearance.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.notEqual(await sampleCharacter(appearance, afterAppearance.actors[0].screen), beforePixels)
  await appearance.locator('.roster summary').click()
  await appearance.screenshot({ path: output + 'appearance-board.png' })

  await appearance.locator('.roster summary').click()
  await appearance.getByRole('button', { name: '서연 이름·캐릭터 설정', exact: true }).click()
  await appearanceDialog.getByRole('radio', { name: '버터색 카디건', exact: true }).check()
  await appearance.keyboard.press('Escape')
  await appearanceDialog.waitFor({ state: 'hidden' })
  assert.equal((await status(appearance)).actors[0].sprite, 'staff-6')

  await appearance.reload()
  await appearance.waitForFunction(() => window.render_game_to_text &&
    JSON.parse(window.render_game_to_text()).actors[0].sprite === 'staff-6')
  await appearance.locator('.roster summary').click()
  await appearance.getByRole('button', { name: '서연 이름·캐릭터 설정', exact: true }).click()
  assert.equal(await appearanceDialog.getByRole('radio', { name: '연보라 니트', exact: true }).isChecked(), true)
  await appearanceDialog.getByRole('button', { name: '기본 외형 선택' }).click()
  await appearanceDialog.getByRole('button', { name: '적용', exact: true }).click()
  await appearance.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors[0].sprite === 'staff-1')
  assert.equal((await status(appearance)).actors.find(actor => actor.id === 'yuna').sprite, 'staff-6')
  await openAppearance.click()
  const displayName = appearanceDialog.getByLabel('표시 이름', { exact: true })
  const applyAppearance = appearanceDialog.getByRole('button', { name: '적용', exact: true })
  await displayName.fill('준호')
  await applyAppearance.click()
  assert.match(await appearanceDialog.getByRole('alert').textContent(), /다른 직원/)
  await displayName.fill('김서연')
  await appearanceDialog.getByRole('radio', { name: '여성 약사 · 금테 안경', exact: true }).check()
  await appearanceDialog.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  assert.ok(await appearanceDialog.getByRole('heading').evaluate(heading =>
    heading.getBoundingClientRect().top >= heading.closest('dialog').getBoundingClientRect().top))
  await appearance.screenshot({ path: output + 'staff-profile-settings.png' })
  await applyAppearance.click()
  await appearance.getByRole('button', { name: '김서연 상태 옮기기', exact: true }).waitFor()
  assert.equal(await appearance.locator('.bubble-name').filter({ hasText: /^김서연$/ }).count(), 1)
  assert.equal((await status(appearance)).actors[0].sprite, 'staff-17')
  for (const [id, label] of [['subin', '여성 약사 · 살구색 블라우스'], ['doyun', '여성 약사 · 올림머리']]) {
    await openAppearance.click()
    await appearanceDialog.getByLabel('직원', { exact: true }).selectOption(id)
    await appearanceDialog.getByRole('radio', { name: label, exact: true }).check()
    await applyAppearance.click()
  }
  await appearance.reload()
  await appearance.waitForFunction(() => {
    const actors = window.render_game_to_text && JSON.parse(window.render_game_to_text()).actors
    return actors?.[0].name === '김서연' && actors.some(actor => actor.sprite === 'staff-18')
      && actors.some(actor => actor.sprite === 'staff-19')
  })
  assert.equal((await status(appearance)).actors[0].sprite, 'staff-17')
  await appearance.screenshot({ path: output + 'women-pharmacists-board.png' })
  await appearance.locator('.roster summary').click()
  await appearance.getByRole('button', { name: '김서연 이름·캐릭터 설정', exact: true }).click()
  await displayName.fill('')
  await applyAppearance.click()
  await appearance.getByRole('button', { name: '서연 상태 옮기기', exact: true }).waitFor()
  await appearance.close()

  const notesPage = await open({ width: 1440, height: 900 }, {}, new Date('2026-11-25T01:24:00Z'))
  await notesPage.getByRole('button', { name: '일시정지' }).click()
  await notesPage.locator('.roster summary').click()
  const beforeNoteTime = await milliseconds(notesPage)
  const notesButton = notesPage.getByRole('button', { name: '전달 메모', exact: true })
  const notesModal = notesPage.getByRole('dialog', { name: '전달 메모' })
  const writer = notesModal.getByRole('combobox', { name: '작성자', exact: true })
  const recipient = notesModal.getByRole('combobox', { name: '받는 직원', exact: true })
  const noteText = notesModal.getByLabel(/메모 내용/)
  await notesButton.click()
  assert.equal(await notesModal.getByRole('button', { name: '메모 게시' }).isEnabled(), false)
  await writer.selectOption('junho')
  await recipient.selectOption('jieun')
  await noteText.fill('계산대 확인 부탁해요.')
  await notesPage.screenshot({ path: output + 'notes-settings.png' })
  await notesModal.getByRole('button', { name: '메모 게시' }).click()

  const noteBubble = notesPage.locator('.bubble:visible').filter({ hasText: '계산대 확인 부탁해요.' })
  await noteBubble.locator('.bubble-note:visible').waitFor()
  assert.equal(await noteBubble.locator('.bubble-task').textContent(), '계산 중')
  assert.equal(await noteBubble.locator('.bubble-note strong').textContent(), '준호')
  assert.equal(await milliseconds(notesPage), beforeNoteTime)
  assert.equal(await notesPage.locator('.roster-note').filter({ hasText: '계산대 확인 부탁해요.' }).isVisible(), true)
  await checkLayout(notesPage)
  await notesPage.locator('.roster summary').click()
  await notesPage.waitForTimeout(325)
  await notesPage.screenshot({ path: output + 'notes-board.png' })

  await notesPage.reload()
  await notesPage.waitForFunction(() => window.render_game_to_text &&
    JSON.parse(window.render_game_to_text()).actors.find(actor => actor.id === 'jieun')?.note?.text === '계산대 확인 부탁해요.')
  await notesPage.locator('.roster summary').click()
  await notesButton.click()
  await recipient.selectOption('jieun')
  await noteText.fill('영수증 확인했어요.')
  assert.equal(await notesModal.getByText('받는 직원에게 게시 중인 메모를 바꿉니다.').isVisible(), true)
  await notesModal.getByRole('button', { name: '메모 바꾸기' }).click()
  await notesPage.locator('.roster-note').filter({ hasText: '영수증 확인했어요.' }).waitFor()
  assert.equal(await notesPage.locator('.roster-note').count(), 1)
  assert.equal((await status(notesPage)).actors.find(actor => actor.id === 'jieun').note.author, '현황판')

  await notesButton.click()
  await notesModal.getByRole('button', { name: '지은 메모 지우기' }).click()
  await notesModal.getByRole('heading', { name: '게시 중인 메모' }).waitFor({ state: 'hidden' })
  await recipient.selectOption('yuna')
  await noteText.fill('다음 근무 때 확인해 주세요.')
  await notesModal.getByRole('button', { name: '메모 게시' }).click()
  await notesPage.locator('.in-cottage .note-flag:visible').waitFor()
  await notesPage.getByRole('button', { name: '일시정지' }).click()
  const expiry = (await status(notesPage)).actors.find(actor => actor.id === 'yuna').note.expiresAt
  const clockNow = await notesPage.evaluate(() => Date.now())
  await notesPage.clock.fastForward(expiry - clockNow + 1_000)
  await notesPage.locator('.roster-note').waitFor({ state: 'hidden' })
  assert.equal(await notesPage.evaluate(() => localStorage.getItem('pharmacy-cctv:notes:v1')), null)
  assert.equal((await status(notesPage)).paused, true)
  await notesPage.close()

  const roster = await open({ width: 1440, height: 900 })
  await roster.clock.setFixedTime(new Date('2026-11-24T01:00:00Z'))
  await roster.getByRole('button', { name: /근무 인원 설정/ }).click()
  await roster.getByRole('button', { name: '근무표 가져오기', exact: true }).click()
  const fileDialog = roster.getByRole('dialog', { name: '근무표 가져오기' })
  const sheet = fileDialog.getByLabel('근무표 내용')
  const applyRoster = fileDialog.getByRole('button', { name: '가져오기', exact: true })
  await sheet.fill('이름,출근,퇴근\n김한나,09:00,29:00')
  await applyRoster.click()
  assert.match(await fileDialog.getByRole('alert').textContent(), /2행.*퇴근/)
  assert.equal((await status(roster)).mode, 'simulation')

  const rosterCSV = [
    '날짜,이름,출근,퇴근,상태,메모',
    '2026-11-24,김한나,09:00,18:00,,예시 메모',
    '2026-11-24,박별,,,휴무,',
    '2026-11-24,정유리,12:00,20:00,,,',
    '2026-11-24,최은지,,,,',
    '2026-11-25,박별,08:00,17:00,,',
  ].join('\n')
  await fileDialog.locator('input[type=file]').setInputFiles({
    name: 'sample-roster.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + rosterCSV),
  })
  await roster.waitForFunction(() => document.querySelector('#roster-text').value.includes('2026-11-25'))
  await roster.screenshot({ path: output + 'schedule-import.png' })
  await applyRoster.click()
  await roster.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'connected')
  let loaded = await status(roster)
  assert.equal(loaded.minute, 600)
  assert.equal(loaded.actors[0].zone, '공용 통로')
  assert.deepEqual(loaded.actors.map(actor => [actor.name, actor.duty, actor.activity]), [
    ['김한나', 'working', 'unknown'], ['박별', 'off', 'dayoff'], ['정유리', 'before', 'before'], ['최은지', 'unconfirmed', 'unknown'],
  ])
  assert.equal(await roster.locator('.working-count strong').textContent(), '1명')
  assert.equal(await roster.evaluate(() => localStorage.getItem('pharmacy-cctv:roster:v1').includes('예시 메모')), false)
  await roster.locator('.roster summary').click()
  assert.equal(await roster.locator('.roster li:visible').count(), 4)
  await roster.waitForTimeout(360)
  await roster.screenshot({ path: output + 'schedule-board.png' })
  await checkLayout(roster)

  await roster.getByRole('button', { name: '김한나 상태 옮기기', exact: true }).press('Enter')
  await roster.getByRole('button', { name: '김한나 · 고객 상담 중', exact: true }).click()
  await tick(roster, 75_000)
  assert.equal((await status(roster)).actors[0].activity, 'counsel')
  await roster.reload()
  await roster.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).actors[0]?.activity === 'counsel')
  await roster.locator('.roster summary').click()

  await roster.getByRole('button', { name: '김한나 이름·캐릭터 설정', exact: true }).click()
  const fileAppearance = roster.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
  await fileAppearance.getByRole('radio', { name: '버터색 카디건', exact: true }).check()
  await fileAppearance.getByRole('button', { name: '적용', exact: true }).click()
  await roster.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors[0].sprite === 'staff-14')
  assert.equal((await status(roster)).actors[0].zone, '상담')

  await roster.getByRole('button', { name: '전달 메모', exact: true }).click()
  const fileNote = roster.getByRole('dialog', { name: '전달 메모' })
  await fileNote.getByRole('combobox', { name: '작성자', exact: true }).selectOption({ label: '박별' })
  await fileNote.getByRole('combobox', { name: '받는 직원', exact: true }).selectOption({ label: '김한나' })
  await fileNote.getByLabel(/메모 내용/).fill('상담 자료 확인 부탁해요.')
  await fileNote.getByRole('button', { name: '메모 게시' }).click()
  await roster.locator('.roster-note').filter({ hasText: '상담 자료 확인 부탁해요.' }).waitFor()

  const openWork = roster.getByRole('button', { name: '업무 상태 가져오기', exact: true })
  const workDialog = roster.getByRole('dialog', { name: '업무 상태 가져오기' })
  const workText = workDialog.getByLabel('업무 상태 내용')
  await roster.getByRole('button', { name: /근무표 관리/ }).click()
  await roster.getByRole('dialog', { name: '근무표 관리' }).getByRole('button', { name: '업무 상태 가져오기' }).click()
  await workText.fill('이름,업무,시작,종료\n김한나,확인할수없는상태,10:00,10:15')
  await workDialog.getByRole('button', { name: '가져오기', exact: true }).click()
  assert.match(await workDialog.getByRole('alert').textContent(), /2행.*업무/)

  const workFile = [
    '날짜,이름,업무,시작,종료',
    '2026-11-24,김한나,조제 중,10:00,10:15',
    '2026-11-24,박별,계산 중,10:00,10:15',
    '2026-11-24,정유리,재고 확인 중,10:00,10:15',
    '2026-11-25,박별,고객 상담 중,10:00,10:15',
  ].join('\n')
  await workDialog.locator('input[type=file]').setInputFiles({
    name: 'sample-work.csv', mimeType: 'text/csv', buffer: Buffer.from(workFile),
  })
  await roster.waitForFunction(() => document.querySelector('#roster-text').value.includes('2026-11-25'))
  await roster.screenshot({ path: output + 'work-import.png' })
  await workDialog.getByRole('button', { name: '가져오기', exact: true }).click()
  await roster.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors[0].moving)
  assert.equal((await status(roster)).actors[0].target, 'dispense')
  const task = roster.locator('.roster li').first().locator('.roster-task')
  await task.getByText('조제 중', { exact: true }).waitFor()
  assert.equal(await task.locator('.roster-placement').count(), 0)
  await tick(roster, 15_000)
  loaded = await status(roster)
  assert.equal(loaded.actors[0].activity, 'dispense')
  assert.equal(loaded.actors[0].zone, '조제')
  assert.equal(loaded.actors[1].activity, 'dayoff')
  assert.equal(loaded.actors[2].activity, 'before')
  await roster.waitForTimeout(320)
  await roster.screenshot({ path: output + 'work-board.png' })
  await checkLayout(roster)

  await roster.reload()
  await roster.waitForFunction(() => window.render_game_to_text &&
    JSON.parse(window.render_game_to_text()).actors[0]?.activity === 'dispense')
  assert.equal((await status(roster)).actors[0].sprite, 'staff-14')
  await roster.getByRole('button', { name: '일시정지' }).click()
  await roster.clock.setFixedTime(new Date('2026-11-24T01:15:00Z'))
  await roster.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors[0].activity === 'unknown')
  assert.equal((await status(roster)).minute, 615)
  assert.equal(await roster.locator('.working-count strong').textContent(), '1명')
  await roster.getByRole('button', { name: '재생' }).click()
 
  await roster.clock.setFixedTime(new Date('2026-11-24T03:01:00Z'))
  await roster.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 721)
  assert.equal(await roster.locator('.working-count strong').textContent(), '2명')
  await roster.reload()
  await roster.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'connected')
  assert.equal((await status(roster)).minute, 721)
  await roster.clock.setFixedTime(new Date('2026-11-25T01:00:00Z'))
  await roster.waitForFunction(() => window.render_game_to_text &&
    JSON.parse(window.render_game_to_text()).actors.find(actor => actor.name === '박별')?.duty === 'working')
  loaded = await status(roster)
  assert.equal(loaded.actors.find(actor => actor.name === '김한나').duty, 'unconfirmed')
  assert.equal(loaded.actors.find(actor => actor.name === '박별').activity, 'counsel')
  await openWork.click()
  await workDialog.getByRole('button', { name: '업무 파일 지우기' }).click()
  await roster.waitForFunction(() => JSON.parse(window.render_game_to_text()).actors.find(actor => actor.name === '박별')?.activity === 'unknown')
  assert.equal(await roster.evaluate(() => localStorage.getItem('pharmacy-cctv:work:v1')), null)

  await roster.getByRole('button', { name: '박별 상태 옮기기', exact: true }).press('Enter')
  await roster.getByRole('button', { name: '박별 · 오늘은 휴무!', exact: true }).click()
  assert.equal((await status(roster)).actors.find(actor => actor.name === '박별').duty, 'off')
  assert.equal(await roster.locator('.working-count strong').textContent(), '0명')
  await roster.reload()
  await roster.waitForFunction(() => window.render_game_to_text &&
    JSON.parse(window.render_game_to_text()).actors.find(actor => actor.name === '박별')?.duty === 'off')
  await roster.getByRole('button', { name: '휴무 별장, 쉬는 직원 1명' }).click()
  await roster.getByRole('button', { name: '박별 약국으로 옮기기' }).press('Enter')
  await roster.getByRole('button', { name: '박별 · 계산 중', exact: true }).press('Enter')
  assert.equal((await status(roster)).actors.find(actor => actor.name === '박별').duty, 'working')
  assert.equal(await roster.locator('.working-count strong').textContent(), '1명')

  await roster.getByRole('button', { name: /근무표 관리/ }).click()
  await roster.getByRole('dialog', { name: '근무표 관리' }).getByRole('button', { name: '시뮬레이션으로 돌아가기' }).click()
  await roster.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'simulation')
  assert.equal(await roster.locator('.working-count strong').textContent(), '14명')
  assert.equal((await status(roster)).actors.some(actor => actor.note), false)
  await roster.getByRole('button', { name: /근무 인원 설정/ }).click()
  await roster.getByRole('button', { name: '근무표 가져오기', exact: true }).click()
  await sheet.fill('이름\t출근\t퇴근\t상태\n한여름\t09:00\t18:00\t\n고하늘\t\t\t휴무')
  await applyRoster.click()
  await roster.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'connected')
  assert.deepEqual((await status(roster)).actors.map(actor => [actor.name, actor.duty]), [['한여름', 'working'], ['고하늘', 'off']])
  await roster.close()

  const mobile = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await checkLayout(mobile)
  assert.equal(await mobile.locator('canvas').evaluate(node => node.getBoundingClientRect().width), await mobile.locator('.scene').evaluate(node => node.getBoundingClientRect().width))
  assert.equal(await mobile.locator('.roster li:visible').count(), 16)
  assert.equal(await mobile.getByText('오늘은 휴무!', { exact: true }).last().isVisible(), true)
  await mobile.waitForTimeout(360)
  await mobile.screenshot({ path: output + 'mobile.png', fullPage: true })
  await mobile.getByRole('button', { name: /근무 인원 설정/ }).click()
  assert.equal(await mobile.getByRole('dialog').getByRole('checkbox').count(), 16)
  const fits = await mobile.getByRole('dialog').evaluate(node => {
    const rect = node.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
  })
  assert.ok(fits, 'Staffing dialog should fit on a mobile screen.')
  await mobile.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click()
  await mobile.getByRole('button', { name: '직원 이름·캐릭터 설정', exact: true }).click()
  const mobileAppearance = mobile.getByRole('dialog', { name: '직원 이름·캐릭터 설정' })
  assert.equal(await mobileAppearance.getByRole('radio').count(), 19)
  const appearanceFits = await mobileAppearance.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
  })
  assert.ok(appearanceFits, 'Appearance settings should fit on a mobile screen.')
  await mobileAppearance.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await mobile.screenshot({ path: output + 'appearance-mobile.png', fullPage: true })
  await mobileAppearance.getByRole('button', { name: '닫기', exact: true }).click()
  await mobile.getByRole('button', { name: '전달 메모', exact: true }).click()
  const mobileNote = mobile.getByRole('dialog', { name: '전달 메모' })
  assert.ok(await mobileNote.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
  }))
  await mobile.close()

  const wide = await open({ width: 1920, height: 1080 })
  await checkLayout(wide)
  await wide.setViewportSize({ width: 1366, height: 768 })
  await checkLayout(wide)
  await wide.setViewportSize({ width: 2560, height: 1440 })
  await checkLayout(wide)
  await wide.close()

  await checkBreeze()
  await checkFixtureEffects()
  await checkRoomLighting()
  await checkZoneSigns()
  await checkCalendarRoster()
  await checkInternalFeed()

  if (duration > 0) {
    const endurance = await open({ width: 1440, height: 900 })
    const performance = await endurance.evaluate(async length => {
      const started = performance.now()
      const initial = JSON.parse(window.render_game_to_text())
      const samples = []
      let previous = started
      let peakNodes = 0
      let lastCount = started
      await new Promise(resolve => {
        function measure(now) {
          samples.push(now - previous)
          previous = now
          if (now - lastCount > 1000) {
            peakNodes = Math.max(peakNodes, document.getElementsByTagName('*').length)
            lastCount = now
          }
          if (now - started >= length) resolve()
          else requestAnimationFrame(measure)
        }
        requestAnimationFrame(measure)
      })
      samples.sort((a, b) => a - b)
      const end = JSON.parse(window.render_game_to_text())
      return {
        seconds: Math.round((previous - started) / 1000),
        frames: samples.length,
        p95Milliseconds: Number(samples[Math.floor(samples.length * .95)].toFixed(1)),
        simulatedMinutes: end.minute - initial.minute,
        peakNodes,
        endNodes: document.getElementsByTagName('*').length,
      }
    }, duration)
    console.log('Endurance', JSON.stringify(performance))
    assert.ok(performance.simulatedMinutes >= Math.floor(duration / 5000) - 1)
    assert.ok(performance.p95Milliseconds < 60)
    assert.equal(performance.peakNodes, performance.endNodes)
    await checkLayout(endurance)
    await endurance.close()
  }

  assert.deepEqual(errors, [])
  console.log('Browser verified: offline, pause and resume, native fullscreen, sixteen staff, placement and autonomous walks, file placement persistence, saved staffing selection, display names, nineteen character choices, avatars, notes, local CSV and calendar rosters, verified work, internal feed polling, pet bubbles, staff personalities, pastry stand, artwork, routing, and five viewport sizes.')
} finally {
  await browser.close()
}
