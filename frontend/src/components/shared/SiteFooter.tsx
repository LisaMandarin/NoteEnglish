export default function SiteFooter({
  className = "mx-auto mt-10 max-w-7xl text-center text-sm text-(--text-main) opacity-75",
}: {
  className?: string;
}): React.ReactElement {
  return (
    <footer className={className}>
      <p className="m-0">© {new Date().getFullYear()} 句句通. All rights reserved.</p>
      <p className="m-0">Created by Min-ting (Lisa) Chuang.</p>
    </footer>
  );
}
