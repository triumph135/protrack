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
    <section className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="h-56 w-full min-w-0">
        {children}
      </div>
    </section>
  )
}

const axis = { stroke: '#a1a1aa', fontSize: 12, tickLine: false, axisLine: false }
const tooltipStyle = { background: '#16181d', border: '1px solid #2a2d34', borderRadius: 8, color: '#f4f4f5' }

function Bars({ points }: { points: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="#2a2d34" vertical={false} />
        <XAxis dataKey="label" {...axis} interval={0} angle={points.length > 4 ? -25 : 0} height={points.length > 4 ? 56 : 32} textAnchor={points.length > 4 ? 'end' : 'middle'} />
        <YAxis {...axis} tickFormatter={moneyTick} width={56} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="value" fill="#60a5fa" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function LineOverTime({ points }: { points: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="#2a2d34" vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} tickFormatter={moneyTick} width={56} />
        <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
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
