'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/src/lib/utils';

const NAV_ITEMS = [
  { label: 'Overview',  href: '/',          icon: '⬛' },
  { label: 'Units',     href: '/units',      icon: '🏢' },
  { label: 'Banking',   href: '/banking',    icon: '📊' },
  { label: 'Notices',   href: '/notices',    icon: '📋' },
  { label: 'Comps',     href: '/comps',      icon: '🔍' },
];

const BOTTOM_NAV = [
  { label: 'Import',    href: '/import',     icon: '📤' },
  { label: 'Settings',  href: '/settings',   icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive(href)
            ? 'bg-blue-600 text-white'
            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
        )}
      >
        <span className="text-base leading-none">{icon}</span>
        {label}
      </Link>
    );
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">MoCo</p>
        <p className="text-white font-bold text-base leading-tight mt-0.5">Rent Optimizer</p>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-3 space-y-1 border-t border-slate-700 pt-3">
        {BOTTOM_NAV.map(item => (
          <NavLink key={item.href} {...item} />
        ))}
        <div className="pt-3 flex items-center gap-2 px-3">
          <UserButton afterSignOutUrl="/sign-in" />
          <span className="text-slate-400 text-xs">Account</span>
        </div>
      </div>
    </aside>
  );
}
