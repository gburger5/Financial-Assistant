import '../../styles/animations.css'
import './Skeleton.css'

interface SkeletonProps {
  width?: string
  height?: string
  className?: string
}

export default function Skeleton({ width = '100%', height = '16px', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
