import "animate.css"

export default function AppTitle({ title }: { title: string }): React.ReactElement {
    return (
        <div className="mb-4">
            <h1 className="mb-1 text-4xl animate__animated animate__lightSpeedInRight">
                {title}
            </h1>
        </div>
    )
}
