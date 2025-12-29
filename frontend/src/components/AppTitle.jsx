import "animate.css"

export default function AppTitle({title}) {
    return (
        <h1 className="mb-1 text-4xl animate__animated animate__lightSpeedInRight">
            {title}
        </h1>
    )
}
