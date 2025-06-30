/**
 * Date utility functions to handle dates consistently without timezone conversion issues
 */

/**
 * Get today's date as a local date string in YYYY-MM-DD format
 * This ensures the date represents the actual local date
 */
export function getTodayLocalDateString(): string {
  const today = new Date()
  return formatDateToLocalString(today)
}

/**
 * Format a Date object to YYYY-MM-DD string using local timezone
 */
export function formatDateToLocalString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date without timezone conversion
 * This prevents the common issue where "2024-01-15" becomes yesterday when parsed as UTC
 */
export function parseLocalDateString(dateString: string): Date {
  if (!dateString) return new Date()
  
  const [year, month, day] = dateString.split('-').map(Number)
  // Create date in local timezone (month is 0-indexed)
  return new Date(year, month - 1, day)
}

/**
 * Format a date string for display, treating it as a local date
 * This prevents timezone conversion that can make dates appear off by one day
 */
export function formatLocalDateForDisplay(dateString: string): string {
  if (!dateString) return ''
  
  const localDate = parseLocalDateString(dateString)
  return localDate.toLocaleDateString()
}

/**
 * Get a date string suitable for HTML date input, treating source as local date
 */
export function formatLocalDateForInput(dateString: string): string {
  if (!dateString) return ''
  
  const localDate = parseLocalDateString(dateString)
  return formatDateToLocalString(localDate)
} 