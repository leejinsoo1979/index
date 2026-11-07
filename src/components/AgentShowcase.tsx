import { Link } from "react-router-dom";
import { agentTools } from "../data/agents";
import { about } from "../data/about";

export default function AgentShowcase() {
  const copy = about.agents;
  return (
    <section className="ab-section ab-section--tint" id="showcase" aria-labelledby="agents-title">
      <div className="ab-wrap">
        <div className="ab-head">
          <div>
            <p className="ab-eyebrow">{copy.eyebrow}</p>
            <h2 className="ab-title" id="agents-title">
              {copy.title}<br /><span className="ab-accent">{copy.titleAccent}</span>
            </h2>
            <p className="ab-lead">{copy.lead}</p>
          </div>
          <div className="ab-bignum">
            <strong>{agentTools.length}</strong>
            <span>AI TOOLS · 실무 도구</span>
          </div>
        </div>
        <div className="ab-tools">
          {agentTools.map((tool) => (
            <Link className="ab-tool" key={tool.id} to={tool.to} target="_blank" rel="noopener noreferrer" aria-label={`${tool.title} 열기 (새 탭)`}>
              <div className="ab-card-image">
                <img src={`${tool.image}-960-v1.jpg`} srcSet={`${tool.image}-480-v1.jpg 480w, ${tool.image}-960-v1.jpg 960w`} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw" width={960} height={640} alt={tool.imageAlt} loading="lazy" decoding="async" />
                <span className="ab-card-image__label">AI 대표 이미지</span>
              </div>
              <div className="ab-tool__body">
                <span className="ab-tool__category">{tool.category}</span>
                <h3>{tool.title}<span aria-hidden="true">↗</span></h3>
                <p>{tool.description}</p>
                <div className="ab-tool__footer"><span>{tool.access}</span><span>도구 열기 <span aria-hidden="true">↗</span></span></div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
