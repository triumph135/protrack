'use client'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  hover?: boolean
}

export default function Card({ 
  children, 
  className = '', 
  padding = 'md',
  hover = false 
}: CardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }

  return (
    <div 
      className={`
        bg-white 
        border border-gray-200
        rounded-lg shadow-sm
        transition-all duration-200 ease-in-out
        ${hover ? 'hover:shadow-md hover:border-gray-300' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  )
} 