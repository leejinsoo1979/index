import { NavRail } from '@archi-web/components/studio/NavRail';
import Tools from '@/pages/Tools';
import '@/pages/Tools.css';

/** Agent Studio · Apps — the INDEX AI 도구 catalogue inside the studio shell (dark). */
export default function StudioApps() {
  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail />
      <main className="tools-studio min-w-0 flex-1 overflow-y-auto">
        <Tools basePath="/agent-studio/apps" />
      </main>
    </div>
  );
}
