import { LucideIcon } from 'lucide-react';
import React from 'react';

export function EmptyState({ icon: Icon, title, subtitle, action }: {
  icon: LucideIcon; title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-12 h-12 text-slate-300 mb-4" />
      <h3 className="text-sm font-semibold text-slate-500 font-sora">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-1 max-w-xs">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
