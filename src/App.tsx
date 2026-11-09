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
import Tools from "./pages/Tools";
import Placeholder from "./pages/Placeholder";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminBoards from "./pages/admin/AdminBoards";
import AdminSeminars from "./pages/admin/AdminSeminars";
import AdminCurriculum from "./pages/admin/AdminCurriculum";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminMenus from "./pages/admin/AdminMenus";
import AdminPages from "./pages/admin/AdminPages";
import AdminFloorPlans from "./pages/admin/AdminFloorPlans";
import { menuRouteLabels, useNavigation } from "./lib/navigation";

// ARCHI Agent Studio (ported from inshow_agent): large, so it is code-split.
const Experts = lazy(() => import('./pages/Experts'));
const ExpertChat = lazy(() => import('./pages/ExpertChat'));
const ExpertSettings = lazy(() => import('./pages/ExpertSettings'));
const ExpertWiki = lazy(() => import('./pages/ExpertWiki'));
const ExpertConversations = lazy(() => import('./pages/ExpertConversations'));
const StudioApp = lazy(() => import("./archi/StudioApp"));

// Routes that have a real page implementation (skip them in the placeholder map).
/** Any path without a page: if an admin put it in a menu (/admin/menus), show "준비 중" under that menu name. */
function MenuPlaceholder() {
  const { pathname } = useLocation();
  const { nav } = useNavigation();
  const label = menuRouteLabels(nav).get(pathname.replace(/\/+$/, "") || "/");
  return <Placeholder title={label ?? "페이지를 찾을 수 없습니다"} />;
}

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
        <Route path="/ai" element={<About />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/tools/:id" element={<Tools />} />
        <Route path="/experts" element={<Suspense fallback={null}><Experts/></Suspense>} />
        <Route path="/experts/:personId" element={<Suspense fallback={null}><ExpertChat/></Suspense>} />
        <Route path="/experts/:personId/settings" element={<Suspense fallback={null}><ExpertSettings/></Suspense>} />
        <Route path="/experts/:personId/wiki" element={<Suspense fallback={null}><ExpertWiki/></Suspense>} />
        <Route path="/experts/:personId/conversations" element={<Suspense fallback={null}><ExpertConversations/></Suspense>} />
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
          <Route path="menus" element={<AdminMenus />} />
          <Route path="pages" element={<AdminPages />} />
          <Route path="floorplans" element={<AdminFloorPlans />} />
          <Route path="boards" element={<AdminBoards />} />
          <Route path="seminars" element={<AdminSeminars />} />
          <Route path="curriculum" element={<AdminCurriculum />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="expert-spaces" element={<Navigate to="/experts/interior-show/settings" replace/>} />
          <Route path="members" element={<AdminMembers />} />
        </Route>
        <Route path="*" element={<MenuPlaceholder />} />
      </Routes>
    </Layout>
  );
}
