'use client'

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '@/lib/format'
import { reportCharts, type ChartPoint } from '@/lib/reports/charts'

function moneyTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1000)}k`
  return formatCurrency(value)
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border border-t-2 border-t-primary/50 bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="h-56 w-full min-w-0">
        {children}
      </div>
    </section>
  )
}

const axis = { stroke: 'var(--muted-foreground)', fontSize: 12, tickLine: false, axisLine: false }
const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)' }
const grid = 'color-mix(in srgb, var(--primary) 22%, var(--border))'

const frame = { width: '100%' as const, height: '100%' as const, minWidth: 0, initialDimension: { width: 480, height: 224 } }

function Bars({ points }: { points: ChartPoint[] }) {
  return (
    <ResponsiveContainer {...frame}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="label" {...axis} interval={0} angle={points.length > 4 ? -25 : 0} height={points.length > 4 ? 56 : 32} textAnchor={points.length > 4 ? 'end' : 'middle'} />
        <YAxis {...axis} tickFormatter={moneyTick} width={56} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} cursor={{ fill: 'color-mix(in srgb, var(--primary) 8%, transparent)' }} />
        <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function LineOverTime({ points }: { points: ChartPoint[] }) {
  return (
    <ResponsiveContainer {...frame}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} tickFormatter={moneyTick} width={56} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="value" stroke="#93c5fd" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ReportChartRow({ report }: { report: Parameters<typeof reportCharts>[0] }) {
  const charts = reportCharts(report)
  if (!charts.bars && !charts.line) return null
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {charts.bars ? <ChartCard title={charts.bars.title}><Bars points={charts.bars.points} /></ChartCard> : null}
      {charts.line ? <ChartCard title={charts.line.title}><LineOverTime points={charts.line.points} /></ChartCard> : null}
    </div>
  )
}
