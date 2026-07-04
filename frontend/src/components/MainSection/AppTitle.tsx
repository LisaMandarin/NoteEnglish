import "animate.css"

export default function AppTitle({ title }: { title: string }): React.ReactElement {
    return (
        <div className="mb-4 flex items-center gap-2">
            <img src="/logo.webp" alt="句句通logo" className="h-8 w-8 shrink-0" />
            <h1 className="app-title-heading text-2xl font-semibold text-(--accent) animate__animated animate__lightSpeedInRight">
                {title}
            </h1>
        </div>
    )
}
