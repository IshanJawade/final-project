import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarCheck2, LayoutDashboard, ShieldCheck, Users, ClipboardList } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Role, UserProfile } from '../types';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

const navItems: NavItem[] = [
  { to: '/', label: 'Command Center', icon: LayoutDashboard },
  { to: '/patients', label: 'Patients', icon: Users, roles: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'] },
  { to: '/cases', label: 'Cases', icon: ClipboardList },
  { to: '/appointments', label: 'Appointments', icon: CalendarCheck2 },
  { to: '/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['ADMIN'] }
];

type AppShellProps = {
  children: ReactNode;
  user: UserProfile;
  onLogout: () => Promise<void>;
};

export const AppShell = ({ children, user, onLogout }: AppShellProps) => {
  const allowedNav = navItems.filter((item) => !item.roles || item.roles.includes(user.role));

  const handleLogout = () => {
    void onLogout();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">MRS Command</div>
        <nav>
          {allowedNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={item.to === '/'}>
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div>
          <div className="status-pill" style={{ justifyContent: 'center' }}>
            <span className="dot" style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent-strong)' }} />
            Systems nominal
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="top-bar">
          <div className="search-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.65" y1="16.65" x2="21" y2="21" />
            </svg>
            <input placeholder="Search MRNs, cases, or staff" />
          </div>
          <div className="action-tray">
            <div className="user-chip">
              <div>
                <strong>{user.first_name} {user.last_name}</strong>
                <div className="user-role">{user.role}</div>
              </div>
            </div>
            <ThemeToggle />
            <button className="logout-button" type="button" onClick={handleLogout}>
              Sign out
            </button>
            <div className="status-pill">SOC2</div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};
