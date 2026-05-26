interface BadgeProps {
  label: string
  color?: 'indigo' | 'green' | 'amber' | 'red' | 'slate' | 'purple' | 'blue' | 'teal'
}

const colors = {
  indigo: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  green:  'bg-green-50  text-green-700  ring-1 ring-green-200',
  amber:  'bg-amber-50  text-amber-700  ring-1 ring-amber-200',
  red:    'bg-red-50    text-red-700    ring-1 ring-red-200',
  slate:  'bg-slate-100 text-slate-600  ring-1 ring-slate-200',
  purple: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  blue:   'bg-blue-50   text-blue-700   ring-1 ring-blue-200',
  teal:   'bg-teal-50   text-teal-700   ring-1 ring-teal-200',
}

export function Badge({ label, color = 'slate' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {label}
    </span>
  )
}

export function boardColor(board: string): BadgeProps['color'] {
  return board === 'CBSE' ? 'indigo' : board === 'ICSE' ? 'purple' : board === 'State' ? 'teal' : 'slate'
}
