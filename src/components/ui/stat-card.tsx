interface StatCardProps {
  detail?: string;
  label: string;
  symbol: string;
  tone?: "brand" | "blue" | "amber" | "neutral";
  value: string | number;
}

const TONES = {
  brand: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  blue: "bg-blue-50 text-blue-800 ring-blue-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-100",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatCard({ detail, label, symbol, tone = "neutral", value }: StatCardProps) {
  return (
    <article className="min-w-0 rounded-[1.125rem] border border-[#dce5df] bg-white p-4 shadow-[0_1px_2px_rgb(18_55_37_/_0.04),0_8px_24px_rgb(18_55_37_/_0.04)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-5 text-slate-600">{label}</p>
        <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ring-1 ${TONES[tone]}`}>
          {symbol}
        </span>
      </div>
      <p className="tabular-data mt-4 break-words text-2xl font-bold text-slate-950 sm:text-[1.7rem]">{value}</p>
      {detail ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </article>
  );
}
