import { useState, type FormEvent } from "react";
import {
  PlusIcon,
  MicIcon,
  FilterIcon,
  HistoryIcon,
  ArrowRightIcon,
} from "./icons";
import "./SearchBar.css";

interface SearchBarProps {
  onSearch?: (query: string) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch?.(trimmed);
  }

  return (
    <form className="searchbar" onSubmit={handleSubmit} role="search">
      <div className="searchbar__top">
        <input
          className="searchbar__input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="무엇이든 물어보세요"
          aria-label="검색어 입력"
          autoComplete="off"
        />
        <div className="searchbar__tools">
          <button type="button" className="searchbar__icon" aria-label="첨부 추가">
            <PlusIcon />
          </button>
          <button type="button" className="searchbar__icon" aria-label="음성 검색">
            <MicIcon />
          </button>
        </div>
      </div>

      <div className="searchbar__bottom">
        <div className="searchbar__chips">
          <button type="button" className="searchbar__chip">
            <FilterIcon />
            필터
          </button>
          <button type="button" className="searchbar__chip">
            <HistoryIcon />
            최근 검색
          </button>
        </div>
        <button
          type="submit"
          className="searchbar__send"
          aria-label="검색 실행"
          disabled={!query.trim()}
        >
          <ArrowRightIcon />
        </button>
      </div>
    </form>
  );
}
