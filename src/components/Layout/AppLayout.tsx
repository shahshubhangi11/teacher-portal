import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useLocation, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarDays, CreditCard,
  FileText, BookOpen, BarChart2,
} from 'lucide-react'

const mobileNav = [
  { to: '/',         icon: LayoutDashboard, label: 'Home'     },
  { to: '/students', icon: Users,           label: 'Students' },
  { to: '/schedule', icon: CalendarDays,    label: 'Schedule' },
  { to: '/billing',  icon: CreditCard,      label: 'Billing'  },
  { to: '/content',  icon: BookOpen,        label: 'Content'  },
]

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 z-50">
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
            TeachDesk
          </div>
          <div className="w-8" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        <nav className="lg:hidden flex border-t border-slate-200 bg-white flex-shrink-0">
          {mobileNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors
                ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-700'}`
              }
            >
              <Icon size={20} className="mb-0.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
