import { Link } from "react-router-dom";
import { footerColumns, legalLinks } from "../data/navigation";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            index
          </Link>
          <p className="site-footer__org">한국실내건축가협회</p>
        </div>

        {footerColumns.map((col, i) => (
          <nav key={i} className="site-footer__col" aria-label={`푸터 메뉴 ${i + 1}`}>
            <ul>
              {col.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="site-footer__bottom">
        <p className="site-footer__copy">
          © 2025 한국실내건축가협회 (K-IAA). All rights reserved.
        </p>
        <nav className="site-footer__legal" aria-label="약관">
          {legalLinks.map((link, i) => (
            <span key={link.to}>
              <Link to={link.to}>{link.label}</Link>
              {i < legalLinks.length - 1 && (
                <span className="site-footer__sep">|</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
