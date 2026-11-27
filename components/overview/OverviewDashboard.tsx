import { Fragment } from 'react'
import Link from 'next/link'
import { CategoryName } from '@/components/costs/CategoryName'
import { formatCurrency, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'

export interface OverviewGroup {
  id: string
  name: string
  actual: number
  budget: number
  href?: string
  children: Array<{ id: string; name: string; actual: number; budget: number; href?: string }>
}

export interface OverviewActivity {
  id: string
  primary: string
  secondary: string
  amount: string
  href?: string
}

export interface OverviewProjectRow {
  id: string
  jobNumber: string
  jobName: string
  budget: number
  cost: number
  invoiced: number
  profit: number
  margin: number | null
  spent: number | null
}

export interface OverviewDashboardProps {
  contract: number
  baseContract: number
  changeOrderTotal: number
  totalCosts: number
  totalBudget: number
  invoiced: number
  collected: number
  profit: number
  margin: number | null
  goal: number | null
  alerts: Array<{ id: string; name: string; actual: number; budget: number; state: 'over' | 'near'; href?: string }>
  groups: OverviewGroup[]
  burn: Array<{ month: string; cumulative: number }>
  invoiceBurn: Array<{ month: string; cumulative: number }>
  recentCosts: OverviewActivity[]
  recentInvoices: OverviewActivity[]
  recentOrders: OverviewActivity[]
  projects?: OverviewProjectRow[]
  onOpenProject?: (id: string) => void
  costsHref?: string
  invoicesHref?: string
  accent?: boolean
}

export function OverviewDashboard({
  contract,
  baseContract,
  changeOrderTotal,
  totalCosts,
  totalBudget,
  invoiced,
  collected,
  profit,
  margin,
  goal,
  alerts,
  groups,
  burn,
  invoiceBurn,
  recentCosts,
  recentInvoices,
  recentOrders,
  projects,
  onOpenProject,
  costsHref,
  invoicesHref,
  accent = false,
}: OverviewDashboardProps) {
  const marginText = margin == null ? 'Invoiced minus cost' : `Invoiced minus cost · ${formatPercent(margin)}${goal == null ? '' : ` · goal ${formatPercent(goal)}`}`
  const tone = margin == null ? undefined : goal != null && margin < goal ? 'bad' as const : profit >= 0 ? 'good' as const : 'bad' as const
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric accent={accent} label="Contract" value={formatCurrency(contract)} detail={`${formatCurrency(baseContract)} base · ${formatCurrency(changeOrderTotal)} change orders`} />
        <Metric accent={accent} label="Cost to date" value={formatCurrency(totalCosts)} detail={costsHref ? 'Category roll-up is on Costs' : 'Net of reversals, across every project'} href={costsHref} />
        <Metric accent={accent} label="Budget" value={formatCurrency(totalBudget)} detail={`${formatCurrency(totalBudget - totalCosts)} remaining`} href={costsHref} />
        <Metric accent={accent} label="Gross profit" value={formatCurrency(profit)} detail={marginText} tone={tone} />
        <Metric accent={accent} label="Invoiced" value={formatCurrency(invoiced)} detail={`${formatCurrency(contract - invoiced)} of the contract not billed`} href={invoicesHref} />
        <Metric accent={accent} label="Collected" value={formatCurrency(collected)} detail={`${formatCurrency(invoiced - collected)} still outstanding`} href={invoicesHref} />
      </section>

      {alerts.length > 0 ? (
        <section className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <h2 className="text-sm font-medium">Budget alerts</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((alert) => (
              <li key={alert.id}>
                {alert.href ? <Link className="text-primary" href={alert.href as never}>{alert.name}</Link> : <span className="font-medium">{alert.name}</span>}
                {' '}{alert.state === 'over' ? 'is over budget' : 'is nearing its budget'} ({formatCurrency(alert.actual)} of {formatCurrency(alert.budget)}).
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Budget versus actual</h2>
            {costsHref ? <Link href={costsHref as never} className="text-sm text-primary">View in Costs</Link> : <span className="text-xs text-muted-foreground">All projects</span>}
          </div>
          <div className="space-y-3">
            {groups.map((category) => (
              <div key={category.id}>
                <OverviewBar href={category.href} name={category.name} actual={category.actual} budget={category.budget} depth={0} />
                {category.children.length > 0 ? (
                  <div className="ml-6 mt-1 border-l border-muted-foreground/45">
                    {category.children.map((child) => (
                      <OverviewBar key={child.id} href={child.href} name={child.name} actual={child.actual} budget={child.budget} depth={1} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Cost trend</h2>
            <p className="mt-1 text-xs text-muted-foreground">Cumulative cost by month</p>
            <BurnChart points={burn} label="Cumulative cost by month" empty="Costs will draw a trend once they have dates." />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Invoices over time</h2>
            <p className="mt-1 text-xs text-muted-foreground">Cumulative invoiced by month, credit memos included</p>
            <BurnChart points={invoiceBurn} label="Cumulative invoiced by month" empty="Invoices will draw a trend once they have dates." />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-medium">By category</h2>
          <p className="text-xs text-muted-foreground">Parent rows include children.</p>
        </div>
        <table className="responsive-cards w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Budget</th>
              <th className="px-3 py-2 text-right font-medium">Actual</th>
              <th className="px-3 py-2 text-right font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((category) => (
              <Fragment key={category.id}>
                <tr className="border-b border-border">
                  <td className="px-3 py-2" data-label="Category">
                    {category.href ? <Link className="font-medium text-primary" href={category.href as never}>{category.name}</Link> : <span className="font-medium">{category.name}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(category.budget)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(category.actual)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Remaining">{formatCurrency(category.budget - category.actual)}</td>
                </tr>
                {category.children.map((child) => (
                  <tr key={child.id} className="border-b border-border text-[13px] text-muted-foreground">
                    <td className="px-3 py-2" data-label="Category">
                      <CategoryName depth={1}>
                        {child.href ? <Link className="text-muted-foreground hover:text-foreground" href={child.href as never}>{child.name}</Link> : <span>{child.name}</span>}
                      </CategoryName>
                    </td>
                    <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(child.budget)}</td>
                    <td className="px-3 py-2 text-right tabular" data-label="Actual">{formatCurrency(child.actual)}</td>
                    <td className="px-3 py-2 text-right tabular" data-label="Remaining">{formatCurrency(child.budget - child.actual)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Activity title="Latest costs" empty="No costs yet" rows={recentCosts} />
        <Activity title="Latest invoices" empty="No invoices yet" rows={recentInvoices} />
        <Activity title="Change orders" empty="No change orders" rows={recentOrders} />
      </section>

      {projects ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <h2 className="text-sm font-medium">By project</h2>
            <p className="text-xs text-muted-foreground">Open a row for that project&apos;s overview. Totals match Portfolio overview.</p>
          </div>
          <table className="responsive-cards w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                {['Project', 'Budget', 'Cost', 'Invoiced', 'Gross profit', 'Margin', '% of budget'].map((header) => (
                  <th key={header} className={cn('px-3 py-2 font-medium', header === 'Project' ? '' : 'text-right')}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2" data-label="Project">
                    <button type="button" className="text-left font-medium text-primary" onClick={() => onOpenProject?.(row.id)}>
                      {row.jobNumber}
                    </button>
                    <p className="text-muted-foreground">{row.jobName}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular" data-label="Budget">{formatCurrency(row.budget)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Cost">{formatCurrency(row.cost)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Invoiced">{formatCurrency(row.invoiced)}</td>
                  <td className={cn('px-3 py-2 text-right tabular', row.profit < 0 ? 'text-destructive' : 'text-success')} data-label="Gross profit">{formatCurrency(row.profit)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="Margin">{row.margin == null ? '—' : formatPercent(row.margin)}</td>
                  <td className="px-3 py-2 text-right tabular" data-label="% of budget">{row.spent == null ? '—' : formatPercent(row.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  )
}

function OverviewBar({ href, name, actual, budget, depth }: { href?: string; name: string; actual: number; budget: number; depth: number }) {
  const max = Math.max(budget, actual, 1)
  const body = (
    <>
      {depth > 0 ? <span aria-hidden className="absolute left-0 top-1/2 h-px w-3 bg-muted-foreground/45" /> : null}
      <div className={cn('mb-1 flex justify-between gap-3', depth > 0 ? 'pl-3 text-[13px] text-muted-foreground' : 'text-sm')}>
        <span className="min-w-0 truncate">{name}</span>
        <span className="tabular text-muted-foreground">{formatCurrency(actual)} / {budget > 0 ? formatCurrency(budget) : 'No budget'}</span>
      </div>
      <div className={cn('relative overflow-hidden rounded-full bg-muted', depth > 0 ? 'ml-3 h-1.5' : 'h-2')}>
        <div className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${Math.min(100, (budget / max) * 100)}%` }} />
        <div className={cn('absolute inset-y-0 left-0', actual > budget && budget > 0 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, (actual / max) * 100)}%` }} />
      </div>
    </>
  )
  const className = cn('relative block rounded-md py-1', href ? 'hover:bg-muted' : '', depth > 0 ? 'pl-3' : 'px-1')
  if (!href) return <div className={className}>{body}</div>
  return <Link href={href as never} className={className}>{body}</Link>
}

function Metric({ label, value, detail, tone, href, accent }: { label: string; value: string; detail?: string; tone?: 'good' | 'bad'; href?: string; accent?: boolean }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular ${tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : ''}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground tabular">{detail}</p> : null}
    </>
  )
  const className = cn('rounded-lg border border-border bg-card p-4', accent ? 'border-l-2 border-l-primary' : '', href ? 'hover:border-primary' : '')
  if (!href) return <div className={className}>{body}</div>
  return <Link href={href as never} className={className}>{body}</Link>
}

function BurnChart({ points, label, empty }: { points: Array<{ month: string; cumulative: number }>; label: string; empty: string }) {
  if (points.length === 0) return <p className="mt-6 text-sm text-muted-foreground">{empty}</p>
  const max = Math.max(...points.map((point) => point.cumulative), 1)
  const width = 280
  const height = 120
  const step = points.length === 1 ? 0 : width / (points.length - 1)
  const coords = points.map((point, index) => `${index * step},${height - (Math.max(0, point.cumulative) / max) * (height - 8)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height + 20}`} className="mt-3 w-full text-primary" role="img" aria-label={label}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords} />
      {points.map((point, index) => (
        <text key={point.month} x={index * step} y={height + 16} className="fill-muted-foreground" fontSize="10">{point.month.slice(5)}</text>
      ))}
    </svg>
  )
}

function Activity({ title, empty, rows }: { title: string; empty: string; rows: OverviewActivity[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const body = (
              <>
                <span>
                  <span className="block font-medium">{row.primary}</span>
                  <span className="text-xs text-muted-foreground">{row.secondary}</span>
                </span>
                <span className="tabular">{row.amount}</span>
              </>
            )
            return (
              <li key={row.id}>
                {row.href ? (
                  <Link href={row.href as never} className="flex items-start justify-between gap-3 text-sm hover:text-primary">{body}</Link>
                ) : (
                  <div className="flex items-start justify-between gap-3 text-sm">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
