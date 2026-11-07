import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import Seminars from "./pages/Seminars";
import SeminarDetail from "./pages/SeminarDetail";
import MyPage from "./pages/MyPage";
import Signup from "./pages/Signup";
import Terms from "./pages/Terms";
import Team from "./pages/Team";
import About from "./pages/About";
import Placeholder from "./pages/Placeholder";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminBoards from "./pages/admin/AdminBoards";
import AdminSeminars from "./pages/admin/AdminSeminars";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminMembers from "./pages/admin/AdminMembers";
import { primaryNav, footerColumns, legalLinks } from "./data/navigation";

// ARCHI Agent Studio (ported from inshow_agent): large, so it is code-split.
const StudioApp = lazy(() => import("./archi/StudioApp"));

// Routes that have a real page implementation (skip them in the placeholder map).
const implemented = new Set(["/", "/about", "/cases", "/seminars", "/mypage", "/signup", "/terms", "/about/organization"]);

// Build a label lookup for every remaining routed path.
const routeLabels = new Map<string, string>();
for (const item of primaryNav) routeLabels.set(item.to, item.label);
for (const col of footerColumns)
  for (const link of col.links) routeLabels.set(link.to, link.label);
for (const link of legalLinks) routeLabels.set(link.to, link.label);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <Layout>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/seminars" element={<Seminars />} />
        <Route path="/seminars/:id" element={<SeminarDetail />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/about" element={<About />} />
        <Route path="/about/organization" element={<Team />} />
        <Route
          path="/agent-studio/*"
          element={
            <Suspense fallback={null}>
              <StudioApp />
            </Suspense>
          }
        />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="agent" element={<Navigate to="/agent-studio" replace />} />
          <Route path="boards" element={<AdminBoards />} />
          <Route path="seminars" element={<AdminSeminars />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="members" element={<AdminMembers />} />
        </Route>
        {[...routeLabels]
          .filter(([path]) => !implemented.has(path))
          .map(([path, label]) => (
            <Route
              key={path}
              path={path}
              element={<Placeholder title={label} />}
            />
          ))}
        <Route path="*" element={<Placeholder title="페이지를 찾을 수 없습니다" />} />
      </Routes>
    </Layout>
  );
}
