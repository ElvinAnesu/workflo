export function HeaderLogo() {
  return (
    <div
      aria-label="Workflo"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#2B7DE9] text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 4.5c-2.2 2.6-3.5 5.1-3.5 7.4 0 2.1 1.6 3.6 3.5 3.6s3.5-1.5 3.5-3.6c0-2.3-1.3-4.8-3.5-7.4Z"
          fill="currentColor"
        />
        <path
          d="M7 16.5c1.4 1.6 3.1 2.5 5 2.5s3.6-.9 5-2.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
