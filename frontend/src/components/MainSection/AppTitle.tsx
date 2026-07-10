import "animate.css"

export default function AppTitle({
    title,
    className = "mb-4 flex items-center gap-2",
    onClick,
}: {
    title: string;
    className?: string;
    // When provided the logo/title acts as a home link (standard web practice).
    onClick?: () => void;
}): React.ReactElement {
    const interactiveProps = onClick
        ? {
              onClick,
              role: "button" as const,
              tabIndex: 0,
              "aria-label": "回首頁",
              onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") onClick();
              },
          }
        : {};
    return (
        <div className={`${className}${onClick ? " cursor-pointer" : ""}`} {...interactiveProps}>
            <img src="/logo.webp" alt="句句通logo" className="h-8 w-8 shrink-0" />
            <h1 className="app-title-heading text-2xl font-semibold text-(--accent) animate__animated animate__lightSpeedInRight">
                {title}
            </h1>
        </div>
    )
}
