import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarDays, CreditCard,
  FileText, BookOpen, BarChart2, LogOut, GraduationCap, Sparkles,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const nav = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/students',  icon: Users,           label: 'Students'   },
  { to: '/schedule',  icon: CalendarDays,    label: 'Schedule'   },
  { to: '/billing',   icon: CreditCard,      label: 'Billing'    },
  { to: '/notes',     icon: FileText,        label: 'Notes'      },
  { to: '/content',   icon: BookOpen,        label: 'Content'    },
  { to: '/reports',   icon: BarChart2,       label: 'Reports'    },
  { to: '/ai',        icon: Sparkles,        label: 'AI Tools',  highlight: true },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  return (
    <aside className="flex flex-col h-full bg-slate-900 w-64">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <GraduationCap size={18} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-sm leading-none">TeachDesk</div>
          <div className="text-slate-500 text-xs mt-0.5">Teaching Portal</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label, highlight }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''} ${highlight && !false ? 'text-purple-300 hover:text-white' : ''}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
            {highlight && (
              <span className="ml-auto text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full font-medium">AI</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Sign out */}
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {user?.displayName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? 'T'}
          </div>
          <div className="min-w-0">
            <div className="text-white text-xs font-medium truncate">{user?.displayName ?? 'Teacher'}</div>
            <div className="text-slate-500 text-xs truncate">{user?.email}</div>
          </div>
        </div>
        <button onClick={handleSignOut} className="nav-link w-full text-left">
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
