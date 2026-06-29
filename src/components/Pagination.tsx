import { ChevronRightIcon } from "./icons";
import "./Pagination.css";

interface PaginationProps {
  current: number;
  total: number;
  onChange: (page: number) => void;
}

/** Renders first pages then an ellipsis and the last page (mirrors the design). */
export default function Pagination({ current, total, onChange }: PaginationProps) {
  const head = [1, 2, 3, 4, 5].filter((p) => p <= total);
  const showEllipsis = total > 6;

  return (
    <nav className="pagination" aria-label="페이지">
      <button
        className="pagination__arrow"
        aria-label="이전 페이지"
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
      >
        <ChevronRightIcon style={{ transform: "rotate(180deg)" }} />
      </button>

      {head.map((p) => (
        <button
          key={p}
          className={"pagination__page" + (p === current ? " is-active" : "")}
          aria-current={p === current ? "page" : undefined}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}

      {showEllipsis && (
        <>
          <span className="pagination__dots">…</span>
          <button
            className={"pagination__page" + (current === total ? " is-active" : "")}
            onClick={() => onChange(total)}
          >
            {total}
          </button>
        </>
      )}

      <button
        className="pagination__arrow"
        aria-label="다음 페이지"
        disabled={current === total}
        onClick={() => onChange(current + 1)}
      >
        <ChevronRightIcon />
      </button>
    </nav>
  );
}
