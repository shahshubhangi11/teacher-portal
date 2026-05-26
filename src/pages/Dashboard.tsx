import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Users, CalendarDays, CreditCard, FileText, Plus, Clock, BookOpen } from 'lucide-react'
import { useStudents } from '../hooks/useStudents'
import { useSessions } from '../hooks/useSessions'
import { useBilling } from '../hooks/useBilling'
import { useNotes } from '../hooks/useNotes'
import { useAuth } from '../contexts/AuthContext'
import { Badge, boardColor } from '../components/ui/Badge'

export default function Dashboard() {
  const { user } = useAuth()
  const { students } = useStudents()
  const { sessions } = useSessions()
  const { records, totalPending } = useBilling()
  const { notes } = useNotes()
  const navigate = useNavigate()

  const today = format(new Date(), 'yyyy-MM-dd')
  const todaySessions = useMemo(() => sessions.filter((s) => s.date === today), [sessions, today])
  const recentNotes = useMemo(() => notes.slice(0, 5), [notes])
  const activeStudents = students.filter((s) => s.active)
  const thisMonthEarned = useMemo(() => {
    const month = format(new Date(), 'yyyy-MM')
    return records
      .filter((r) => r.paid && (r.month === month || (r.createdAt?.toDate?.()?.toISOString?.()?.startsWith(month))))
      .reduce((s, r) => s + r.amount, 0)
  }, [records])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const name = user?.displayName?.split(' ')[0] ?? 'Teacher'

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          {greeting()}, {name} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          icon={<Users size={20} className="text-indigo-600" />}
          label="Active Students"
          value={String(activeStudents.length)}
          bg="bg-indigo-50"
          onClick={() => navigate('/students')}
        />
        <StatCard
          icon={<CalendarDays size={20} className="text-emerald-600" />}
          label="Today's Classes"
          value={String(todaySessions.length)}
          bg="bg-emerald-50"
          onClick={() => navigate('/schedule')}
        />
        <StatCard
          icon={<CreditCard size={20} className="text-amber-600" />}
          label="Pending Payment"
          value={`₹${totalPending.toLocaleString()}`}
          bg="bg-amber-50"
          onClick={() => navigate('/billing')}
        />
        <StatCard
          icon={<CreditCard size={20} className="text-blue-600" />}
          label="Earned This Month"
          value={`₹${thisMonthEarned.toLocaleString()}`}
          bg="bg-blue-50"
          onClick={() => navigate('/billing')}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Today's Schedule */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CalendarDays size={16} className="text-indigo-600" />
              Today's Classes
            </h2>
            <button
              onClick={() => navigate('/schedule')}
              className="text-indigo-600 text-xs font-medium hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {todaySessions.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No classes scheduled today</p>
              <button
                onClick={() => navigate('/schedule')}
                className="mt-3 btn-primary btn btn-sm"
              >
                Schedule a class
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                     onClick={() => navigate('/schedule')}>
                  <div className="text-center min-w-[48px]">
                    <div className="text-xs font-semibold text-slate-900">{s.startTime}</div>
                    <div className="text-xs text-slate-400">{s.endTime}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{s.studentName}</div>
                    <div className="text-xs text-slate-500">{s.subject}</div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Notes */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" />
              Recent Notes
            </h2>
            <button
              onClick={() => navigate('/notes')}
              className="text-indigo-600 text-xs font-medium hover:text-indigo-700 flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {recentNotes.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No notes yet</p>
              <button onClick={() => navigate('/notes')} className="mt-3 btn-primary btn btn-sm">
                Write a note
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentNotes.map((n) => (
                <div key={n.id} className="p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                     onClick={() => navigate('/notes')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900">{n.studentName}</span>
                    <span className="text-xs text-slate-400">{n.date}</span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 sm:mt-6">
        <h2 className="font-semibold text-slate-900 mb-3 text-sm">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Add Student',  icon: Users,       to: '/students', color: 'text-indigo-600 bg-indigo-50' },
            { label: 'New Session',  icon: CalendarDays, to: '/schedule', color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Write Note',   icon: FileText,    to: '/notes',    color: 'text-amber-600 bg-amber-50' },
            { label: 'Add Content',  icon: BookOpen,    to: '/content',  color: 'text-purple-600 bg-purple-50' },
          ].map(({ label, icon: Icon, to, color }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={18} />
              </div>
              <span className="text-xs font-medium text-slate-700">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, bg, onClick }: {
  icon: React.ReactNode; label: string; value: string; bg: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="card p-4 text-left hover:shadow-md transition-shadow w-full">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>{icon}</div>
      <div className="text-lg sm:text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    scheduled: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-700',
  } as Record<string, string>
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
