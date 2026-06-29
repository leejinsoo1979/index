import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import Seminars from "./pages/Seminars";
import SeminarApply from "./pages/SeminarApply";
import MyPage from "./pages/MyPage";
import Placeholder from "./pages/Placeholder";
import { primaryNav, footerColumns, legalLinks } from "./data/navigation";

// Routes that have a real page implementation (skip them in the placeholder map).
const implemented = new Set(["/", "/cases", "/seminars", "/mypage"]);

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
        <Route path="/seminars/:id/apply" element={<SeminarApply />} />
        <Route path="/mypage" element={<MyPage />} />
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
