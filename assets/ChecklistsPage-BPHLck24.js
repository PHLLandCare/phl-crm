import{c as React,d as _react,n as supabase,t as c}from"./index-DqsKYlwG.js";
var r=_react(React(),1);
var sb=c();

function ChecklistsPage(){
  var [templates,setTemplates]=r.useState([]);
  var [active,setActive]=r.useState([]);
  var [jobs,setJobs]=r.useState([]);
  var [tab,setTab]=r.useState('templates');
  var [loading,setLoading]=r.useState(true);
  var [toast,setToast]=r.useState('');
  // Template modal
  var [showTmpl,setShowTmpl]=r.useState(false);
  var [editId,setEditId]=r.useState(null);
  var [tmplName,setTmplName]=r.useState('');
  var [tmplDiv,setTmplDiv]=r.useState('');
  var [tmplDesc,setTmplDesc]=r.useState('');
  var [tmplItems,setTmplItems]=r.useState([]);
  var [newItem,setNewItem]=r.useState('');
  var [saving,setSaving]=r.useState(false);
  // Attach modal
  var [showAttach,setShowAttach]=r.useState(false);
  var [attachTmplId,setAttachTmplId]=r.useState('');
  var [attachJobId,setAttachJobId]=r.useState('');
  // Detail modal
  var [showDetail,setShowDetail]=r.useState(false);
  var [detailCk,setDetailCk]=r.useState(null);
  var [detailItems,setDetailItems]=r.useState([]);
  var [detailNotes,setDetailNotes]=r.useState('');
  // Search/filter
  var [search,setSearch]=r.useState('');
  var [filterStatus,setFilterStatus]=r.useState('');

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3500);}

  r.useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    try{
      var [t,a,j]=await Promise.all([
        sb.from('checklist_templates').select('*').order('created_at',{ascending:false}),
        sb.from('job_checklists').select('*').order('created_at',{ascending:false}),
        sb.from('jobs').select('id,title,client_name,status').is('deleted_at',null).order('scheduled_date',{ascending:false}).limit(200)
      ]);
      setTemplates(t.data||[]);
      setActive(a.data||[]);
      setJobs(j.data||[]);
    }catch(e){showToast('Error loading: '+e.message);}
    setLoading(false);
  }

  function openNewTemplate(){
    setEditId(null);setTmplName('');setTmplDiv('');setTmplDesc('');setTmplItems([]);setNewItem('');setShowTmpl(true);
  }
  function openEditTemplate(t){
    setEditId(t.id);setTmplName(t.name||'');setTmplDiv(t.division||'');setTmplDesc(t.description||'');
    setTmplItems((t.items||[]).map(i=>typeof i==='string'?i:(i.label||'')));
    setNewItem('');setShowTmpl(true);
  }
  function addItem(){var txt=newItem.trim();if(!txt)return;setTmplItems(prev=>[...prev,txt]);setNewItem('');}
  function removeItem(idx){setTmplItems(prev=>prev.filter((_,i)=>i!==idx));}

  async function saveTmpl(){
    if(!tmplName.trim()){showToast('Enter a template name');return;}
    if(!tmplItems.length){showToast('Add at least one item');return;}
    setSaving(true);
    var payload={name:tmplName.trim(),division:tmplDiv,description:tmplDesc.trim(),items:tmplItems.map(l=>({label:l,checked:false}))};
    try{
      if(editId){await sb.from('checklist_templates').update(payload).eq('id',editId);}
      else{await sb.from('checklist_templates').insert(payload);}
      showToast(editId?'Template updated!':'Template created!');
      setShowTmpl(false);loadAll();
    }catch(e){showToast('Error: '+e.message);}
    setSaving(false);
  }

  async function deleteTmpl(id){
    if(!confirm('Delete this template?'))return;
    await sb.from('checklist_templates').delete().eq('id',id);
    showToast('Deleted');loadAll();
  }

  function openAttach(tmplId){setAttachTmplId(String(tmplId||''));setAttachJobId('');setShowAttach(true);}

  async function saveAttach(){
    if(!attachJobId){showToast('Select a job');return;}
    if(!attachTmplId){showToast('Select a template');return;}
    var tmpl=templates.find(t=>String(t.id)===String(attachTmplId));
    var job=jobs.find(j=>String(j.id)===String(attachJobId));
    if(!tmpl)return;
    var payload={job_id:parseInt(attachJobId),job_title:job?job.title:'',client_name:job?job.client_name:'',template_id:parseInt(attachTmplId),template_name:tmpl.name,items:(tmpl.items||[]).map(i=>({label:i.label||i,checked:false})),status:'not_started',notes:''};
    try{
      await sb.from('job_checklists').insert(payload);
      showToast('Checklist attached!');setShowAttach(false);loadAll();
    }catch(e){showToast('Error: '+e.message);}
  }

  function openDetail(ck){
    setDetailCk(ck);
    setDetailItems(JSON.parse(JSON.stringify(ck.items||[])));
    setDetailNotes(ck.notes||'');
    setShowDetail(true);
  }

  function toggleDetailItem(idx){
    setDetailItems(prev=>prev.map((item,i)=>i===idx?{...item,checked:!item.checked}:item));
  }

  async function saveDetail(){
    if(!detailCk)return;
    var done=detailItems.filter(i=>i.checked).length;
    var status=done===0?'not_started':done===detailItems.length?'completed':'in_progress';
    setSaving(true);
    try{
      await sb.from('job_checklists').update({items:detailItems,status,notes:detailNotes}).eq('id',detailCk.id);
      showToast('Saved!');setShowDetail(false);loadAll();
    }catch(e){showToast('Error: '+e.message);}
    setSaving(false);
  }

  async function deleteActive(id){
    if(!confirm('Remove this checklist?'))return;
    await sb.from('job_checklists').delete().eq('id',id);
    showToast('Removed');loadAll();
  }

  var filteredActive=active.filter(a=>{
    var mq=!search||(a.job_title||'').toLowerCase().includes(search.toLowerCase())||(a.client_name||'').toLowerCase().includes(search.toLowerCase())||(a.template_name||'').toLowerCase().includes(search.toLowerCase());
    var ms=!filterStatus||a.status===filterStatus;
    return mq&&ms;
  });

  var cardStyle={background:'#0f172a',border:'1px solid #1e293b',borderRadius:12,padding:16,marginBottom:10};
  var btnStyle={padding:'8px 14px',border:'1px solid #1e293b',borderRadius:8,background:'rgba(255,255,255,.05)',color:'#f1f5f9',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'};
  var btnPrimary={...btnStyle,background:'#16a34a',border:'none',color:'#fff'};
  var btnDanger={...btnStyle,color:'#f87171',borderColor:'rgba(248,113,113,.3)'};
  var inputStyle={padding:'9px 12px',background:'#1a2332',border:'1px solid #2d3f55',borderRadius:8,fontSize:13,color:'#f1f5f9',fontFamily:'inherit',outline:'none',width:'100%',boxSizing:'border-box'};
  var labelStyle={fontSize:11,fontWeight:700,color:'#64748b',display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'};
  var statusColor={not_started:'#64748b',in_progress:'#f59e0b',completed:'#22c55e'};
  var statusLabel={not_started:'Not started',in_progress:'In progress',completed:'Completed'};

  return React.createElement(React.Fragment,null,
    // TOAST
    toast && React.createElement('div',{style:{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'#0f172a',color:'#fff',padding:'12px 22px',borderRadius:10,fontSize:13,fontWeight:600,borderLeft:'4px solid #22c55e',zIndex:9999,boxShadow:'0 6px 24px rgba(0,0,0,.5)',whiteSpace:'nowrap'}},toast),

    // MAIN PAGE
    React.createElement('div',{style:{padding:'0 2rem 2rem',maxWidth:1200,margin:'0 auto'}},
      // HEADER
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}},
        React.createElement('div',null,
          React.createElement('h1',{style:{margin:0,fontSize:26,fontWeight:700,color:'#f1f5f9'}},'Checklists'),
          React.createElement('p',{style:{margin:'4px 0 0',fontSize:13,color:'#64748b'}},'Job quality checklists and inspection templates')
        ),
        React.createElement('button',{style:btnPrimary,onClick:openNewTemplate},'+ New template')
      ),

      // TABS
      React.createElement('div',{style:{display:'flex',gap:6,marginBottom:20}},
        React.createElement('button',{style:{...btnStyle,...(tab==='templates'?{background:'rgba(34,197,94,.15)',borderColor:'#22c55e',color:'#4ade80'}:{})},onClick:()=>setTab('templates')},'📋 Templates ('+templates.length+')'),
        React.createElement('button',{style:{...btnStyle,...(tab==='active'?{background:'rgba(34,197,94,.15)',borderColor:'#22c55e',color:'#4ade80'}:{})},onClick:()=>setTab('active')},'✅ Active checklists ('+active.length+')')
      ),

      loading && React.createElement('div',{style:{textAlign:'center',padding:'3rem',color:'#64748b'}},'Loading...'),

      !loading && tab==='templates' && React.createElement('div',null,
        React.createElement('p',{style:{fontSize:12,color:'#64748b',marginBottom:12}},'Reusable templates you can attach to any job.'),
        !templates.length && React.createElement('div',{style:{...cardStyle,textAlign:'center',padding:40,color:'#475569'}},
          React.createElement('div',{style:{fontSize:40,marginBottom:12}},'📋'),
          React.createElement('div',{style:{fontWeight:600,marginBottom:6}},'No templates yet'),
          React.createElement('div',{style:{fontSize:13,color:'#64748b',marginBottom:16}},'Create a template to standardize quality checks for your crews'),
          React.createElement('button',{style:btnPrimary,onClick:openNewTemplate},'+ Create first template')
        ),
        templates.map(t=>{
          var itemCount=(t.items||[]).length;
          var usedCount=active.filter(a=>a.template_id===t.id).length;
          return React.createElement('div',{key:t.id,style:cardStyle},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}},
              React.createElement('div',{style:{flex:1}},
                React.createElement('div',{style:{fontWeight:700,color:'#f1f5f9',fontSize:15,marginBottom:3}},t.name),
                React.createElement('div',{style:{fontSize:12,color:'#64748b'}},
                  (t.division||'All divisions')+' · '+itemCount+' items · used on '+usedCount+' jobs',
                  t.description && React.createElement('span',{style:{display:'block',marginTop:3,color:'#475569'}},t.description)
                )
              ),
              React.createElement('div',{style:{display:'flex',gap:6,flexShrink:0,flexWrap:'wrap'}},
                React.createElement('button',{style:{...btnStyle,color:'#22c55e',borderColor:'rgba(34,197,94,.3)'},onClick:()=>openAttach(t.id)},'🔗 Attach to job'),
                React.createElement('button',{style:btnStyle,onClick:()=>openEditTemplate(t)},'✏️ Edit'),
                React.createElement('button',{style:btnDanger,onClick:()=>deleteTmpl(t.id)},'🗑️')
              )
            ),
            React.createElement('div',{style:{marginTop:10,display:'flex',flexWrap:'wrap',gap:5}},
              (t.items||[]).slice(0,5).map((item,i)=>React.createElement('span',{key:i,style:{fontSize:11,padding:'2px 8px',background:'rgba(255,255,255,.06)',borderRadius:99,color:'#94a3b8'}},item.label||item)),
              (t.items||[]).length>5 && React.createElement('span',{style:{fontSize:11,color:'#475569'}},'+'+((t.items||[]).length-5)+' more')
            )
          );
        })
      ),

      !loading && tab==='active' && React.createElement('div',null,
        React.createElement('div',{style:{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}},
          React.createElement('input',{style:{...inputStyle,maxWidth:260},placeholder:'Search job, client, template...',value:search,onChange:e=>setSearch(e.target.value)}),
          React.createElement('select',{style:{...inputStyle,maxWidth:180},value:filterStatus,onChange:e=>setFilterStatus(e.target.value)},
            React.createElement('option',{value:''},'All statuses'),
            React.createElement('option',{value:'not_started'},'Not started'),
            React.createElement('option',{value:'in_progress'},'In progress'),
            React.createElement('option',{value:'completed'},'Completed')
          ),
          React.createElement('button',{style:{...btnStyle,color:'#22c55e',borderColor:'rgba(34,197,94,.3)'},onClick:()=>openAttach('')},'+ Attach template to job')
        ),
        !filteredActive.length && React.createElement('div',{style:{...cardStyle,textAlign:'center',padding:40,color:'#475569'}},
          React.createElement('div',{style:{fontSize:40,marginBottom:12}},'✅'),
          React.createElement('div',{style:{fontWeight:600,marginBottom:6}},'No active checklists'),
          React.createElement('div',{style:{fontSize:13,color:'#64748b',marginBottom:16}},'Attach a checklist template to a job to get started'),
          React.createElement('button',{style:btnPrimary,onClick:()=>openAttach('')},'+ Attach a checklist')
        ),
        filteredActive.map(a=>{
          var items=a.items||[];
          var done=items.filter(i=>i.checked).length;
          var pct=items.length?Math.round(done/items.length*100):0;
          return React.createElement('div',{key:a.id,style:cardStyle},
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}},
              React.createElement('div',{style:{flex:1}},
                React.createElement('div',{style:{fontWeight:700,color:'#f1f5f9',fontSize:14,marginBottom:2}},a.template_name||'Checklist'),
                React.createElement('div',{style:{fontSize:12,color:'#64748b'}},(a.job_title||'No job linked')+(a.client_name?' · '+a.client_name:'')),
                React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginTop:8}},
                  React.createElement('div',{style:{flex:1,height:5,background:'rgba(255,255,255,.08)',borderRadius:3,overflow:'hidden'}},
                    React.createElement('div',{style:{height:'100%',background:pct===100?'#22c55e':'#3b82f6',width:pct+'%',transition:'width .3s'}})
                  ),
                  React.createElement('span',{style:{fontSize:11,color:'#64748b',whiteSpace:'nowrap'}},done+'/'+items.length),
                  React.createElement('span',{style:{fontSize:10,padding:'2px 8px',borderRadius:99,background:'rgba(255,255,255,.06)',color:statusColor[a.status]||'#64748b',fontWeight:600}},statusLabel[a.status]||a.status)
                )
              ),
              React.createElement('div',{style:{display:'flex',gap:5,flexShrink:0}},
                React.createElement('button',{style:btnPrimary,onClick:()=>openDetail(a)},'📝 Fill out'),
                React.createElement('button',{style:btnDanger,onClick:()=>deleteActive(a.id)},'🗑️')
              )
            )
          );
        })
      )
    ),

    // ── TEMPLATE MODAL ─────────────────────────────────
    showTmpl && React.createElement('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},onClick:e=>{if(e.target===e.currentTarget)setShowTmpl(false);}},
      React.createElement('div',{style:{background:'#0f172a',border:'1px solid #1e293b',borderRadius:16,width:'100%',maxWidth:600,maxHeight:'90vh',overflow:'auto'}},
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px 16px',borderBottom:'1px solid #1e293b'}},
          React.createElement('h2',{style:{margin:0,fontSize:18,fontWeight:700,color:'#f1f5f9'}},editId?'Edit Template':'New Checklist Template'),
          React.createElement('button',{style:{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'},onClick:()=>setShowTmpl(false)},'×')
        ),
        React.createElement('div',{style:{padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}},
          React.createElement('div',null,React.createElement('label',{style:labelStyle},'Template name *'),React.createElement('input',{style:inputStyle,placeholder:'e.g. Lawn Mow Quality Check',value:tmplName,onChange:e=>setTmplName(e.target.value),autoFocus:true})),
          React.createElement('div',null,React.createElement('label',{style:labelStyle},'Division'),React.createElement('select',{style:{...inputStyle,appearance:'auto'},value:tmplDiv,onChange:e=>setTmplDiv(e.target.value)},React.createElement('option',{value:''},'All divisions'),['Lawn & Tree','Irrigation','Extermination','Nursery','Farm','Hardscape'].map(d=>React.createElement('option',{key:d,value:d},d)))),
          React.createElement('div',null,React.createElement('label',{style:labelStyle},'Description (optional)'),React.createElement('input',{style:inputStyle,placeholder:'When to use this template...',value:tmplDesc,onChange:e=>setTmplDesc(e.target.value)})),
          React.createElement('div',null,
            React.createElement('label',{style:labelStyle},'Checklist Items'),
            !tmplItems.length && React.createElement('div',{style:{fontSize:12,color:'#475569',padding:'8px 0'}},'No items yet — add below'),
            tmplItems.map((item,idx)=>React.createElement('div',{key:idx,style:{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:7,marginBottom:4}},
              React.createElement('span',{style:{flex:1,fontSize:13,color:'#f1f5f9'}},item),
              React.createElement('button',{style:{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:18,lineHeight:1},onClick:()=>removeItem(idx)},'×')
            )),
            React.createElement('div',{style:{display:'flex',gap:6}},
              React.createElement('input',{style:{...inputStyle,flex:1},placeholder:'Add item...',value:newItem,onChange:e=>setNewItem(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){addItem();e.preventDefault();}}}),
              React.createElement('button',{style:{...btnPrimary,whiteSpace:'nowrap'},onClick:addItem},'Add')
            )
          )
        ),
        React.createElement('div',{style:{display:'flex',gap:8,justifyContent:'flex-end',padding:'16px 24px',borderTop:'1px solid #1e293b'}},
          React.createElement('button',{style:btnStyle,onClick:()=>setShowTmpl(false)},'Cancel'),
          React.createElement('button',{style:{...btnPrimary,opacity:saving?.7:1},onClick:saveTmpl,disabled:saving},saving?'Saving...':editId?'Save changes':'Save template')
        )
      )
    ),

    // ── ATTACH MODAL ──────────────────────────────────
    showAttach && React.createElement('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},onClick:e=>{if(e.target===e.currentTarget)setShowAttach(false);}},
      React.createElement('div',{style:{background:'#0f172a',border:'1px solid #1e293b',borderRadius:16,width:'100%',maxWidth:440}},
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px 16px',borderBottom:'1px solid #1e293b'}},
          React.createElement('h2',{style:{margin:0,fontSize:18,fontWeight:700,color:'#f1f5f9'}},'Attach Checklist to Job'),
          React.createElement('button',{style:{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'},onClick:()=>setShowAttach(false)},'×')
        ),
        React.createElement('div',{style:{padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}},
          React.createElement('div',null,React.createElement('label',{style:labelStyle},'Job *'),React.createElement('select',{style:{...inputStyle,appearance:'auto'},value:attachJobId,onChange:e=>setAttachJobId(e.target.value)},React.createElement('option',{value:''},'Select job...'),jobs.map(j=>React.createElement('option',{key:j.id,value:j.id},(j.title||'Job #'+j.id)+(j.client_name?' — '+j.client_name:''))))),
          React.createElement('div',null,React.createElement('label',{style:labelStyle},'Template *'),React.createElement('select',{style:{...inputStyle,appearance:'auto'},value:attachTmplId,onChange:e=>setAttachTmplId(e.target.value)},React.createElement('option',{value:''},'Select template...'),templates.map(t=>React.createElement('option',{key:t.id,value:t.id},t.name))))
        ),
        React.createElement('div',{style:{display:'flex',gap:8,justifyContent:'flex-end',padding:'16px 24px',borderTop:'1px solid #1e293b'}},
          React.createElement('button',{style:btnStyle,onClick:()=>setShowAttach(false)},'Cancel'),
          React.createElement('button',{style:btnPrimary,onClick:saveAttach},'Attach')
        )
      )
    ),

    // ── CHECKLIST DETAIL MODAL ──────────────────────────
    showDetail && detailCk && React.createElement('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},onClick:e=>{if(e.target===e.currentTarget)setShowDetail(false);}},
      React.createElement('div',{style:{background:'#0f172a',border:'1px solid #1e293b',borderRadius:16,width:'100%',maxWidth:520,maxHeight:'90vh',overflow:'auto'}},
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px 16px',borderBottom:'1px solid #1e293b'}},
          React.createElement('div',null,
            React.createElement('h2',{style:{margin:0,fontSize:18,fontWeight:700,color:'#f1f5f9'}},detailCk.template_name||'Checklist'),
            React.createElement('p',{style:{margin:'3px 0 0',fontSize:12,color:'#64748b'}},(detailCk.job_title||'')+(detailCk.client_name?' · '+detailCk.client_name:''))
          ),
          React.createElement('button',{style:{background:'none',border:'none',color:'#64748b',fontSize:22,cursor:'pointer'},onClick:()=>setShowDetail(false)},'×')
        ),
        React.createElement('div',{style:{padding:'20px 24px'}},
          React.createElement('div',{style:{fontSize:12,color:'#64748b',marginBottom:14}},detailItems.filter(i=>i.checked).length+' of '+detailItems.length+' items completed'),
          detailItems.map((item,idx)=>React.createElement('label',{key:idx,style:{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:8,marginBottom:6,cursor:'pointer'}},
            React.createElement('input',{type:'checkbox',checked:item.checked,onChange:()=>toggleDetailItem(idx),style:{width:18,height:18,accentColor:'#22c55e',cursor:'pointer'}}),
            React.createElement('span',{style:{fontSize:13,color:item.checked?'#64748b':'#f1f5f9',textDecoration:item.checked?'line-through':'none'}},item.label||item)
          )),
          React.createElement('div',{style:{marginTop:14}},
            React.createElement('label',{style:labelStyle},'Notes / observations'),
            React.createElement('textarea',{style:{...inputStyle,height:80,resize:'vertical'},placeholder:'Optional notes from the field...',value:detailNotes,onChange:e=>setDetailNotes(e.target.value)})
          )
        ),
        React.createElement('div',{style:{display:'flex',gap:8,justifyContent:'flex-end',padding:'16px 24px',borderTop:'1px solid #1e293b'}},
          React.createElement('button',{style:btnStyle,onClick:()=>setShowDetail(false)},'Close'),
          React.createElement('button',{style:{...btnPrimary,opacity:saving?.7:1},onClick:saveDetail,disabled:saving},saving?'Saving...':'Save progress')
        )
      )
    )
  );
}

export{ChecklistsPage as default};
