import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CustomSelect } from '@/components/ui/custom-select';
import type { WikiPage } from '../../../../wiki/types';
import { parseProcess } from '../../../../wiki/registry';
import type { ProcessModel, ProcessNode } from './types';

type Props = {page:WikiPage;initial:ProcessModel|null;onClose:()=>void;onSave:(value:ProcessModel|null)=>Promise<void>};
const values = (text:string) => text.split(/\n|,/).map(v=>v.trim()).filter(Boolean);
const statusOptions = [{value:'waiting',label:'대기'},{value:'current',label:'진행 중'},{value:'done',label:'완료'},{value:'risk',label:'주의'},{value:'loop',label:'재검토'}];
const typeOptions = [{value:'task',label:'업무'},{value:'gateway',label:'판단·승인'},{value:'notice',label:'안내'},{value:'system',label:'시스템 처리'}];
export default function ProcessEditor({page,initial,onClose,onSave}:Props) {
  const [model,setModel] = useState<ProcessModel>(()=>structuredClone(initial ?? {lanes:['담당자'],stages:['검토'],nodes:[],edges:[]}));
  const [saving,setSaving] = useState(false),[error,setError] = useState('');
  function patchNode(id:string,patch:Partial<ProcessNode>){setModel(m=>({...m,nodes:m.nodes.map(n=>n.id===id?{...n,...patch}:n)}));}
  function definitions(key:'lanes'|'stages',text:string){
    const next=values(text),field=key==='lanes'?'lane':'stage';
    setModel(m=>({...m,[key]:next,nodes:m.nodes.map(n=>({...n,[field]:next[m[key].indexOf(n[field])]??n[field]}))}));
  }
  function addNode(){setModel(m=>({...m,nodes:[...m.nodes,{id:'P-'+crypto.randomUUID(),name:'',lane:m.lanes[0]??'',stage:m.stages[0]??'',actor:'',type:'task',status:'waiting',source_ids:[]}]}));}
  async function save(remove=false){setError('');setSaving(true);try{const next=remove?null:parseProcess(model);if(next?.nodes.some(n=>n.source_ids?.some(id=>!page.sources.some(s=>s.id===id))))throw new Error('이 문서에 연결된 원본 출처를 선택해 주세요.');await onSave(next);}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setSaving(false);}}
  return <div className="kr-process-form">
    <p className="kr-form-intro">원본 자료에 있는 업무와 순서를 작성해 주세요. 저장하면 문서의 편집 이력에도 남습니다.</p>
    <fieldset disabled={saving}>
      <div className="kr-form-definitions"><label>담당 주체<textarea aria-label="담당 주체" defaultValue={model.lanes.join('\n')} onBlur={e=>definitions('lanes',e.target.value)} placeholder="한 줄에 하나씩 입력"/></label><label>진행 단계<textarea aria-label="진행 단계" defaultValue={model.stages.join('\n')} onBlur={e=>definitions('stages',e.target.value)} placeholder="진행 순서대로 한 줄에 하나씩 입력"/></label></div>
      <div className="kr-form-section"><h3>업무 {model.nodes.length}개</h3><button className="kr-command" disabled={model.nodes.length>=120||!model.lanes.length||!model.stages.length} onClick={addNode}><Plus size={14}/>업무 추가</button></div>
      {!model.nodes.length&&<p className="kr-empty-inline">업무를 추가한 뒤 담당자, 단계, 수행 내용과 근거를 작성하세요.</p>}
      {model.nodes.map((node,i)=><details className="kr-task-form" key={node.id} open={model.nodes.length===1?true:undefined}>
        <summary><span>{String(i+1).padStart(2,'0')}</span><strong>{node.name||'새 업무'}</strong><small>{node.lane} · {node.stage}</small></summary>
        <div className="kr-task-fields"><label className="kr-field-wide">업무 이름<input aria-label={`업무 ${i+1} 이름`} value={node.name} maxLength={160} onChange={e=>patchNode(node.id,{name:e.target.value})}/></label>
          <label>담당 주체<CustomSelect aria-label={`업무 ${i+1} 담당 주체`} options={model.lanes} value={node.lane} onValueChange={v=>patchNode(node.id,{lane:v})}/></label>
          <label>진행 단계<CustomSelect aria-label={`업무 ${i+1} 진행 단계`} options={model.stages} value={node.stage} onValueChange={v=>patchNode(node.id,{stage:v})}/></label>
          <label>업무 유형<CustomSelect options={typeOptions} value={node.type} onValueChange={v=>patchNode(node.id,{type:v as ProcessNode['type']})}/></label>
          <label>표시 상태<CustomSelect options={statusOptions} value={node.status} onValueChange={v=>patchNode(node.id,{status:v as ProcessNode['status']})}/></label>
          <label>세부 담당자<input value={node.actor} onChange={e=>patchNode(node.id,{actor:e.target.value})}/></label><label>기한<input value={node.deadline??''} onChange={e=>patchNode(node.id,{deadline:e.target.value})}/></label>
          <label className="kr-field-wide">수행 내용<textarea value={node.action??''} onChange={e=>patchNode(node.id,{action:e.target.value})}/></label>
          <label>필요한 자료<textarea value={(node.input_documents??[]).join('\n')} onChange={e=>patchNode(node.id,{input_documents:e.target.value.split('\n')})} onBlur={e=>patchNode(node.id,{input_documents:values(e.target.value)})}/></label>
          <label>완료 후 남는 자료<textarea value={(node.output_documents??[]).join('\n')} onChange={e=>patchNode(node.id,{output_documents:e.target.value.split('\n')})} onBlur={e=>patchNode(node.id,{output_documents:values(e.target.value)})}/></label>
          <label className="kr-field-wide">주의할 점<textarea value={node.blocker??''} onChange={e=>patchNode(node.id,{blocker:e.target.value})}/></label>
          <div className="kr-field-wide kr-task-sources"><strong>이 업무의 원본 근거</strong>{page.sources.length?page.sources.map(source=><label key={source.id}><input type="checkbox" checked={(node.source_ids??[]).includes(source.id)} onChange={e=>patchNode(node.id,{source_ids:e.target.checked?[...(node.source_ids??[]),source.id]:(node.source_ids??[]).filter(id=>id!==source.id)})}/>{source.title}</label>):<p>문서 편집에서 원본 출처를 먼저 연결해 주세요.</p>}</div>
          <button className="kr-command" onClick={()=>setModel(m=>({...m,nodes:m.nodes.filter(n=>n.id!==node.id),edges:m.edges.filter(e=>e.source!==node.id&&e.target!==node.id)}))}><Trash2 size={13}/>이 업무 삭제</button>
        </div>
      </details>)}
      <div className="kr-form-section"><h3>업무 연결 {model.edges.length}개</h3><button className="kr-command" disabled={model.nodes.length<2||model.edges.length>=400} onClick={()=>setModel(m=>({...m,edges:[...m.edges,{id:crypto.randomUUID(),source:m.nodes[0]!.id,target:m.nodes[1]!.id,type:'sequence',label:''}]}))}><Plus size={14}/>연결 추가</button></div>
      {model.edges.map((edge,i)=>{const patch=(value:Partial<typeof edge>)=>setModel(m=>({...m,edges:m.edges.map(e=>e.id===edge.id?{...e,...value}:e)}));const options=model.nodes.map((n,j)=>({value:n.id,label:`${j+1}. ${n.name||'새 업무'}`}));return <div className="kr-edge-form" key={edge.id}><label>앞선 업무<CustomSelect aria-label={`연결 ${i+1} 시작`} options={options} value={edge.source} onValueChange={v=>patch({source:v})}/></label><span>→</span><label>다음 업무<CustomSelect aria-label={`연결 ${i+1} 도착`} options={options} value={edge.target} onValueChange={v=>patch({target:v})}/></label><label>연결 방식<CustomSelect options={[{value:'sequence',label:'순서'},{value:'message',label:'자료 전달'},{value:'loop',label:'재검토'}]} value={edge.type} onValueChange={v=>patch({type:v as typeof edge.type})}/></label><label>조건·설명<input value={edge.label??''} onChange={e=>patch({label:e.target.value})}/></label><button className="kr-command" aria-label={`연결 ${i+1} 삭제`} onClick={()=>setModel(m=>({...m,edges:m.edges.filter(e=>e.id!==edge.id)}))}><Trash2 size={14}/></button></div>;})}
    </fieldset>
    {error&&<p className="kr-form-error" role="alert">{error}</p>}
    <footer className="kr-form-actions"><button className="kr-command" disabled={saving} onClick={onClose}>취소</button>{initial&&<button className="kr-command" disabled={saving} onClick={()=>void save(true)}>구조도 삭제</button>}<button className="kr-command kr-command--primary" disabled={saving} onClick={()=>void save()}>{saving?'저장 중…':'저장'}</button></footer>
  </div>;
}
