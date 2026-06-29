import "./SectionTabs.css";

interface SectionTabsProps<T extends string> {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
}

export default function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: SectionTabsProps<T>) {
  return (
    <div className="section-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={tab === active}
          className={"section-tabs__tab" + (tab === active ? " is-active" : "")}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
