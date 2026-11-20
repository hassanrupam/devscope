/** Soft aurora + faint grid behind every page, matching the report and analytics pages. */
export function PageBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(148 163 184 / 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.12) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, black 30%, transparent 75%)',
        }}
      />
      <div className="r-aurora absolute left-1/2 top-[-6rem] size-[34rem] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl dark:bg-indigo-500/20" />
      <div className="r-aurora absolute left-[8%] top-40 size-80 rounded-full bg-cyan-400/10 blur-3xl [animation-delay:-6s]" />
      <div className="r-aurora absolute right-[8%] top-24 size-72 rounded-full bg-fuchsia-500/10 blur-3xl [animation-delay:-11s]" />
    </div>
  )
}
