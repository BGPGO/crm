"use client";

interface HeaderProps {
  title: string;
  breadcrumb?: string[];
}

export default function Header({ title, breadcrumb }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-6 flex items-center flex-shrink-0 z-10">
      <div>
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-0.5">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span>/</span>}
                <span>{crumb}</span>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>
    </header>
  );
}
