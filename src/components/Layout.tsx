import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

// Routes rendered full-screen without the site header/footer.
const BARE_ROUTES = new Set(["/mypage", "/signup"]);

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const bare = BARE_ROUTES.has(pathname) || pathname.startsWith("/admin");

  if (bare) {
    return <div className="app app--bare">{children}</div>;
  }

  return (
    <div className="app">
      <Header />
      <main className="page">{children}</main>
      <Footer />
    </div>
  );
}
