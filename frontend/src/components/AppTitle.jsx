import "animate.css"

export default function AppTitle({ title, username }) {
    return (
        <div className="mb-4">
            {username ? (
                <p className="mb-2 text-sm font-semibold tracking-[0.2em] uppercase text-(--accent)">
                    Welcome, {username}
                </p>
            ) : null}
            <h1 className="mb-1 text-4xl animate__animated animate__lightSpeedInRight">
                {title}
            </h1>
        </div>
    )
}
