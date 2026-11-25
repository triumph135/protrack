'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { cadenceSummary, formatSendHour, type ScheduleFrequency } from '@/lib/reports/schedule'

const selectClass = 'h-11 w-full rounded-lg border border-input bg-card px-2 text-sm'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface ScheduleFormState {
  name: string
  frequency: ScheduleFrequency
  weekday: number
  monthDay: number
  sendHour: number
  formats: string[]
  recipientIds: string[]
}

export function ScheduleWizard({
  form,
  setForm,
  timezone,
  users,
  times,
  saving,
  editing,
  onSubmit,
}: {
  form: ScheduleFormState
  setForm: (next: ScheduleFormState) => void
  timezone: string
  users: Array<{ id: string; name: string; email: string }>
  times: string[]
  saving?: boolean
  editing?: boolean
  onSubmit: () => void
}) {
  const [step, setStep] = useState(1)
  const [query, setQuery] = useState('')
  const summary = cadenceSummary({ ...form, timezone })
  const people = users.filter((person) => {
    const haystack = `${person.name} ${person.email}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      <ol className="flex gap-2 text-xs text-muted-foreground">
        {['When', 'Who', 'Format'].map((label, index) => (
          <li key={label} className={step === index + 1 ? 'font-semibold text-foreground' : ''}>{index + 1}. {label}</li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="space-y-3">
          <Field label="Name" htmlFor="sched-name">
            <Input id="sched-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="How often" htmlFor="sched-freq">
            <select id="sched-freq" className={selectClass} value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value as ScheduleFrequency })}>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </Field>
          {form.frequency === 'weekly' ? (
            <Field label="Day" htmlFor="sched-day">
              <select id="sched-day" className={selectClass} value={form.weekday} onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })}>
                {WEEKDAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}
              </select>
            </Field>
          ) : null}
          {form.frequency === 'monthly' ? (
            <Field label="Day of month" htmlFor="sched-dom">
              <Input id="sched-dom" type="number" min={1} max={31} value={form.monthDay} onChange={(event) => setForm({ ...form, monthDay: Number(event.target.value) })} />
            </Field>
          ) : null}
          <Field label="Time" htmlFor="sched-hour">
            <select id="sched-hour" className={selectClass} value={form.sendHour} onChange={(event) => setForm({ ...form, sendHour: Number(event.target.value) })}>
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>{formatSendHour(hour)}</option>
              ))}
            </select>
          </Field>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">{summary}</p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <Field label="Find a person" htmlFor="sched-search">
            <Input id="sched-search" value={query} placeholder="Name or email" onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {people.length === 0 ? <p className="text-sm text-muted-foreground">No matching people.</p> : people.map((person) => (
              <label key={person.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  checked={form.recipientIds.includes(person.id)}
                  onChange={(event) => {
                    const recipientIds = event.target.checked
                      ? [...form.recipientIds, person.id]
                      : form.recipientIds.filter((id) => id !== person.id)
                    setForm({ ...form, recipientIds })
                  }}
                />
                <span>{person.name} <span className="text-muted-foreground">· {person.email}</span></span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{form.recipientIds.length} selected</p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Files</legend>
            {(['pdf', 'csv', 'xlsx'] as const).map((format) => (
              <label key={format} className="mr-3 text-sm">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={form.formats.includes(format)}
                  onChange={(event) => {
                    const formats = event.target.checked ? [...form.formats, format] : form.formats.filter((item) => item !== format)
                    setForm({ ...form, formats })
                  }}
                />
                {format === 'xlsx' ? 'Excel' : format.toUpperCase()}
              </label>
            ))}
          </fieldset>
          <p className="text-sm">{summary}</p>
          <div>
            <p className="text-sm font-medium">Next 3 sends</p>
            {times.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">The next send times appear here.</p> : (
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {times.map((time) => <li key={time}>{new Date(time).toLocaleString(undefined, { timeZone: timezone })}</li>)}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {step > 1 ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Back</Button> : null}
        {step < 3 ? (
          <Button type="button" onClick={() => setStep(step + 1)} disabled={step === 2 && form.recipientIds.length === 0}>Next</Button>
        ) : (
          <Button type="button" onClick={onSubmit} disabled={saving || form.formats.length === 0 || form.recipientIds.length === 0}>{editing ? 'Save schedule' : 'Create schedule'}</Button>
        )}
      </div>
    </div>
  )
}
