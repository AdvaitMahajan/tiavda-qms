export const SkeletonRow = () => (
  <div className="flex gap-4 p-4 border-b border-[#CBD5E1]">
    <div className="h-4 bg-slate-200 rounded animate-pulse w-24"/>
    <div className="h-4 bg-slate-200 rounded animate-pulse w-32"/>
    <div className="h-4 bg-slate-200 rounded animate-pulse w-20"/>
    <div className="h-4 bg-slate-200 rounded animate-pulse w-16"/>
    <div className="h-4 bg-slate-200 rounded animate-pulse flex-1"/>
  </div>
);

export const SkeletonCard = () => (
  <div className="bg-white rounded-2xl p-6 border border-[#CBD5E1] animate-pulse">
    <div className="h-8 bg-slate-200 rounded w-16 mb-2"/>
    <div className="h-4 bg-slate-200 rounded w-24"/>
  </div>
);
