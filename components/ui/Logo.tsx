import React from 'react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export default function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-12',
    xl: 'h-16'
  }

  return (
    <svg 
      className={`${sizeClasses[size]} ${className}`}
      viewBox="0 0 190 50" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ProTrack Text */}
      <text 
        x="95" 
        y="32" 
        fill="#1F2937" 
        fontSize="26" 
        fontWeight="700" 
        fontFamily="Inter, system-ui, sans-serif"
        textAnchor="middle"
      >
        ProTrack
      </text>
      
      {/* Left side chart bars */}
      <rect x="15" y="28" width="4" height="12" fill="#EF4444" rx="2"/>
      <rect x="22" y="22" width="4" height="18" fill="#F59E0B" rx="2"/>
      <rect x="29" y="18" width="4" height="22" fill="#10B981" rx="2"/>
      
      {/* Right side chart bars */}
      <rect x="157" y="25" width="4" height="15" fill="#3B82F6" rx="2"/>
      <rect x="164" y="20" width="4" height="20" fill="#8B5CF6" rx="2"/>
      <rect x="171" y="15" width="4" height="25" fill="#06B6D4" rx="2"/>
      
      {/* Connecting dotted line */}
      <path d="M35 25 L155 25" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2,2"/>
    </svg>
  )
}