export function TrailerIcon({ className = "w-4 h-4" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <rect width="20" height="15" x="2" y="4.5" rx="2.5" />
            <path d="M5.5 7.5v.01M5.5 12v.01M5.5 16.5v.01M18.5 7.5v.01M18.5 12v.01M18.5 16.5v.01" strokeWidth="2.5" />
            <polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none" />
        </svg>
    );
}

export default TrailerIcon;
