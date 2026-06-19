const statusConfig: Record<string, { label: string; className: string }> = {
  new:       { label: 'New',       className: 'bg-slate-100 text-slate-700' },
  pending:   { label: 'Pending',   className: 'bg-blue-100 text-blue-700' },
  sent:      { label: 'Sent',      className: 'bg-indigo-100 text-indigo-700' },
  follow_up: { label: 'Follow Up', className: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'Approved',  className: 'bg-purple-100 text-purple-700' },
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-700' },
  lost:      { label: 'Lost',      className: 'bg-red-100 text-red-700' },
  completed: { label: 'Completed', className: 'bg-teal-100 text-teal-700' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
