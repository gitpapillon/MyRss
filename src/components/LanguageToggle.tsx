"use client";

export default function LanguageToggle({
  ko,
  onChange,
  busy,
}: {
  ko: boolean;
  onChange: (ko: boolean) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!ko)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        ko
          ? "border-blue-500 bg-blue-500 text-white hover:bg-blue-600"
          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
      aria-pressed={ko}
    >
      {busy && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {ko ? "한국어로 보기" : "원문으로 보기"}
    </button>
  );
}
