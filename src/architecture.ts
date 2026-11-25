import type { Point } from './layout.ts'

type Context = CanvasRenderingContext2D

export function smoothstep(from: number, to: number, value: number) {
  const fraction = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return fraction * fraction * (3 - 2 * fraction)
}

export function polygon(g: Context, points: readonly Point[], color: string | CanvasGradient, stroke?: string, width = 1) {
  g.beginPath()
  g.moveTo(points[0].x, points[0].y)
  for (const { x, y } of points.slice(1)) g.lineTo(x, y)
  g.closePath()
  g.fillStyle = color
  g.fill()
  if (stroke) {
    g.strokeStyle = stroke
    g.lineWidth = width
    g.stroke()
  }
}

export function strokeLine(g: Context, color: string, width: number, ...points: Point[]) {
  g.beginPath()
  g.moveTo(points[0].x, points[0].y)
  for (const { x, y } of points.slice(1)) g.lineTo(x, y)
  g.strokeStyle = color
  g.lineWidth = width
  g.stroke()
}

export function ellipse(g: Context, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient, tilt = 0) {
  g.beginPath()
  g.ellipse(x, y, rx, ry, tilt, 0, 2 * Math.PI)
  g.fillStyle = color
  g.fill()
}

export function round(g: Context, x: number, y: number, w: number, h: number, radius: number, fill: string | CanvasGradient, stroke?: string) {
  g.beginPath()
  g.roundRect(x, y, w, h, radius)
  g.fillStyle = fill
  g.fill()
  if (stroke) {
    g.lineWidth = 1
    g.strokeStyle = stroke
    g.stroke()
  }
}

export function gradient(g: Context, x0: number, y0: number, x1: number, y1: number, start: string, end: string) {
  const result = g.createLinearGradient(x0, y0, x1, y1)
  result.addColorStop(0, start)
  result.addColorStop(1, end)
  return result
}
