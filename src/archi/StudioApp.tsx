import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { firebaseDb, firebaseStorage } from '@/lib/firebase';
import { ADMIN_EMAILS } from '@/lib/adminStore';
import { prisma } from '@archi/db';
import { firestorePersistence, localStoragePersistence } from './db/persistence';
import { setSessionIdentity } from '@archi-web/lib/auth';
import { setStorageBackend } from '@archi-web/lib/storage';
import StudioHome from '@archi-web/pages/StudioHome';
import StudioDocument from '@archi-web/pages/StudioDocument';
import StudioMessenger from '@archi-web/pages/StudioMessenger';
import StudioApps from '@archi-web/pages/StudioApps';
import StudioSettings from '@archi-web/pages/StudioSettings';
import './studio.css';

const StudioWiki = lazy(() => import('@archi-web/pages/StudioWiki'));

/** Identity used when Firebase isn't configured (local demo; data stays in this browser). */
const LOCAL_IDENTITY = { uid: 'local-admin', email: 'local-admin@index.local', name: '로컬 관리자' };

/**
 * ARCHI Agent Studio (ported from leejinsoo1979/inshow_agent), mounted at /agent-studio.
 * Binds the studio's data store, file storage and session to the signed-in index user
 * before any studio page renders.
 */
export default function StudioApp() {
  const { user, loading, configured } = useAuth();
  const allowed = !configured || Boolean(user && ADMIN_EMAILS.includes(user.email ?? ''));
  const identity = !configured
    ? LOCAL_IDENTITY
    : user && allowed
      ? { uid: user.uid, email: user.email ?? '', name: user.displayName }
      : null;
  const identityKey = identity ? `${identity.uid}:${identity.email}` : null;
  const [boundKey, setBoundKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!identity || !identityKey) {
      setSessionIdentity(null);
      setBoundKey(null);
      return;
    }
    const useFirebase = configured && firebaseDb && identity.uid !== LOCAL_IDENTITY.uid;
    prisma.$setPersistence(
      useFirebase ? firestorePersistence(firebaseDb!, identity.uid) : localStoragePersistence(`archi-db:${identity.uid}`),
    );
    setStorageBackend(useFirebase ? firebaseStorage : null, useFirebase ? identity.uid : null);
    setSessionIdentity({ email: identity.email, name: identity.name });
    setLoadError(null);
    let cancelled = false;
    prisma
      .$ready()
      .then(() => !cancelled && setBoundKey(identityKey))
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[archi] workspace load failed', error);
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(
          /permission|insufficient/i.test(message)
            ? 'Firestore 보안 규칙에 archiStudio 경로가 없습니다. firestore.rules / storage.rules를 배포해 주세요.'
            : `워크스페이스 데이터를 불러오지 못했습니다: ${message}`,
        );
      });
    return () => {
      cancelled = true;
    };
    // identity fields are captured by identityKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, configured, attempt]);

  if (loading) return <StudioGate title="확인 중…" />;
  if (configured && !user) {
    return <StudioGate title="로그인이 필요합니다" body="관리자 계정으로 로그인한 뒤 다시 접속해주세요." link={{ to: '/mypage', label: '로그인하러 가기' }} />;
  }
  if (!allowed) {
    return <StudioGate title="접근 권한이 없습니다" body={`${user?.email ?? ''} 계정은 관리자로 등록되어 있지 않습니다.`} link={{ to: '/', label: '홈으로 돌아가기' }} />;
  }
  if (loadError) {
    return <StudioGate title="Agent Studio를 열 수 없습니다" body={loadError} retry={() => setAttempt((n) => n + 1)} />;
  }
  if (boundKey !== identityKey) return <StudioGate title="워크스페이스를 불러오는 중…" />;

  return (
    <div className="archi-studio" key={boundKey}>
      <Routes>
        <Route index element={<StudioHome />} />
        <Route path="wiki" element={<Suspense fallback={<StudioGate title="위키 라이브러리를 불러오는 중…" />}><StudioWiki /></Suspense>} />
        <Route path="knowledge" element={<Navigate to="/agent-studio/wiki" replace />} />
        <Route path="sources" element={<Navigate to="/agent-studio/wiki" replace />} />
        <Route path="messenger" element={<StudioMessenger />} />
        <Route path="apps" element={<StudioApps />} />
        <Route path="apps/:id" element={<StudioApps />} />
        <Route path="ontology" element={<Navigate to="/agent-studio/wiki?view=graph" replace />} />
        <Route path="settings" element={<StudioSettings />} />
        <Route path=":documentId" element={<StudioDocument />} />
      </Routes>
    </div>
  );
}

function StudioGate({
  title,
  body,
  link,
  retry,
}: {
  title: string;
  body?: string;
  link?: { to: string; label: string };
  retry?: () => void;
}) {
  return (
    <div className="archi-studio flex min-h-screen items-center justify-center bg-zinc-50 px-4 text-zinc-900">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold">{title}</p>
        {body && <p className="mt-2 text-sm text-zinc-500">{body}</p>}
        {retry && (
          <button type="button" onClick={retry} className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            다시 시도
          </button>
        )}
        {link && (
          <Link to={link.to} className="mt-5 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            {link.label}
          </Link>
        )}
      </div>
    </div>
  );
}
